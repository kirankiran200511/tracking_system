// Supabase cloud sync. The app stays local-first: the browser copy is always used,
// and this module keeps it in sync with Supabase (pull remote changes, then push local ones).
//
// Change detection: we remember a hash of every record as it was last synced. Anything whose
// current hash differs is pushed; anything that disappeared locally is soft-deleted remotely.
// When both sides changed the same record, the local edit wins (it is pushed right after).
const Cloud = (() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
  const CFG_KEY = 'spendwise.cloud';
  const OWNER_KEY = 'spendwise.owner';
  const BUCKET = 'documents';
  const PAGE = 1000;
  const CHUNK = 500;
  const COLLECTIONS = ['budgets', 'goals', 'assets', 'rules', 'docs', 'subscriptions', 'emis'];
  const KINDS = ['txns', ...COLLECTIONS, 'settings', 'categories'];

  let sb = null, user = null, meta = null;
  let status = 'off', lastError = '';
  let syncing = null, again = false, applying = false;
  const listeners = new Set();

  // ---------- config ----------
  function config() {
    const file = window.SPENDWISE_CONFIG || {};
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch {}
    return { url: (file.supabaseUrl || saved.url || '').trim(), key: (file.supabaseAnonKey || saved.key || '').trim(), fromFile: !!file.supabaseUrl };
  }
  const configured = () => { const c = config(); return !!(c.url && c.key); };

  function saveConfig(url, key) {
    url = url.trim().replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new Error('The Project URL should look like https://abcd1234.supabase.co');
    if (key.trim().split('.').length !== 3 && !/^sb_publishable_/.test(key.trim())) throw new Error('That does not look like an anon / publishable key');
    localStorage.setItem(CFG_KEY, JSON.stringify({ url, key: key.trim() }));
    location.reload();
  }
  function disconnect() {
    localStorage.removeItem(CFG_KEY);
    localStorage.removeItem('spendwise-auth');
    location.reload();
  }

  // ---------- status ----------
  function setStatus(s, err = '') { status = s; lastError = err; listeners.forEach((fn) => fn()); }
  const onChange = (fn) => listeners.add(fn);

  // ---------- helpers ----------
  const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object'
    ? `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v ?? null));
  function hash(obj) {
    const s = stable(obj);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + s.length.toString(36);
  }
  const metaKey = () => `spendwise.sync.${user.id}`;
  function loadMeta() { try { return JSON.parse(localStorage.getItem(metaKey()) || 'null'); } catch { return null; } }
  function saveMeta() { try { localStorage.setItem(metaKey(), JSON.stringify(meta)); } catch (e) { console.warn('sync meta', e); } }

  const settingsData = () => { const { theme, ...rest } = Store.state.settings; return rest; }; // theme stays per device

  function localRecords() {
    const st = Store.state;
    const out = { txns: new Map(st.txns.map((t) => [t.id, t])) };
    COLLECTIONS.forEach((k) => (out[k] = new Map(st[k].map((x) => [x.id, x]))));
    out.settings = new Map([['settings', settingsData()]]);
    out.categories = new Map([['categories', { list: st.categories }]]);
    return out;
  }

  const txnToRow = (t) => ({
    user_id: user.id, id: t.id, date: t.date, amount: t.amount, type: t.type, category: t.category, payee: t.payee, workspace: t.workspace,
    method: t.method, note: t.note, tags: t.tags, reimbursable: t.reimbursable, reimbursed: t.reimbursed, goal_id: t.goalId, link_id: t.linkId, doc_ids: t.docIds,
    source: t.source, created_ms: t.createdAt, deleted: false,
  });
  const rowToTxn = (r) => Store.normTxn({
    id: r.id, date: r.date, amount: Number(r.amount), type: r.type, category: r.category, payee: r.payee, workspace: r.workspace, method: r.method,
    note: r.note, tags: r.tags || [], reimbursable: r.reimbursable, reimbursed: r.reimbursed, goalId: r.goal_id, linkId: r.link_id, docIds: r.doc_ids || [],
    source: r.source, createdAt: Number(r.created_ms) || Date.now(),
  });

  // ---------- init & auth ----------
  async function init() {
    if (!configured()) return setStatus('off');
    setStatus('connecting');
    try { await U.loadScript(LIB); } catch { return setStatus('offline', 'Could not load the Supabase library — are you offline?'); }
    const c = config();
    try {
      sb = supabase.createClient(c.url, c.key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'spendwise-auth' } });
    } catch (e) { return setStatus('error', e.message); }
    Store.hooks.fetchFile = downloadFile;
    Store.hooks.deleteFile = deleteRemoteFile;
    // never await Supabase calls inside this callback (it holds an auth lock) — defer instead
    sb.auth.onAuthStateChange((_event, session) => setTimeout(() => onAuth(session), 0));
    const { data, error } = await sb.auth.getSession();
    if (location.search.includes('code=') || location.search.includes('error')) {
      const err = new URLSearchParams(location.search).get('error_description');
      if (err) U.toast(err, 'error');
      history.replaceState(null, '', location.pathname + location.hash);
    }
    if (error) setStatus('error', error.message);
    await onAuth(data?.session);
    window.addEventListener('focus', () => user && sync());
    window.addEventListener('online', () => user && sync());
    window.addEventListener('offline', () => user && setStatus('offline'));
    Store.on(schedulePush);
    setInterval(() => user && document.visibilityState === 'visible' && sync(), 60000);
  }

  let authBusy = false;
  async function onAuth(session) {
    const next = session?.user || null;
    if (!next && !user) { if (status === 'connecting' || status === 'idle') setStatus('signed-out'); return; }
    if ((next?.id || null) === (user?.id || null) || authBusy) return;
    authBusy = true;
    try {
      user = next;
      if (!user) { meta = null; return setStatus('signed-out'); }
      meta = loadMeta();
      if (!meta) await firstLink();
      else { setStatus('idle'); await sync(); }
    } finally { authBusy = false; }
  }

  // First time this account is used on this device: merge or replace local data.
  async function firstLink() {
    const st = Store.state;
    const owner = localStorage.getItem(OWNER_KEY);
    const otherAccount = owner && owner !== user.id;
    const hasLocal = st.txns.length || st.assets.length || st.goals.length || st.budgets.length;
    const onlySample = st.txns.length > 0 && st.txns.every((t) => t.source === 'sample');
    let mode = 'merge';
    if (hasLocal) mode = await askLinkMode({ otherAccount, onlySample });
    meta = { lastPulled: null, hashes: {} };
    if (mode === 'cloud') {
      applying = true;
      Store.reset();
      applying = false;
      // treat the fresh defaults as already-synced so the cloud's settings/categories win
      const local = localRecords();
      KINDS.forEach((k) => { meta.hashes[k] = {}; local[k].forEach((obj, id) => (meta.hashes[k][id] = hash(obj))); });
    }
    localStorage.setItem(OWNER_KEY, user.id);
    saveMeta();
    await sync({ full: true });
    if (mode === 'merge' && hasLocal) U.toast('This device’s data is now backed up to your cloud', 'success');
  }

  function askLinkMode({ otherAccount, onlySample }) {
    return new Promise((resolve) => {
      App.modal(`
        <div class="modal-head"><h2>Connect this device to your cloud</h2></div>
        <p>${otherAccount ? 'This device has data from a <b>different account</b>.' : 'This device already has data on it.'} What should happen to it?</p>
        <div class="choice-list">
          <button class="choice" data-mode="merge"><b>Upload & merge</b><span>Keep this device’s data and add it to your cloud account${onlySample ? ' (this is only sample data)' : ''}.</span></button>
          <button class="choice" data-mode="cloud"><b>Use cloud data only</b><span>Remove this device’s copy and load what’s in your cloud account.${onlySample ? ' Recommended — the local data is sample data.' : ''}</span></button>
        </div>
        <p class="muted small">Tip: download a backup first from Settings if you’re unsure.</p>`);
      U.$$('.choice').forEach((b) => b.addEventListener('click', () => { App.closeModal(); resolve(b.dataset.mode); }));
    });
  }

  async function signInEmail(email) {
    if (location.protocol === 'file:') throw new Error('Start SpendWise with npm start (http://localhost:5173) to sign in.');
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
  }
  async function signInGoogle() {
    if (location.protocol === 'file:') throw new Error('Start SpendWise with npm start (http://localhost:5173) to sign in.');
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) throw error;
  }
  async function signOut(wipeLocal) {
    if (user) await sync();
    await sb.auth.signOut();
    if (wipeLocal) { applying = true; Store.reset(); applying = false; localStorage.removeItem(OWNER_KEY); }
  }

  // ---------- sync ----------
  let pushTimer;
  function schedulePush() {
    if (applying || !user || !meta) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => sync(), 2500);
  }

  async function sync({ full } = {}) {
    if (!user || !meta || !sb) return;
    if (syncing) { again = true; return syncing; }
    syncing = (async () => {
      setStatus('syncing');
      try {
        if (!navigator.onLine) throw new Error('offline');
        await pull(full);
        await push();
        meta.lastSync = Date.now();
        saveMeta();
        setStatus('synced');
      } catch (e) {
        console.warn('Sync failed', e);
        setStatus(navigator.onLine ? 'error' : 'offline', e.message || String(e));
      }
    })();
    await syncing;
    syncing = null;
    if (again) { again = false; return sync(); }
  }

  async function pull(full) {
    const since = full ? null : meta.lastPulled;
    let maxTs = meta.lastPulled;
    const local = localRecords();
    const isDirty = (kind, id) => {
      const known = meta.hashes[kind]?.[id];
      const obj = local[kind].get(id);
      return obj ? hash(obj) !== known : known !== undefined; // changed locally, or deleted locally but not pushed yet
    };
    let changed = false;
    for (const table of ['transactions', 'records']) {
      for (let from = 0; ; from += PAGE) {
        let q = sb.from(table).select('*').order('updated_at', { ascending: true }).range(from, from + PAGE - 1);
        if (since) q = q.gt('updated_at', since);
        const { data, error } = await q;
        if (error) throw error;
        for (const row of data) {
          const kind = table === 'transactions' ? 'txns' : row.kind;
          if (!KINDS.includes(kind)) continue;
          if (!maxTs || row.updated_at > maxTs) maxTs = row.updated_at;
          if (isDirty(kind, row.id)) continue;
          applyRemote(kind, row);
          changed = true;
        }
        if (data.length < PAGE) break;
      }
    }
    meta.lastPulled = maxTs;
    if (changed) {
      const st = Store.state;
      st.txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
      U.setLocale(st.settings.locale, st.settings.currency);
      applying = true;
      Store.commit();
      applying = false;
    }
  }

  function applyRemote(kind, row) {
    const st = Store.state;
    const h = (meta.hashes[kind] ||= {});
    if (row.deleted) {
      if (kind === 'txns') st.txns = st.txns.filter((t) => t.id !== row.id);
      else if (COLLECTIONS.includes(kind)) st[kind] = st[kind].filter((x) => x.id !== row.id);
      delete h[row.id];
      return;
    }
    let obj;
    if (kind === 'txns') {
      obj = rowToTxn(row);
      const i = st.txns.findIndex((t) => t.id === obj.id);
      i >= 0 ? (st.txns[i] = obj) : st.txns.push(obj);
    } else if (kind === 'settings') {
      Object.assign(st.settings, row.data);
      obj = settingsData();
    } else if (kind === 'categories') {
      if (Array.isArray(row.data?.list) && row.data.list.length) st.categories = row.data.list;
      obj = { list: st.categories };
    } else {
      obj = row.data;
      const i = st[kind].findIndex((x) => x.id === row.id);
      i >= 0 ? (st[kind][i] = obj) : st[kind].push(obj);
    }
    h[row.id] = hash(obj);
  }

  async function push() {
    await uploadPendingFiles();
    const local = localRecords();
    const upTx = [], upRec = [], delTx = [], delRec = {}, newHashes = [];
    let known = 0, deletions = 0;
    for (const kind of KINDS) {
      const h = meta.hashes[kind] || {};
      known += Object.keys(h).length;
      local[kind].forEach((obj, id) => {
        const hh = hash(obj);
        if (hh === h[id]) return;
        newHashes.push([kind, id, hh]);
        if (kind === 'txns') upTx.push(txnToRow(obj));
        else upRec.push({ user_id: user.id, kind, id, data: obj, deleted: false });
      });
      Object.keys(h).forEach((id) => {
        if (local[kind].has(id)) return;
        deletions++;
        if (kind === 'txns') delTx.push(id); else (delRec[kind] ||= []).push(id);
      });
    }
    // Guard against wiping the cloud by accident (e.g. "Erase everything" or loading sample data).
    if (deletions > 25 && deletions > known * 0.3) {
      const ok = confirm(`This will delete ${deletions} records from your cloud account (on every device). Continue?\n\nChoose Cancel to restore them from the cloud instead.`);
      if (!ok) { meta.hashes = {}; meta.lastPulled = null; await pull(true); return; }
    }
    for (let i = 0; i < upTx.length; i += CHUNK) {
      const { error } = await sb.from('transactions').upsert(upTx.slice(i, i + CHUNK), { onConflict: 'user_id,id' });
      if (error) throw error;
    }
    for (let i = 0; i < upRec.length; i += CHUNK) {
      const { error } = await sb.from('records').upsert(upRec.slice(i, i + CHUNK), { onConflict: 'user_id,kind,id' });
      if (error) throw error;
    }
    for (let i = 0; i < delTx.length; i += 200) {
      const { error } = await sb.from('transactions').update({ deleted: true }).eq('user_id', user.id).in('id', delTx.slice(i, i + 200));
      if (error) throw error;
    }
    for (const [kind, ids] of Object.entries(delRec)) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb.from('records').update({ deleted: true }).eq('user_id', user.id).eq('kind', kind).in('id', ids.slice(i, i + 200));
        if (error) throw error;
      }
    }
    newHashes.forEach(([kind, id, hh]) => ((meta.hashes[kind] ||= {})[id] = hh));
    delTx.forEach((id) => delete meta.hashes.txns[id]);
    Object.entries(delRec).forEach(([kind, ids]) => ids.forEach((id) => delete meta.hashes[kind][id]));
  }

  // ---------- files ----------
  async function uploadPendingFiles() {
    let touched = false;
    for (const d of Store.state.docs) {
      if (!d.hasFile || d.remotePath) continue;
      const dataUrl = await Store.getFile(d.id).catch(() => null);
      if (!dataUrl) continue;
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${user.id}/${d.id}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: d.mime || blob.type || 'application/octet-stream' });
      if (error) { console.warn('Upload failed for', d.name, error); continue; }
      d.remotePath = path;
      touched = true;
    }
    if (touched) { applying = true; Store.commit(true); applying = false; }
  }
  async function downloadFile(doc) {
    if (!sb || !user) return null;
    const { data, error } = await sb.storage.from(BUCKET).download(doc.remotePath);
    if (error) throw error;
    return U.readFileAs(data);
  }
  async function deleteRemoteFile(doc) {
    if (!sb || !user) return;
    await sb.storage.from(BUCKET).remove([doc.remotePath]);
  }

  // ---------- UI ----------
  const LABELS = {
    off: ['○', 'Local only'], connecting: ['◌', 'Connecting…'], 'signed-out': ['○', 'Signed out'], idle: ['◌', 'Ready'],
    syncing: ['⟳', 'Syncing…'], synced: ['✓', 'Synced'], offline: ['⚠', 'Offline'], error: ['⚠', 'Sync error'],
  };
  function pill() {
    const [icon, label] = LABELS[status] || LABELS.off;
    return `<a href="#/settings" class="cloud-pill st-${status}" title="${U.esc(lastError || label)}"><span class="cp-icon${status === 'syncing' ? ' spin' : ''}">${icon}</span><span class="hide-sm">${label}</span></a>`;
  }

  function renderSettings(host) {
    const c = config();
    const onFile = location.protocol === 'file:';
    let body;
    if (!configured()) {
      body = `
        <p class="muted small">Back up and sync across devices with your own free Supabase project. Run <code>supabase/schema.sql</code> in its SQL editor first (see README).</p>
        <form class="grid-form" id="cl-cfg">
          <label class="full">Project URL<input name="url" placeholder="https://abcd1234.supabase.co" required></label>
          <label class="full">Anon / publishable key<input name="key" placeholder="eyJhbGciOi… or sb_publishable_…" required></label>
          <div class="row-end full"><button class="btn primary">Connect</button></div>
        </form>
        <p class="muted small">Only ever paste the <b>anon/publishable</b> key here — never the service_role/secret key.</p>`;
    } else if (!user) {
      body = `
        <p class="muted small">Connected to <code>${U.esc(new URL(c.url).hostname)}</code>. Sign in to start syncing.</p>
        ${onFile ? '<p class="notice">Open SpendWise via <b>npm start</b> (http://localhost:5173) — sign-in links can’t return to a file.</p>' : ''}
        ${status === 'offline' || status === 'error' ? `<p class="notice">${U.esc(lastError)}</p>` : ''}
        <form class="inline" id="cl-email"><input type="email" name="email" placeholder="you@example.com" required autocomplete="email"><button class="btn primary">Email me a sign-in link</button></form>
        <div class="or"><span>or</span></div>
        <button class="btn" id="cl-google"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2H12v3.8h6c-.1 1-.8 2.4-2.2 3.4l3.4 2.6c2-1.9 3.4-4.6 3.4-7.8Z"/><path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.4-2.6c-.9.6-2.1 1-3.8 1-2.9 0-5.3-1.9-6.2-4.5L2.3 17c1.8 3.6 5.5 6 9.7 6Z"/><path fill="#FBBC05" d="M5.8 14.3c-.2-.7-.4-1.4-.4-2.3s.1-1.6.4-2.3L2.3 7C1.5 8.5 1 10.2 1 12s.5 3.5 1.3 5l3.5-2.7Z"/><path fill="#EA4335" d="M12 5.3c2 0 3.4.9 4.2 1.6l3.1-3C17.4 2.1 14.9 1 12 1 7.8 1 4.1 3.4 2.3 7l3.5 2.7C6.7 7.1 9.1 5.3 12 5.3Z"/></svg> Continue with Google</button>
        <div class="row-end">${c.fromFile ? '' : '<button class="btn ghost sm" id="cl-disc">Use a different project</button>'}</div>`;
    } else {
      body = `
        <dl class="cloud-info">
          <div><dt>Signed in as</dt><dd>${U.esc(user.email || user.id)}</dd></div>
          <div><dt>Status</dt><dd>${pill()}</dd></div>
          <div><dt>Last synced</dt><dd>${meta?.lastSync ? new Date(meta.lastSync).toLocaleString() : 'never'}</dd></div>
          <div><dt>Project</dt><dd><code>${U.esc(new URL(c.url).hostname)}</code></dd></div>
        </dl>
        ${status === 'error' || status === 'offline' ? `<p class="notice">${U.esc(lastError || 'Offline')}</p>` : ''}
        <div class="row"><button class="btn primary" id="cl-sync">⟳ Sync now</button><button class="btn" id="cl-out">Sign out</button></div>
        <p class="muted small">Changes sync automatically a few seconds after you make them, every minute, and when you return to the tab.</p>`;
    }
    host.innerHTML = body;
    const run = (fn) => async (e) => {
      e?.preventDefault?.();
      try { await fn(e); } catch (err) { U.toast(err.message || String(err), 'error'); }
    };
    U.$('#cl-cfg', host)?.addEventListener('submit', run((e) => saveConfig(e.target.url.value, e.target.key.value)));
    U.$('#cl-email', host)?.addEventListener('submit', run(async (e) => {
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try { await signInEmail(e.target.email.value.trim()); U.toast('Check your inbox for the sign-in link', 'success'); btn.textContent = 'Link sent ✓'; }
      finally { btn.disabled = false; }
    }));
    U.$('#cl-google', host)?.addEventListener('click', run(signInGoogle));
    U.$('#cl-disc', host)?.addEventListener('click', () => confirm('Forget this Supabase project on this device? Your local data stays.') && disconnect());
    U.$('#cl-sync', host)?.addEventListener('click', run(() => sync()));
    U.$('#cl-out', host)?.addEventListener('click', run(async () => {
      const wipe = confirm('Signing out. Also remove your data from THIS device?\n\nOK = remove the local copy (it stays safe in the cloud)\nCancel = keep a local copy');
      await signOut(wipe);
      U.toast('Signed out');
    }));
  }

  return {
    init, sync, onChange, pill, renderSettings, configured,
    get status() { return status; },
    get user() { return user; },
  };
})();
