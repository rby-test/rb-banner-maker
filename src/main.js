import './site.css';
import { signup, login, logout, getUser, handleAuthCallback, acceptInvite, requestPasswordRecovery, updateUser } from '@netlify/identity';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(window.location.search);
let currentUser = null;
let pendingInviteToken = null;
let adminPanelOpen = false;
let recoveryMode = false; // true after a password-reset email link is opened

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
function setBusy(form, busy) {
  // Guard against a stale or missing form reference so error handling itself
  // does not throw and hide the original authentication error.
  if (!form || typeof form.querySelectorAll !== 'function') {
    console.warn('[RB Banner Maker] Could not update disabled state: form reference is unavailable.');
    return;
  }
  for (const control of form.querySelectorAll('button,input')) control.disabled = busy;
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
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
  $('authTabs').hidden = false;
  $('loginForm').hidden = !loginMode;
  $('signupForm').hidden = loginMode;
  $('recoveryForm').hidden = true;
  $('inviteSetupForm').hidden = true;
  $('showLoginTab').classList.toggle('active', loginMode);
  $('showSignupTab').classList.toggle('active', !loginMode);
  $('showLoginTab').setAttribute('aria-selected', String(loginMode));
  $('showSignupTab').setAttribute('aria-selected', String(!loginMode));
  $('authHeading').textContent = loginMode ? 'Welcome back' : 'Create your account';
  $('authSubheading').textContent = loginMode ? 'Sign in to your workspace.' : 'Your creative workspace starts here.';
  clearNotice($('authStatus'));
}
function showInviteMode() {
  $('authScreen').hidden = false;
  $('dashboard').hidden = true;
  $('authTabs').hidden = true;
  $('loginForm').hidden = true;
  $('signupForm').hidden = true;
  $('recoveryForm').hidden = true;
  $('inviteSetupForm').hidden = false;
  $('authHeading').textContent = 'Accept your invitation';
  $('authSubheading').textContent = 'Choose your password to activate your account.';
  $('sessionLabel').textContent = 'Complete account setup';
  clearNotice($('authStatus'));
  $('invitePassword').focus();
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
  const mustSetPassword = needsPasswordChange(currentUser) || recoveryMode;
  $('changePasswordPanel').hidden = !mustSetPassword;
  $('openMaker').hidden = mustSetPassword;
  $('logoutButton').hidden = false;
  if (mustSetPassword) {
    $('welcomeText').textContent = recoveryMode ? 'Choose a new password to finish resetting your account.' : 'Set a new password to continue.';
  }
  const admin = hasAdminRole(currentUser);
  $('adminPanel').hidden = !(admin && adminPanelOpen);
  $('adminLoginCard').hidden = true;
  if (admin && adminPanelOpen) {
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
    return `<tr data-user-row="${escapeHTML(user.id)}"><td class="user-cell"><strong>${escapeHTML(user.name || 'Unnamed user')}</strong><small>${escapeHTML(user.email || '')}</small></td><td>${admin ? '<span class="pill">ADMIN</span>' : 'User'}</td><td>${user.confirmedAt ? (user.lastSignInAt ? 'Active · ' + escapeHTML(new Date(user.lastSignInAt).toLocaleDateString()) : 'Active') : '<span class="pill">INVITED</span>'}</td><td><div class="row-actions">${admin ? '' : (user.confirmedAt ? `<button type="button" data-action="recover" data-id="${escapeHTML(user.id)}" data-email="${escapeHTML(user.email || '')}">Send password email</button>` : `<button type="button" data-action="resend" data-id="${escapeHTML(user.id)}" data-email="${escapeHTML(user.email || '')}">Resend invite</button>`)}<button type="button" data-action="delete" data-id="${escapeHTML(user.id)}" data-email="${escapeHTML(user.email || '')}" ${admin ? 'disabled title="Manage admin accounts from Netlify Identity"' : ''}>Revoke</button></div></td></tr>`;
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
async function sendInvitation(userPayload) {
  await adminFetch('POST', {action: 'create', ...userPayload});
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
  const form = event.currentTarget;
  event.preventDefault(); clearNotice($('authStatus')); setBusy(form, true);
  try { await login($('loginEmail').value.trim(), $('loginPassword').value); const user = await getUser(); render(user); }
  catch (error) { showNotice($('authStatus'), error.message || 'Login failed. Check your email and password.', true); }
  finally { setBusy(form, false); }
});
$('signupForm').addEventListener('submit', async event => {
  const form = event.currentTarget;
  event.preventDefault(); clearNotice($('authStatus'));
  const password = $('signupPassword').value;
  if (password !== $('signupConfirm').value) { showNotice($('authStatus'), 'The passwords do not match.', true); return; }
  setBusy(form, true);
  try {
    const email = $('signupEmail').value.trim();
    await signup(email, password, {full_name: $('signupName').value.trim()});

    // Netlify Identity sends an email-confirmation link by default. Keep the
    // next step visible instead of switching straight to the logged-in screen.
    $('loginEmail').value = email;
    $('signupPassword').value = '';
    $('signupConfirm').value = '';
    showAuthMode('login');
    $('authHeading').textContent = 'Check your email';
    $('authSubheading').textContent = 'Confirm your email address, then return here to log in.';
    showNotice(
      $('authStatus'),
      `Your registration was submitted for ${email}. Open your email inbox and click the RB Banner Maker confirmation link to activate your account. If you do not see the message, check Spam/Junk. After confirming, return here and log in.`,
      false
    );
  } catch (error) {
    // Keep the raw failure in the browser console so an operator can diagnose
    // Identity configuration/network errors without hiding the useful details.
    console.error('[RB Banner Maker] Sign-up request failed:', error);
    const detail = typeof error === 'string'
      ? error
      : (error?.message || error?.error_description || error?.msg || error?.error || '');
    const status = [
      error?.status, error?.statusCode, error?.cause?.status,
      error?.cause?.statusCode, error?.response?.status, error?.cause?.response?.status
    ].find(value => Number.isFinite(Number(value)) && Number(value) > 0);
    const message = Number(status) === 404
      ? 'Netlify Identity returned HTTP 404. The Identity service is not available for this site yet. Open this exact site in Netlify → Project configuration → Identity, click Enable Identity, then set Registration preferences to Open. If Identity is already enabled, confirm this is the same Netlify site/domain and that its deployment uses HTTPS.'
      : (detail
          ? String(detail)
          : 'Sign-up failed because the authentication service returned no readable error. Check that Identity is enabled for this exact Netlify site and Registration preferences are set to Open, then try again.');
    showNotice($('authStatus'), message, true);
  }
  finally { setBusy(form, false); }
});
$('cancelInviteSetup').addEventListener('click', () => {
  pendingInviteToken = null;
  $('invitePassword').value = '';
  $('invitePasswordConfirm').value = '';
  showAuthMode('login');
  showNotice($('authStatus'), 'Invitation setup was cancelled. If you still need access, ask the administrator to send a new invitation.');
});
$('inviteSetupForm').addEventListener('submit', async event => {
  const form = event.currentTarget;
  event.preventDefault();
  clearNotice($('authStatus'));
  const password = $('invitePassword').value;
  const confirmPassword = $('invitePasswordConfirm').value;
  if (password.length < 8) {
    showNotice($('authStatus'), 'Use a password with at least 8 characters.', true);
    return;
  }
  if (password !== confirmPassword) {
    showNotice($('authStatus'), 'The passwords do not match. Please try again.', true);
    return;
  }
  if (!pendingInviteToken) {
    showNotice($('authStatus'), 'This invitation link is missing or expired. Ask the administrator to send a new invitation.', true);
    return;
  }
  setBusy(form, true);
  try {
    // Netlify Identity invitations remain unconfirmed until this token is
    // accepted. The invited user chooses their own password here.
    const acceptedUser = await acceptInvite(pendingInviteToken, password);
    pendingInviteToken = null;
    $('invitePassword').value = '';
    $('invitePasswordConfirm').value = '';
    currentUser = acceptedUser || await getUser().catch(() => null);
    if (currentUser) {
      render(currentUser);
      $('welcomeText').textContent = 'Invitation accepted. Your RB Banner Maker account is ready.';
    } else {
      render(null);
      showAuthMode('login');
      showNotice($('authStatus'), 'Invitation accepted. Your account is active; please log in with your email and the password you just created.');
    }
  } catch (error) {
    console.error('[RB Banner Maker] Invitation acceptance failed:', error);
    const detail = error?.message || error?.msg || error?.error_description || '';
    const status = error?.status || error?.cause?.status;
    const message = Number(status) === 404
      ? 'This invitation link was already used or has been replaced by a newer one. If you already chose a password, go back to login and sign in. If you forgot it, use “Forgot password?” on the login page. Otherwise ask the administrator to click Resend invite and use the newest email.'
      : (detail.includes('invalid_grant') || detail.toLowerCase().includes('expired') || detail.toLowerCase().includes('invalid token')
        ? 'This invitation link is invalid, expired, or has already been used. Ask the administrator to send a fresh invitation, then open the new email link and choose a password here.'
        : (detail || 'We could not accept this invitation. Ask the administrator to send a new invitation and try again.'));
    showNotice($('authStatus'), message, true);
  } finally {
    setBusy(form, false);
  }
});
$('recoveryForm').addEventListener('submit', async event => {
  const form = event.currentTarget;
  event.preventDefault(); clearNotice($('authStatus')); setBusy(form, true);
  try { await requestPasswordRecovery($('recoveryEmail').value.trim()); showNotice($('authStatus'), 'If the address is registered, a recovery email will be sent.'); }
  catch (error) { showNotice($('authStatus'), error.message || 'Could not request password recovery.', true); }
  finally { setBusy(form, false); }
});
$('logoutButton').addEventListener('click', async () => { try { await logout(); } finally { currentUser = null; adminPanelOpen = false; render(null); } });
$('changePasswordForm').addEventListener('submit', async event => {
  const form = event.currentTarget;
  event.preventDefault(); clearNotice($('changePasswordStatus'));
  const password = $('newPassword').value;
  if (password !== $('confirmNewPassword').value) { showNotice($('changePasswordStatus'), 'The passwords do not match.', true); return; }
  if (password.length < 8) { showNotice($('changePasswordStatus'), 'Use at least 8 characters.', true); return; }
  setBusy(form, true);
  try {
    await updateUser({password, data: {must_change_password: false}});
    recoveryMode = false;
    const user = await getUser(); render(user); showNotice($('changePasswordStatus'), 'Password updated. Your workspace is ready.');
  } catch (error) { showNotice($('changePasswordStatus'), error.message || 'Could not update password.', true); }
  finally { setBusy(form, false); }
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
  const form = event.currentTarget;
  event.preventDefault(); clearNotice($('adminLoginStatus')); setBusy(form, true);
  try {
    if (currentUser) await logout();
    await login($('adminLoginEmail').value.trim(), $('adminLoginPassword').value);
    const user = await getUser();
    if (!hasAdminRole(user)) { await logout(); render(null); throw new Error('This account is not authorized for admin access. Assign the admin role in Netlify Identity first.'); }
    adminPanelOpen = true; render(user); $('adminPanel').scrollIntoView({behavior:'smooth',block:'start'});
  } catch (error) { showNotice($('adminLoginStatus'), error.message || 'Admin sign-in failed.', true); }
  finally { setBusy(form, false); }
});
$('createUserForm').addEventListener('submit', async event => {
  const form = event.currentTarget;
  event.preventDefault(); clearNotice($('createUserStatus')); setBusy(form, true);
  try {
    const email = $('adminNewEmail').value.trim();
    await sendInvitation({name: $('adminNewName').value.trim(), email});
    showNotice($('createUserStatus'), `Invitation sent to ${email}. They will click the link in the email and choose their own password.`);
    $('createUserForm').reset();
  } catch (error) { showNotice($('createUserStatus'), error.message || 'Could not send invitation.', true); }
  finally { setBusy(form, false); }
});
$('usersTable').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action; const id = button.dataset.id; const email = button.dataset.email; const name = button.dataset.name || email;
  try {
    if (action === 'recover') {
      if (!confirm(`Email ${email} a link to set a new password? Their current password keeps working until they use it.`)) return;
      await adminFetch('POST', {action:'recover', userId:id});
      showNotice($('usersStatus'), `Password email sent to ${email}. They click the link and choose a new password.`);
    } else if (action === 'resend') {
      if (!confirm(`Send ${email} a fresh invitation? Their previous invite link will stop working.`)) return;
      await adminFetch('POST', {action:'resend', userId:id});
      showNotice($('usersStatus'), `New invitation sent to ${email}.`);
      await loadAdminData();
    } else if (action === 'delete') {
      if (!confirm(`Permanently delete ${email} and revoke their account? This cannot be undone.`)) return;
      await adminFetch('POST', {action:'delete', userId:id});
      showNotice($('usersStatus'), `Access revoked for ${email}.`);
      await loadAdminData();
    }
  } catch (error) { showNotice($('usersStatus'), error.message || 'The action failed.', true); }
});
$('refreshUsers').addEventListener('click', () => loadAdminData().catch(error => showNotice($('usersStatus'), error.message || 'Could not refresh users.', true)));
// Initialize asynchronous authentication without top-level await so Vite can
// compile to its configured ES2020/browser targets.
async function initializeAuth() {
  // Netlify puts invite/confirmation/recovery tokens in the URL hash, not the
  // query string. Capture the invite token before processing the callback.
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const inviteTokenFromHash = hashParams.get('invite_token');
  let callbackResult = null;
  try {
    callbackResult = await handleAuthCallback();
  } catch (error) {
    console.error('[RB Banner Maker] Auth callback failed:', error);
    if (inviteTokenFromHash) {
      pendingInviteToken = inviteTokenFromHash;
      render(null);
      showInviteMode();
      showNotice($('authStatus'), 'Your invitation link was received, but the callback could not be completed automatically. Try choosing a password below. If it fails, request a fresh invitation.', true);
      return;
    }
    const hadAuthToken = /(?:confirmation_token|recovery_token|email_change_token)/.test(window.location.hash);
    if (hadAuthToken) {
      showNotice($('authStatus'), error.message || 'The account link could not be processed. Request a fresh link and try again.', true);
    }
  }

  if (callbackResult?.type === 'invite' && callbackResult.token) {
    pendingInviteToken = callbackResult.token;
    render(null);
    showInviteMode();
    return;
  }

  // A password-reset email link signs the user in; make them choose the new password now.
  if (callbackResult?.type === 'recovery') recoveryMode = true;

  currentUser = await getUser().catch(() => null);
  if (currentUser && needsPasswordChange(currentUser)) showAuthMode('login');
  render(currentUser);
  if (qs.get('admin') === '1') $('adminLoginCard').hidden = false;
}

void initializeAuth();
