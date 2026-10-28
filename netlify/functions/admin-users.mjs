import { randomBytes, randomUUID } from 'node:crypto';
import { getUser, admin, verifyRequestOrigin } from '@netlify/identity';
import { getStore } from '@netlify/blobs';

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
const hasAdminRole = user => {
  const roles = user?.roles || user?.appMetadata?.roles || user?.app_metadata?.roles || [];
  return Array.isArray(roles) && roles.includes('admin');
};
function makeTemporaryPassword() {
  // Cryptographically random, URL-safe characters plus a few guaranteed character classes.
  return `${randomBytes(20).toString('base64url')}!Aa7`;
}
async function writeAudit(event) {
  try {
    const store = getStore('rb-banner-maker-admin-audit');
    await store.setJSON(`event/${Date.now()}-${randomUUID()}.json`, event);
  } catch (error) {
    // Do not fail a completed user-management operation if logging has a temporary outage.
    console.error('RB admin audit write failed:', error?.message || error);
  }
}
async function readAudit(limit = 100) {
  try {
    const store = getStore('rb-banner-maker-admin-audit');
    const listing = await store.list({ prefix: 'event/' });
    const blobs = (listing.blobs || []).sort((a, b) => b.key.localeCompare(a.key)).slice(0, limit);
    const events = await Promise.all(blobs.map(async blob => {
      try { return await store.get(blob.key, { type: 'json' }); }
      catch { return null; }
    }));
    return events.filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  } catch (error) {
    console.error('RB admin audit read failed:', error?.message || error);
    return [];
  }
}
async function listUsers() {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await admin.listUsers({ page, perPage: 100 });
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.map(user => ({
    id: user.id,
    email: user.email || '',
    name: user.userMetadata?.full_name || user.user_metadata?.full_name || user.name || '',
    roles: Array.isArray(user.roles) ? user.roles : (Array.isArray(user.appMetadata?.roles) ? user.appMetadata.roles : []),
    createdAt: user.createdAt || user.created_at || null,
    lastSignInAt: user.lastSignInAt || user.last_sign_in_at || null,
    confirmedAt: user.confirmedAt || user.confirmed_at || null
  }));
}

export default async function handler(request) {
  if (!['GET', 'POST'].includes(request.method)) {
    return json({ error: 'Method not allowed.' }, 405);
  }
  if (request.method === 'POST') {
    try { verifyRequestOrigin(request); }
    catch { return json({ error: 'Request origin was rejected.' }, 403); }
  }

  let actor;
  try { actor = await getUser(); }
  catch { actor = null; }
  if (!actor) return json({ error: 'Please sign in first.' }, 401);
  if (!hasAdminRole(actor)) return json({ error: 'Admin permission is required.' }, 403);

  if (request.method === 'GET') {
    try {
      const [users, events] = await Promise.all([listUsers(), readAudit(100)]);
      return json({ users, events });
    } catch (error) {
      console.error('RB admin list failed:', error?.message || error);
      return json({ error: 'Could not load Identity users. Confirm that Netlify Identity is enabled.' }, 500);
    }
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON request.' }, 400); }

  try {
    const action = String(body.action || '');
    const at = new Date().toISOString();
    const actorEmail = actor.email || 'admin';

    if (action === 'create') {
      const name = String(body.name || '').trim().slice(0, 80);
      const email = String(body.email || '').trim().toLowerCase();
      if (!name) return json({ error: 'Enter the user’s name.' }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
      const password = makeTemporaryPassword();
      const user = await admin.createUser({
        email,
        password,
        data: { user_metadata: { full_name: name, must_change_password: true } }
      });
      await writeAudit({ at, action: 'created account', actor: actorEmail, targetEmail: email, targetId: user.id });
      return json({
        ok: true,
        password,
        user: { id: user.id, email: user.email || email, name: user.userMetadata?.full_name || user.user_metadata?.full_name || name, roles: user.roles || [] }
      }, 201);
    }

    if (action === 'reset') {
      const userId = String(body.userId || '').trim();
      if (!userId) return json({ error: 'Missing user ID.' }, 400);
      const existing = await admin.getUser(userId);
      if (hasAdminRole(existing)) return json({ error: 'For safety, reset admin passwords through the Netlify Identity dashboard.' }, 403);
      const email = existing.email || String(body.email || '');
      const name = existing.userMetadata?.full_name || existing.user_metadata?.full_name || existing.name || '';
      const password = makeTemporaryPassword();
      const metadata = existing.userMetadata || existing.user_metadata || {};
      await admin.updateUser(userId, {
        password,
        user_metadata: { ...metadata, full_name: name, must_change_password: true }
      });
      await writeAudit({ at, action: 'reset password', actor: actorEmail, targetEmail: email, targetId: userId });
      return json({ ok: true, password, user: { id: userId, email, name } });
    }

    if (action === 'delete') {
      const userId = String(body.userId || '').trim();
      if (!userId) return json({ error: 'Missing user ID.' }, 400);
      if (userId === actor.id) return json({ error: 'You cannot revoke your own admin account here.' }, 403);
      const existing = await admin.getUser(userId);
      if (hasAdminRole(existing)) return json({ error: 'For safety, admin accounts must be managed in the Netlify Identity dashboard.' }, 403);
      const email = existing.email || String(body.email || '');
      await admin.deleteUser(userId);
      await writeAudit({ at, action: 'revoked account', actor: actorEmail, targetEmail: email, targetId: userId });
      return json({ ok: true });
    }

    return json({ error: 'Unknown admin action.' }, 400);
  } catch (error) {
    const message = String(error?.message || 'Unexpected server error.');
    console.error('RB admin operation failed:', message);
    const looksDuplicate = /already exists|duplicate|registered/i.test(message);
    return json({ error: looksDuplicate ? 'An account with that email already exists.' : message }, looksDuplicate ? 409 : 400);
  }
}
