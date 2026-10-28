import { randomUUID } from 'node:crypto';
import * as Identity from '@netlify/identity';
const { getUser, admin, verifyRequestOrigin } = Identity;
import { getStore } from '@netlify/blobs';

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
const hasAdminRole = user => {
  const roles = user?.roles || user?.appMetadata?.roles || user?.app_metadata?.roles || [];
  return Array.isArray(roles) && roles.includes('admin');
};
function identityConfig() {
  const config = typeof Identity.getIdentityConfig === 'function' ? Identity.getIdentityConfig() : null;
  if (!config?.url || !config?.token) {
    throw new Error('Netlify Identity is not enabled for this site, or the function has no admin token.');
  }
  return { url: config.url.replace(/\/$/, ''), token: config.token };
}
async function identityPost(path, payload) {
  // @netlify/identity has no invite/recover helpers, so call the Identity (GoTrue)
  // endpoints directly with the operator token the package exposes to functions.
  const { url, token } = identityConfig();
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const detail = body.msg || body.error_description || body.error || body.message || text.slice(0, 200);
    const err = new Error(`${path} failed (${res.status}): ${detail}`);
    err.status = res.status; err.detail = String(detail);
    throw err;
  }
  return body;
}
async function sendInvite(email, name) {
  try { return await identityPost('/invite', { email, data: { full_name: name } }); }
  catch (error) {
    if (error.status === 422 || /already|registered|exists/i.test(error.detail || '')) {
      throw new Error('An account with that email already exists. If they never finished setup, use Resend invite on their row (or Revoke, then invite again).');
    }
    throw error;
  }
}
async function sendPasswordEmail(email) {
  return identityPost('/recover', { email });
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
      // The user receives an email, clicks the link, and chooses their own password.
      // No password is ever generated or shown to the admin.
      const user = await sendInvite(email, name);
      await writeAudit({ at, action: 'sent invitation', actor: actorEmail, targetEmail: email, targetId: user?.id || '' });
      return json({ ok: true, user: { id: user?.id || '', email, name } }, 201);
    }

    if (action === 'recover') {
      const userId = String(body.userId || '').trim();
      if (!userId) return json({ error: 'Missing user ID.' }, 400);
      const existing = await admin.getUser(userId);
      if (hasAdminRole(existing)) return json({ error: 'For safety, reset admin passwords through the Netlify Identity dashboard.' }, 403);
      const email = existing.email || '';
      if (!(existing.confirmedAt || existing.confirmed_at)) return json({ error: 'This user has not accepted their invitation yet. Use Resend invite instead.' }, 400);
      await sendPasswordEmail(email);
      await writeAudit({ at, action: 'sent password email', actor: actorEmail, targetEmail: email, targetId: userId });
      return json({ ok: true, email });
    }

    if (action === 'resend') {
      const userId = String(body.userId || '').trim();
      if (!userId) return json({ error: 'Missing user ID.' }, 400);
      const existing = await admin.getUser(userId);
      if (hasAdminRole(existing)) return json({ error: 'Admin accounts must be managed in the Netlify Identity dashboard.' }, 403);
      if (existing.confirmedAt || existing.confirmed_at) return json({ error: 'This user is already active. Use Send password email instead.' }, 400);
      const email = existing.email || '';
      const name = existing.userMetadata?.full_name || existing.user_metadata?.full_name || existing.name || '';
      // An unconfirmed user cannot be invited twice, so replace the pending account with a fresh invite.
      await admin.deleteUser(userId);
      await sendInvite(email, name);
      await writeAudit({ at, action: 'resent invitation', actor: actorEmail, targetEmail: email, targetId: userId });
      return json({ ok: true, email });
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
