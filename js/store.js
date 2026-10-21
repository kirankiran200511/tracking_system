// Persistent state. Records live in localStorage; uploaded file contents live in IndexedDB.
const Store = (() => {
  const KEY = 'spendwise.v1';

  const DEFAULT_CATEGORIES = [
    // expenses — `need` marks essentials (used for the needs/wants split)
    { name: 'Food & Dining', type: 'expense', icon: '🍽️' },
    { name: 'Groceries', type: 'expense', icon: '🛒', need: true },
    { name: 'Transport', type: 'expense', icon: '🚕', need: true },
    { name: 'Fuel', type: 'expense', icon: '⛽', need: true },
    { name: 'Shopping', type: 'expense', icon: '🛍️' },
    { name: 'Bills & Utilities', type: 'expense', icon: '💡', need: true },
    { name: 'Rent & Housing', type: 'expense', icon: '🏠', need: true },
    { name: 'Health', type: 'expense', icon: '💊', need: true },
    { name: 'Entertainment', type: 'expense', icon: '🎬' },
    { name: 'Subscriptions', type: 'expense', icon: '🔁' },
    { name: 'Travel', type: 'expense', icon: '✈️' },
    { name: 'Education', type: 'expense', icon: '📚', need: true },
    { name: 'Personal Care', type: 'expense', icon: '💇' },
    { name: 'Gifts & Donations', type: 'expense', icon: '🎁' },
    { name: 'EMI & Loans', type: 'expense', icon: '🏦', need: true },
    { name: 'Taxes & Fees', type: 'expense', icon: '🧾', need: true },
    { name: 'Office & Supplies', type: 'expense', icon: '🖇️' },
    { name: 'Software & Tools', type: 'expense', icon: '💻' },
    { name: 'Client Meals', type: 'expense', icon: '🤝' },
    { name: 'Other', type: 'expense', icon: '•' },
    // income
    { name: 'Salary', type: 'income', icon: '💼' },
    { name: 'Freelance', type: 'income', icon: '🧑‍💻' },
    { name: 'Business', type: 'income', icon: '🏢' },
    { name: 'Interest & Dividends', type: 'income', icon: '📈' },
    { name: 'Refund', type: 'income', icon: '↩️' },
    { name: 'Reimbursement', type: 'income', icon: '🔄' },
    { name: 'Other Income', type: 'income', icon: '➕' },
    // investments
    { name: 'Mutual Funds', type: 'investment', icon: '📊' },
    { name: 'Stocks', type: 'investment', icon: '📈' },
    { name: 'FD / RD', type: 'investment', icon: '🏛️' },
    { name: 'Gold', type: 'investment', icon: '🪙' },
    { name: 'Crypto', type: 'investment', icon: '₿' },
    { name: 'PPF / EPF / NPS', type: 'investment', icon: '🛡️' },
    // savings
    { name: 'Savings', type: 'saving', icon: '🐖' },
  ];

  const ASSET_KINDS = {
    bank: { label: 'Bank account', icon: '🏦' },
    cash: { label: 'Cash / wallet', icon: '💵' },
    mutual_fund: { label: 'Mutual funds', icon: '📊' },
    stocks: { label: 'Stocks', icon: '📈' },
    fd: { label: 'FD / RD', icon: '🏛️' },
    retirement: { label: 'PPF / EPF / NPS', icon: '🛡️' },
    gold: { label: 'Gold', icon: '🪙' },
    crypto: { label: 'Crypto', icon: '₿' },
    real_estate: { label: 'Property', icon: '🏠' },
    other: { label: 'Other asset', icon: '📦' },
    loan: { label: 'Loan', icon: '🧾', liability: true },
    credit_card: { label: 'Credit card', icon: '💳', liability: true },
  };
  // groupings used by the health metrics
  const ASSET_GROUPS = {
    liquid: ['bank', 'cash', 'fd'],
    investable: ['bank', 'cash', 'fd', 'mutual_fund', 'stocks', 'retirement', 'gold', 'crypto'],
  };

  const METHODS = ['UPI', 'Card', 'Cash', 'Net banking', 'Wallet', 'Auto-debit', 'Other'];

  const blank = () => ({
    txns: [], budgets: [], goals: [], assets: [], docs: [], rules: [], subscriptions: [], emis: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    settings: { name: '', currency: 'INR', locale: 'en-IN', voiceLang: 'en-IN', theme: 'system' },
    ui: { workspace: 'all', range: '30d', from: '', to: '', tag: '' },
  });

  let state = blank();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        state = { ...blank(), ...saved, settings: { ...blank().settings, ...saved.settings }, ui: { ...blank().ui, ...saved.ui } };
      }
    } catch (e) { console.warn('Could not read saved data', e); }
    U.setLocale(state.settings.locale, state.settings.currency);
  }

  const persist = U.debounce(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { U.toast('Storage is full — export a backup and remove old documents.', 'error'); }
  }, 150);

  function commit(silent) { persist(); if (!silent) listeners.forEach((fn) => fn(state)); }
  const on = (fn) => listeners.add(fn);

  // ---- categories & rules ----
  const cat = (name) => state.categories.find((c) => c.name === name);
  const catsOf = (type) => state.categories.filter((c) => c.type === type);
  const icon = (name) => cat(name)?.icon || '•';

  // Learn payee → category/workspace from history and explicit rules.
  function suggestFor(payee) {
    const p = U.normPayee(payee);
    if (!p) return null;
    const rule = state.rules.find((r) => p.includes(U.normPayee(r.match)));
    if (rule) return { category: rule.category, workspace: rule.workspace || null };
    const past = state.txns.filter((t) => U.normPayee(t.payee) === p);
    if (!past.length) return null;
    const counts = {};
    past.forEach((t) => (counts[t.category] = (counts[t.category] || 0) + 1));
    const category = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return { category, workspace: past[past.length - 1].workspace, method: past[past.length - 1].method };
  }

  // ---- transactions ----
  function normTxn(t) {
    return {
      id: t.id || U.uid(),
      date: t.date || U.todayISO(),
      amount: Math.abs(Number(t.amount) || 0),
      type: t.type || 'expense',
      category: t.category || (t.type === 'income' ? 'Other Income' : t.type === 'investment' ? 'Mutual Funds' : t.type === 'saving' ? 'Savings' : 'Other'),
      payee: (t.payee || '').trim(),
      workspace: t.workspace === 'work' ? 'work' : 'personal',
      method: t.method || 'UPI',
      note: t.note || '',
      tags: Array.isArray(t.tags) ? t.tags : String(t.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
      reimbursable: !!t.reimbursable,
      reimbursed: !!t.reimbursed,
      goalId: t.goalId || null,
      linkId: t.linkId || null, // subscription or EMI this payment belongs to
      docIds: t.docIds || [],
      source: t.source || 'manual',
      createdAt: t.createdAt || Date.now(),
    };
  }
  function addTxns(list) {
    const added = list.map(normTxn);
    hooks.beforeAdd?.(added);
    state.txns.push(...added);
    state.txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
    commit();
    return added;
  }
  const addTxn = (t) => addTxns([t])[0];
  function updateTxn(id, patch) {
    const i = state.txns.findIndex((t) => t.id === id);
    if (i < 0) return;
    state.txns[i] = normTxn({ ...state.txns[i], ...patch });
    state.txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
    commit();
  }
  function deleteTxns(ids) {
    const s = new Set(ids);
    state.txns = state.txns.filter((t) => !s.has(t.id));
    commit();
  }

  // ---- generic collections (budgets, goals, assets, rules, docs) ----
  function upsert(coll, item) {
    const arr = state[coll];
    const i = arr.findIndex((x) => x.id === item.id);
    if (i >= 0) arr[i] = { ...arr[i], ...item }; else arr.push({ id: U.uid(), ...item });
    commit();
    return i >= 0 ? arr[i] : arr[arr.length - 1];
  }
  function remove(coll, id) { state[coll] = state[coll].filter((x) => x.id !== id); commit(); }

  // ---- IndexedDB for file blobs ----
  let dbp;
  function db() {
    dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open('spendwise-files', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('files', mode);
      const req = fn(tx.objectStore('files'));
      tx.oncomplete = () => res(req?.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  const putFile = (id, dataUrl) => idb('readwrite', (s) => s.put(dataUrl, id));
  // Falls back to the cloud copy (set by cloud.js) when this device doesn't have the file yet.
  async function getFile(id) {
    const local = await idb('readonly', (s) => s.get(id));
    if (local || !hooks.fetchFile) return local;
    const doc = state.docs.find((d) => d.id === id);
    if (!doc?.remotePath) return local;
    const dataUrl = await hooks.fetchFile(doc).catch(() => null);
    if (dataUrl) await putFile(id, dataUrl);
    return dataUrl;
  }
  const hooks = {};
  const delFile = (id) => idb('readwrite', (s) => s.delete(id));

  async function addDoc(meta, dataUrl) {
    const doc = { id: U.uid(), addedAt: Date.now(), txnIds: [], ...meta };
    if (dataUrl) { await putFile(doc.id, dataUrl); doc.hasFile = true; }
    state.docs.unshift(doc);
    commit();
    return doc;
  }
  async function removeDoc(id) {
    const d = state.docs.find((x) => x.id === id);
    if (d?.hasFile) await delFile(id).catch(() => {});
    if (d?.remotePath && hooks.deleteFile) hooks.deleteFile(d).catch(() => {});
    state.txns.forEach((t) => (t.docIds = t.docIds.filter((x) => x !== id)));
    remove('docs', id);
  }
  function linkDoc(docId, txnIds) {
    const d = state.docs.find((x) => x.id === docId);
    if (!d) return;
    d.txnIds = [...new Set([...d.txnIds, ...txnIds])];
    state.txns.forEach((t) => { if (txnIds.includes(t.id) && !t.docIds.includes(docId)) t.docIds.push(docId); });
    commit();
  }

  // ---- currency ----
  // Multiply every stored money amount by `factor` (used when switching INR ⇄ USD).
  function convertAmounts(factor) {
    const r = (v) => (v == null || v === '' ? v : Math.round(Number(v) * factor * 100) / 100);
    state.txns.forEach((t) => (t.amount = r(t.amount)));
    state.budgets.forEach((b) => (b.amount = r(b.amount)));
    state.goals.forEach((g) => { g.target = r(g.target); g.startAmount = r(g.startAmount || 0); });
    state.assets.forEach((a) => { a.history = a.history.map((h) => ({ ...h, value: r(h.value) })); if (a.invested) a.invested = r(a.invested); if (a.limit) a.limit = r(a.limit); });
    state.subscriptions.forEach((s) => (s.amount = r(s.amount)));
    state.emis.forEach((l) => { l.principal = r(l.principal); l.emi = r(l.emi); });
    const ins = state.settings.insurance;
    if (ins) { ins.term = r(ins.term || 0); ins.health = r(ins.health || 0); }
  }
  const CURRENCIES = { INR: { locale: 'en-IN', symbol: '₹', label: 'Indian Rupee' }, USD: { locale: 'en-US', symbol: '$', label: 'US Dollar' } };
  function setCurrency(code) {
    state.settings.currency = code;
    state.settings.locale = CURRENCIES[code]?.locale || 'en-IN';
    U.setLocale(state.settings.locale, code);
  }

  // ---- backup ----
  const exportJSON = () => JSON.stringify({ app: 'spendwise', version: 1, exportedAt: new Date().toISOString(), data: { ...state, ui: undefined } }, null, 2);
  function importJSON(text) {
    const parsed = JSON.parse(text);
    const data = parsed.data || parsed;
    if (!Array.isArray(data.txns)) throw new Error('This file is not a SpendWise backup');
    state = { ...blank(), ...data, ui: state.ui, settings: { ...blank().settings, ...data.settings } };
    state.txns = state.txns.map(normTxn);
    U.setLocale(state.settings.locale, state.settings.currency);
    commit();
  }
  function reset() { const ui = state.ui; state = blank(); state.ui = ui; commit(); }
  function replace(next) { state = { ...blank(), ...next, ui: state.ui }; commit(); }

  function allTags() {
    const custom = state.settings.tags || [];
    const fromTxns = state.txns.flatMap((t) => t.tags || []);
    return Array.from(new Set([...custom, ...fromTxns])).filter(Boolean).sort();
  }

  return {
    get state() { return state; },
    load, commit, on, cat, catsOf, icon, suggestFor, addTxn, addTxns, updateTxn, deleteTxns, upsert, remove,
    putFile, getFile, addDoc, removeDoc, linkDoc, exportJSON, importJSON, reset, replace, normTxn, hooks,
    ASSET_KINDS, ASSET_GROUPS, METHODS, CURRENCIES, convertAmounts, setCurrency, allTags,
  };
})();
