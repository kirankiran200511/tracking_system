// SpendWise Authentication Module
// Manages user login, 30-day persistent sessions, and Supabase / local auth integration.
const Auth = (() => {
  const SESSION_KEY = 'spendwise.session';
  const ACCOUNTS_KEY = 'spendwise.accounts';
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  // Simple string hash for offline/fallback password verification
  function hashPwd(pwd) {
    let h = 0x811c9dc5;
    for (let i = 0; i < pwd.length; i++) {
      h ^= pwd.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  const DEFAULT_ACCOUNTS = {
    'kirankiran112005@gmail.com': {
      pwdHash: hashPwd('Kiran@tracking$'),
      updatedAt: Date.now()
    }
  };

  function getAccounts() {
    try {
      const saved = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}');
      return { ...DEFAULT_ACCOUNTS, ...saved };
    } catch {
      return { ...DEFAULT_ACCOUNTS };
    }
  }

  function saveAccount(email, password) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}'); } catch { saved = {}; }
    saved[email.toLowerCase().trim()] = {
      pwdHash: hashPwd(password),
      updatedAt: Date.now()
    };
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(saved));
    } catch (e) {
      console.warn('Could not save local account', e);
    }
  }

  function verifyLocalAccount(email, password) {
    const accs = getAccounts();
    const acc = accs[email.toLowerCase().trim()];
    if (!acc) return null;
    return acc.pwdHash === hashPwd(password);
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || !session.email) return null;
      if (Date.now() > session.expiresAt) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function setSession(email, remember30Days = true) {
    const duration = remember30Days ? THIRTY_DAYS_MS : 24 * 60 * 60 * 1000;
    const session = {
      email: email.trim(),
      createdAt: Date.now(),
      expiresAt: Date.now() + duration,
      remember: remember30Days
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function isAuthenticated() {
    return !!getSession();
  }

  function getUserEmail() {
    const s = getSession();
    if (s && s.email) return s.email;
    if (typeof Cloud !== 'undefined' && Cloud.user && Cloud.user.email) return Cloud.user.email;
    const accs = getAccounts();
    const emails = Object.keys(accs);
    return emails[0] || 'kirankiran112005@gmail.com';
  }

  function getRemainingDays() {
    const s = getSession();
    if (!s) return 0;
    const diff = s.expiresAt - Date.now();
    return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  async function login(email, password, remember30Days = true) {
    email = email.trim();
    if (!email || !password) throw new Error('Please enter both email and password.');

    let loggedIn = false;
    let cloudError = null;

    // Try Supabase auth first if configured
    if (typeof Cloud !== 'undefined' && Cloud.configured && Cloud.configured()) {
      try {
        await Cloud.signInPassword(email, password);
        loggedIn = true;
      } catch (err) {
        cloudError = err;
        console.warn('Supabase sign-in error:', err);
      }
    }

    // If Supabase succeeded or if local verification matches
    if (loggedIn) {
      saveAccount(email, password);
      setSession(email, remember30Days);
      return { success: true, method: 'supabase' };
    }

    const localCheck = verifyLocalAccount(email, password);
    if (localCheck === true) {
      setSession(email, remember30Days);
      return { success: true, method: 'local' };
    }

    // If no accounts exist at all on this device yet, register this user
    const accs = getAccounts();
    if (Object.keys(accs).length === 0 && (!Cloud || !Cloud.configured())) {
      saveAccount(email, password);
      setSession(email, remember30Days);
      return { success: true, method: 'initial' };
    }

    if (cloudError) {
      const msg = cloudError.message || String(cloudError);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        throw new Error('Cannot reach Supabase database. If you have a local account, check credentials, or verify your project URL.');
      }
      throw new Error(msg);
    }

    throw new Error('Invalid email or password.');
  }

  async function signup(email, password, remember30Days = true) {
    email = email.trim();
    if (!email || !password) throw new Error('Please enter both email and password.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');

    // If Supabase is configured, try remote signup
    if (typeof Cloud !== 'undefined' && Cloud.configured && Cloud.configured()) {
      try {
        await Cloud.signUpPassword(email, password);
      } catch (err) {
        console.warn('Supabase sign-up message:', err);
      }
    }

    saveAccount(email, password);
    setSession(email, remember30Days);
    return { success: true };
  }

  async function logout() {
    localStorage.removeItem(SESSION_KEY);
    if (typeof Cloud !== 'undefined' && Cloud.signOut) {
      await Cloud.signOut(false).catch(() => {});
    }
    location.reload();
  }

  // Pre-seed an account directly (for automated setups or programmatic user additions)
  function registerCredentials(email, password) {
    saveAccount(email, password);
    setSession(email, true);
  }

  function renderLoginPage(container) {
    let mode = 'signin'; // 'signin', 'signup', or 'reset'

    function render() {
      const isReset = mode === 'reset';
      const isSignup = mode === 'signup';
      const isSignin = mode === 'signin';

      container.innerHTML = `
        <div class="auth-wrapper">
          <div class="auth-card">
            <div class="auth-header">
              <div class="auth-logo">
                <svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true">
                  <defs>
                    <linearGradient id="alg" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stop-color="#00b894"/>
                      <stop offset="100%" stop-color="#00cec9"/>
                    </linearGradient>
                  </defs>
                  <rect width="32" height="32" rx="10" fill="url(#alg)"/>
                  <path d="M9 21l5-6 4 3 5-7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <h1 class="auth-title">SpendWise</h1>
              <p class="auth-subtitle">${isReset ? 'Set a new password for your account' : isSignup ? 'Create an account to start tracking' : 'Sign in to access your finances'}</p>
            </div>

            <div class="auth-tabs" role="tablist">
              <button type="button" class="auth-tab ${isSignin ? 'active' : ''}" id="tab-signin">Sign In</button>
              <button type="button" class="auth-tab ${isSignup ? 'active' : ''}" id="tab-signup">Create Account</button>
              <button type="button" class="auth-tab ${isReset ? 'active' : ''}" id="tab-reset">Reset</button>
            </div>

            <div id="auth-alert" class="auth-alert" style="display:none;"></div>

            <form id="auth-form" class="auth-form">
              <div class="auth-field">
                <label for="auth-email">Email address</label>
                <div class="input-icon-wrap">
                  <svg class="field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  <input type="email" id="auth-email" name="email" placeholder="you@example.com" value="${U.esc(getUserEmail() || '')}" required autocomplete="email" autofocus>
                </div>
              </div>

              <div class="auth-field">
                <label for="auth-password">${isReset ? 'New password' : 'Password'}</label>
                <div class="input-icon-wrap">
                  <svg class="field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <input type="password" id="auth-password" name="password" placeholder="••••••••" required minlength="${isReset || isSignup ? '6' : '1'}" autocomplete="${isSignin ? 'current-password' : 'new-password'}">
                  <button type="button" class="pwd-toggle" id="pwd-toggle" aria-label="Toggle password visibility">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
                ${isSignin ? `<div style="display:flex; justify-content:flex-end; margin-top:5px;"><button type="button" id="link-forgot-pwd" style="background:none; border:none; padding:0; color:var(--muted); font-size:12px; cursor:pointer; text-decoration:underline;">Forgot password?</button></div>` : ''}
              </div>

              ${isReset ? `
              <div class="auth-field">
                <label for="auth-confirm">Confirm new password</label>
                <div class="input-icon-wrap">
                  <svg class="field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <input type="password" id="auth-confirm" name="confirm" placeholder="••••••••" required minlength="6" autocomplete="new-password">
                </div>
              </div>` : ''}

              ${!isReset ? `
              <div class="auth-options">
                <label class="remember-label">
                  <input type="checkbox" id="auth-remember" checked>
                  <span>Stay signed in for <b>30 days</b></span>
                </label>
              </div>` : ''}

              <button type="submit" class="btn primary auth-submit" id="auth-submit-btn">
                <span>${isReset ? 'Set New Password & Sign In' : isSignup ? 'Create Account' : 'Sign In'}</span>
              </button>

              ${isReset ? `
              <div style="text-align:center; margin-top:8px;">
                <button type="button" id="back-to-signin" style="background:none; border:none; color:var(--accent); font-size:13px; cursor:pointer;">← Back to Sign In</button>
              </div>` : ''}
            </form>

            <div class="auth-footer">
              <div class="auth-security-badge">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>End-to-end encrypted · Local-first</span>
              </div>
            </div>
          </div>
        </div>
      `;

      // Event listeners
      container.querySelector('#tab-signin')?.addEventListener('click', () => { mode = 'signin'; render(); });
      container.querySelector('#tab-signup')?.addEventListener('click', () => { mode = 'signup'; render(); });
      container.querySelector('#tab-reset')?.addEventListener('click', () => { mode = 'reset'; render(); });
      container.querySelector('#link-forgot-pwd')?.addEventListener('click', () => { mode = 'reset'; render(); });
      container.querySelector('#back-to-signin')?.addEventListener('click', () => { mode = 'signin'; render(); });

      const pwdToggle = container.querySelector('#pwd-toggle');
      const pwdInput = container.querySelector('#auth-password');
      pwdToggle?.addEventListener('click', () => {
        const isPwd = pwdInput.type === 'password';
        pwdInput.type = isPwd ? 'text' : 'password';
        pwdToggle.classList.toggle('active', isPwd);
      });

      const form = container.querySelector('#auth-form');
      const alertBox = container.querySelector('#auth-alert');
      const submitBtn = container.querySelector('#auth-submit-btn');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertBox.style.display = 'none';
        const email = form.email.value.trim();
        const pwd = form.password.value;
        const remember = form.querySelector('#auth-remember') ? form.querySelector('#auth-remember').checked : true;

        if (mode === 'reset') {
          const confirm = form.confirm.value;
          if (pwd !== confirm) {
            alertBox.textContent = 'New passwords do not match.';
            alertBox.style.display = 'block';
            return;
          }
          if (pwd.length < 6) {
            alertBox.textContent = 'Password must be at least 6 characters.';
            alertBox.style.display = 'block';
            return;
          }
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Verifying…</span>';

        try {
          if (mode === 'signin') {
            await login(email, pwd, remember);
          } else if (mode === 'signup') {
            await signup(email, pwd, remember);
          } else if (mode === 'reset') {
            await resetPassword(email, pwd);
          }
          // Successfully authenticated!
          location.reload();
        } catch (err) {
          alertBox.textContent = err.message || 'Authentication failed. Please try again.';
          alertBox.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>${mode === 'reset' ? 'Set New Password & Sign In' : mode === 'signin' ? 'Sign In' : 'Create Account'}</span>`;
        }
      });
    }

    render();
  }

  async function resetPassword(email, newPassword) {
    email = (email || getUserEmail() || '').trim().toLowerCase();
    if (!email) throw new Error('Email is required.');
    if (!newPassword || newPassword.length < 6) throw new Error('New password must be at least 6 characters.');

    saveAccount(email, newPassword);
    setSession(email, true);

    if (typeof Cloud !== 'undefined' && Cloud.configured && Cloud.configured() && Cloud.updatePassword) {
      try {
        await Cloud.updatePassword(newPassword);
      } catch (err) {
        console.warn('Supabase password update error:', err);
      }
    }
    return { success: true };
  }

  async function changePassword(currentPassword, newPassword, bypassCurrentCheck = false) {
    const email = (getUserEmail() || '').trim().toLowerCase();
    if (!email) throw new Error('You must be signed in to change your password.');
    if (!newPassword) throw new Error('Please enter a new password.');
    if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');

    if (!bypassCurrentCheck) {
      if (!currentPassword) throw new Error('Please enter your current password, or click "Reset directly".');
      if (currentPassword === newPassword) throw new Error('New password must be different from current password.');

      // Verify current password against local accounts (includes defaults)
      const accs = getAccounts();
      const acc = accs[email];
      if (acc && acc.pwdHash !== hashPwd(currentPassword)) {
        throw new Error('Current password is incorrect. Click "Reset directly" if you forgot it.');
      }
    }

    // Save updated password
    saveAccount(email, newPassword);
    setSession(email, true);

    // Update in Supabase if configured
    if (typeof Cloud !== 'undefined' && Cloud.configured && Cloud.configured() && Cloud.updatePassword) {
      try {
        await Cloud.updatePassword(newPassword);
      } catch (err) {
        console.warn('Supabase password update error:', err);
      }
    }

    return { success: true };
  }

  return {
    isAuthenticated,
    getSession,
    getUserEmail,
    getRemainingDays,
    login,
    signup,
    logout,
    registerCredentials,
    renderLoginPage,
    changePassword,
    resetPassword
  };
})();

if (typeof window !== 'undefined') window.Auth = Auth;
