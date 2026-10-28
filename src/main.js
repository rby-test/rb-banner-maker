import './site.css';
import { signup, login, logout, getUser, handleAuthCallback, requestPasswordRecovery, updateUser } from '@netlify/identity';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(window.location.search);
let currentUser = null;
let adminPanelOpen = false;
const CREDENTIAL_LOG_KEY = 'rbBannerMakerCredentialLogV1';

function hasAdminRole(user) {
  const roles = user?.roles || user?.appMetadata?.roles || user?.app_metadata?.roles || [];
  return Array.isArray(roles) && roles.includes('admin');
}
function needsPasswordChange(user) {
  return user?.userMetadata?.must_change_password === true || user?.user_metadata?.must_change_password === true;
}
function fullName(user) {
  return user?.userMetadata?.full_name || user?.user_metadata?.full_name || user?.email || 'Creator';
}
function showNotice(element, message, error = false) {
  element.textContent = message;
  element.hidden = false;
  element.classList.toggle('error', error);
}
function clearNotice(element) { element.hidden = true; element.textContent = ''; element.classList.remove('error'); }
function setBusy(form, busy) { for (const control of form.querySelectorAll('button,input')) control.disabled = busy; }
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function getCredentialLog() {
  try { const parsed = JSON.parse(localStorage.getItem(CREDENTIAL_LOG_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function saveCredentialLog(entries) {
  try { localStorage.setItem(CREDENTIAL_LOG_KEY, JSON.stringify(entries.slice(0, 500))); }
  catch { alert('The local credential log could not be saved. Export credentials immediately and keep the file private.'); }
  renderCredentialLog();
}
function appendCredentialLog(entry) {
  const entries = getCredentialLog();
  entries.unshift(entry);
  saveCredentialLog(entries);
}
function renderCredentialLog() {
  const entries = getCredentialLog();
  const container = $('credentialLogList');
  if (!container) return;
  if (!entries.length) { container.innerHTML = '<p class="empty-state">No credentials issued from this browser yet.</p>'; return; }
  container.innerHTML = entries.slice(0, 50).map(entry => `<div class="log-item"><strong>${escapeHTML(entry.name || entry.email)} · ${escapeHTML(entry.action)}</strong><small>${escapeHTML(entry.email)} · ${escapeHTML(new Date(entry.at).toLocaleString())}</small><small>Password: <code>${escapeHTML(entry.password)}</code></small></div>`).join('');
}
function downloadCSV(filename, rows) {
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function showAuthMode(mode) {
  const loginMode = mode === 'login';
  $('loginForm').hidden = !loginMode;
  $('signupForm').hidden = loginMode;
  $('recoveryForm').hidden = true;
  $('showLoginTab').classList.toggle('active', loginMode);
  $('showSignupTab').classList.toggle('active', !loginMode);
  $('showLoginTab').setAttribute('aria-selected', String(loginMode));
  $('showSignupTab').setAttribute('aria-selected', String(!loginMode));
  $('authHeading').textContent = loginMode ? 'Welcome back' : 'Create your account';
  $('authSubheading').textContent = loginMode ? 'Sign in to your workspace.' : 'Your creative workspace starts here.';
  clearNotice($('authStatus'));
}
function render(user) {
  currentUser = user || null;
  const loggedIn = Boolean(currentUser);
  $('authScreen').hidden = loggedIn;
  $('dashboard').hidden = !loggedIn;
  $('sessionLabel').textContent = loggedIn ? (hasAdminRole(currentUser) ? 'Admin session' : 'Signed in') : 'Secure workspace';
  if (!loggedIn) {
    $('adminPanel').hidden = true;
    // Keep the restricted login card's current visibility; the top-right button controls it.
    if (qs.get('auth') === 'required') showNotice($('authStatus'), 'Please sign in before opening RB Banner Maker.');
    if (qs.get('changePassword') === '1') showNotice($('authStatus'), 'Sign in, then set a new password to finish activating your account.');
    return;
  }
  $('welcomeText').textContent = `${fullName(currentUser)} · ${currentUser.email || ''}`;
  $('changePasswordPanel').hidden = !needsPasswordChange(currentUser);
  $('openMaker').hidden = needsPasswordChange(currentUser);
  $('logoutButton').hidden = false;
  if (needsPasswordChange(currentUser)) {
    $('welcomeText').textContent = 'Your administrator issued a temporary password. Set a new one to continue.';
  }
  const admin = hasAdminRole(currentUser);
  $('adminPanel').hidden = !(admin && adminPanelOpen);
  $('adminLoginCard').hidden = true;
  if (admin && adminPanelOpen) {
    renderCredentialLog();
    loadAdminData().catch(error => showNotice($('usersStatus'), error.message || 'Could not load admin data.', true));
  }
}
async function adminFetch(method = 'GET', body = null) {
  const response = await fetch('/.netlify/functions/admin-users', {
    method, credentials: 'include', headers: body ? {'Content-Type':'application/json'} : {},
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Admin request failed (${response.status}).`);
  return data;
}
function renderUsers(users) {
  const tbody = $('usersTable');
  if (!users?.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No registered users found.</td></tr>'; return; }
  tbody.innerHTML = users.map(user => {
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const admin = roles.includes('admin');
    return `<tr data-user-row="${escapeHTML(user.id)}"><td class="user-cell"><strong>${escapeHTML(user.name || 'Unnamed user')}</strong><small>${escapeHTML(user.email || '')}</small></td><td>${admin ? '<span class="pill">ADMIN</span>' : 'User'}</td><td>${escapeHTML(user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString() : 'Not yet')}</td><td><div class="row-actions"><button type="button" data-action="reset" data-id="${escapeHTML(user.id)}" data-email="${escapeHTML(user.email || '')}" data-name="${escapeHTML(user.name || '')}">Reset pass</button><button type="button" data-action="delete" data-id="${escapeHTML(user.id)}" data-email="${escapeHTML(user.email || '')}" ${admin ? 'disabled title="Manage admin accounts from Netlify Identity"' : ''}>Revoke</button></div></td></tr>`;
  }).join('');
}
async function loadAdminData() {
  clearNotice($('usersStatus'));
  $('usersTable').innerHTML = '<tr><td colspan="4" class="empty-state">Loading users…</td></tr>';
  const data = await adminFetch('GET');
  renderUsers(data.users || []);
  const activity = $('activityLogList');
  const events = data.events || [];
  activity.innerHTML = events.length ? events.map(e => `<div class="log-item"><strong>${escapeHTML(e.action)} · ${escapeHTML(e.targetEmail || '—')}</strong><small>${escapeHTML(e.actor || 'Admin')} · ${escapeHTML(new Date(e.at).toLocaleString())}</small></div>`).join('') : '<p class="empty-state">No server activity recorded yet.</p>';
}
async function issueCredential(action, userPayload) {
  const data = await adminFetch('POST', {action, ...userPayload});
  const user = data.user || {};
  const password = data.password;
  appendCredentialLog({action: action === 'create' ? 'created' : 'password reset', name: user.name || userPayload.name || userPayload.email || '', email: user.email || userPayload.email || '', password, at: new Date().toISOString()});
  $('issuedCredential').hidden = false;
  $('issuedCredential').innerHTML = `<strong>${action === 'create' ? 'ACCOUNT CREATED' : 'TEMPORARY PASSWORD GENERATED'}</strong><div>${escapeHTML(user.name || userPayload.name || '')} · ${escapeHTML(user.email || userPayload.email || '')}</div><code id="issuedPasswordValue">${escapeHTML(password)}</code><div class="issued-actions"><button type="button" id="copyIssuedPassword">Copy password</button><button type="button" id="downloadIssuedCredential">Download this credential</button></div><small class="tiny muted">The user must change this temporary password after their first sign-in.</small>`;
  $('copyIssuedPassword').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(password); showNotice($('createUserStatus'), 'Password copied. Share it with the user privately.'); }
    catch { showNotice($('createUserStatus'), 'Copy failed; select the password above and copy it manually.', true); }
  });
  $('downloadIssuedCredential').addEventListener('click', () => downloadCSV('rb-user-credential.csv', [['Name','Email','Temporary password','Action','Created at'], [user.name || userPayload.name || '', user.email || userPayload.email || '', password, action, new Date().toISOString()]]));
  await loadAdminData();
}

$('showLoginTab').addEventListener('click', () => showAuthMode('login'));
$('showSignupTab').addEventListener('click', () => showAuthMode('signup'));
$('showRecovery').addEventListener('click', () => {
  $('loginForm').hidden = true; $('signupForm').hidden = true; $('recoveryForm').hidden = false;
  $('authHeading').textContent = 'Recover password'; $('authSubheading').textContent = 'We will send a secure recovery link.'; clearNotice($('authStatus'));
});
$('backToLogin').addEventListener('click', () => showAuthMode('login'));
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); clearNotice($('authStatus')); setBusy(event.currentTarget, true);
  try { await login($('loginEmail').value.trim(), $('loginPassword').value); const user = await getUser(); render(user); }
  catch (error) { showNotice($('authStatus'), error.message || 'Login failed. Check your email and password.', true); }
  finally { setBusy(event.currentTarget, false); }
});
$('signupForm').addEventListener('submit', async event => {
  event.preventDefault(); clearNotice($('authStatus'));
  const password = $('signupPassword').value;
  if (password !== $('signupConfirm').value) { showNotice($('authStatus'), 'The passwords do not match.', true); return; }
  setBusy(event.currentTarget, true);
  try {
    const user = await signup($('signupEmail').value.trim(), password, {full_name: $('signupName').value.trim()});
    const active = await getUser().catch(() => null);
    if (active) render(active);
    else showNotice($('authStatus'), `Account created for ${user.email || $('signupEmail').value}. Check your email for a confirmation link, then log in.`);
  } catch (error) { showNotice($('authStatus'), error.message || 'Sign-up failed. Please try again.', true); }
  finally { setBusy(event.currentTarget, false); }
});
$('recoveryForm').addEventListener('submit', async event => {
  event.preventDefault(); clearNotice($('authStatus')); setBusy(event.currentTarget, true);
  try { await requestPasswordRecovery($('recoveryEmail').value.trim()); showNotice($('authStatus'), 'If the address is registered, a recovery email will be sent.'); }
  catch (error) { showNotice($('authStatus'), error.message || 'Could not request password recovery.', true); }
  finally { setBusy(event.currentTarget, false); }
});
$('logoutButton').addEventListener('click', async () => { try { await logout(); } finally { currentUser = null; adminPanelOpen = false; render(null); } });
$('changePasswordForm').addEventListener('submit', async event => {
  event.preventDefault(); clearNotice($('changePasswordStatus'));
  const password = $('newPassword').value;
  if (password !== $('confirmNewPassword').value) { showNotice($('changePasswordStatus'), 'The passwords do not match.', true); return; }
  if (password.length < 8) { showNotice($('changePasswordStatus'), 'Use at least 8 characters.', true); return; }
  setBusy(event.currentTarget, true);
  try {
    await updateUser({password, data: {full_name: fullName(currentUser), must_change_password: false}});
    const user = await getUser(); render(user); showNotice($('changePasswordStatus'), 'Password updated. Your workspace is ready.');
  } catch (error) { showNotice($('changePasswordStatus'), error.message || 'Could not update password.', true); }
  finally { setBusy(event.currentTarget, false); }
});

$('adminTrigger').addEventListener('click', () => {
  if (hasAdminRole(currentUser)) {
    adminPanelOpen = !adminPanelOpen;
    render(currentUser);
    if (adminPanelOpen) $('adminPanel').scrollIntoView({behavior:'smooth', block:'start'});
  } else {
    $('adminLoginCard').hidden = !$('adminLoginCard').hidden;
    if (!$('adminLoginCard').hidden) $('adminLoginEmail').focus();
  }
});
$('closeAdminLogin').addEventListener('click', () => { $('adminLoginCard').hidden = true; clearNotice($('adminLoginStatus')); });
$('adminLoginForm').addEventListener('submit', async event => {
  event.preventDefault(); clearNotice($('adminLoginStatus')); setBusy(event.currentTarget, true);
  try {
    if (currentUser) await logout();
    await login($('adminLoginEmail').value.trim(), $('adminLoginPassword').value);
    const user = await getUser();
    if (!hasAdminRole(user)) { await logout(); render(null); throw new Error('This account is not authorized for admin access. Assign the admin role in Netlify Identity first.'); }
    adminPanelOpen = true; render(user); $('adminPanel').scrollIntoView({behavior:'smooth',block:'start'});
  } catch (error) { showNotice($('adminLoginStatus'), error.message || 'Admin sign-in failed.', true); }
  finally { setBusy(event.currentTarget, false); }
});
$('createUserForm').addEventListener('submit', async event => {
  event.preventDefault(); clearNotice($('createUserStatus')); $('issuedCredential').hidden = true; setBusy(event.currentTarget, true);
  try {
    await issueCredential('create', {name: $('adminNewName').value.trim(), email: $('adminNewEmail').value.trim()});
    showNotice($('createUserStatus'), 'Account created. Share the temporary password privately; the user must change it after signing in.');
    $('createUserForm').reset();
  } catch (error) { showNotice($('createUserStatus'), error.message || 'Could not create account.', true); }
  finally { setBusy(event.currentTarget, false); }
});
$('usersTable').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action; const id = button.dataset.id; const email = button.dataset.email; const name = button.dataset.name || email;
  try {
    if (action === 'reset') {
      if (!confirm(`Generate a temporary password for ${email}? Their current password will stop working.`)) return;
      $('issuedCredential').hidden = true;
      await issueCredential('reset', {userId:id, email, name});
      showNotice($('createUserStatus'), `Temporary password generated for ${email}. Share it privately.`);
    } else if (action === 'delete') {
      if (!confirm(`Permanently delete ${email} and revoke their account? This cannot be undone.`)) return;
      await adminFetch('POST', {action:'delete', userId:id});
      showNotice($('usersStatus'), `Access revoked for ${email}.`);
      await loadAdminData();
    }
  } catch (error) { showNotice($('usersStatus'), error.message || 'The action failed.', true); }
});
$('refreshUsers').addEventListener('click', () => loadAdminData().catch(error => showNotice($('usersStatus'), error.message || 'Could not refresh users.', true)));
$('exportCredentialLog').addEventListener('click', () => {
  const entries = getCredentialLog();
  downloadCSV('rb-credential-log.csv', [['Name','Email','Password','Action','Issued at'], ...entries.map(e => [e.name,e.email,e.password,e.action,e.at])]);
});
$('clearCredentialLog').addEventListener('click', () => {
  if (!confirm('Clear the saved credentials from this browser? This cannot be undone.')) return;
  localStorage.removeItem(CREDENTIAL_LOG_KEY); renderCredentialLog();
});

try { await handleAuthCallback(); } catch (error) {
  if (window.location.search.includes('confirmation_token') || window.location.search.includes('recovery_token') || window.location.search.includes('invite_token')) {
    showNotice($('authStatus'), error.message || 'The account link could not be processed. Request a fresh link and try again.', true);
  }
}
currentUser = await getUser().catch(() => null);
if (currentUser && needsPasswordChange(currentUser)) showAuthMode('login');
render(currentUser);
if (qs.get('admin') === '1') { $('adminLoginCard').hidden = false; }
