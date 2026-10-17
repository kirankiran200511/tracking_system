// App shell: router, global filters, modal, theme, shortcuts.
const App = (() => {
  const NAV = [
    ['dashboard', 'Dashboard', '<path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/>'],
    ['transactions', 'Transactions', '<path d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h10v2H4v-2Z"/>'],
    ['analytics', 'Analytics', '<path d="M5 9.2h3V19H5V9.2ZM10.6 5h2.8v14h-2.8V5Zm5.6 8H19v6h-2.8v-6Z"/>'],
    ['bills', 'Bills & EMIs', '<path d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 16H5V8h14v11ZM7 10h5v5H7v-5Z"/>'],
    ['health', 'Health', '<path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A5.5 5.5 0 0 1 7.5 3c1.74 0 3.41.81 4.5 2.09A6 6 0 0 1 16.5 3 5.5 5.5 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35ZM6 11h3l1.5-3 3 6 1.5-3h3v-1.5h-4l-.5 1-3-6L8.1 9.5H6V11Z"/>'],
    ['budgets', 'Budgets', '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Zm0-14a6 6 0 1 0 6 6h-6Z"/>'],
    ['goals', 'Goals', '<path d="M19 4h-2V2h-2v2H9V2H7v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 16H5V9h14v11Zm-7-9-3 3 3 3 3-3-3-3Z"/>'],
    ['wealth', 'Wealth', '<path d="M3 21h18v-2H3v2Zm2-4h3v-6H5v6Zm5.5 0h3V7h-3v10Zm5.5 0h3v-9h-3v9ZM12 2 3 6v1h18V6l-9-4Z"/>'],
    ['documents', 'Documents', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11Z"/>'],
    ['settings', 'Settings', '<path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-1.7-1L15 3.3h-4L10.7 6a7 7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.5 1 2-3.5ZM13 15.5a3.5 3.5 0 1 1 3.5-3.5 3.5 3.5 0 0 1-3.5 3.5Z" transform="translate(-1 0)"/>'],
  ];
  const FILTERED_PAGES = ['dashboard', 'transactions', 'analytics', 'wealth'];
  let redraw = null;
  let modalClose = null;

  function init() {
    Store.load();
    Store.hooks.beforeAdd = Bills.autoLink;
    applyTheme();
    U.$('#nav').innerHTML = NAV.map(([k, l, p]) => `<a href="#/${k}" data-nav="${k}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="currentColor">${p}</g></svg><span>${l}</span></a>`).join('');
    renderFilters();
    Store.on(() => { renderFilters(); route(); });
    window.addEventListener('hashchange', route);
    window.addEventListener('resize', U.debounce(() => redraw && redraw(), 150));
    document.addEventListener('click', globalClicks);
    document.addEventListener('keydown', shortcuts);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    route();
    const paintCloud = () => {
      U.$('#cloud-pill').innerHTML = Cloud.pill();
      const card = U.$('#cloud-card');
      if (card) Cloud.renderSettings(card);
    };
    Cloud.onChange(paintCloud);
    paintCloud();
    Cloud.init();
    setTimeout(Bills.remind, 1500);
  }

  function globalClicks(e) {
    if (e.target.closest('[data-add]')) Capture.open('quick');
    if (e.target.closest('[data-voice]')) { Capture.open('quick'); setTimeout(() => U.$('#mic')?.click(), 150); }
    if (e.target.closest('[data-sample]')) loadSample();
    if (e.target.closest('[data-close]')) closeModal();
    // close open multi-select popovers when clicking elsewhere
    U.$$('details.ms[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
  }

  let gPressed = 0;
  function shortcuts(e) {
    if (e.key === 'Escape' && U.$('#modal-root').childElementCount) return closeModal();
    if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (Date.now() - gPressed < 800) {
      const map = { d: 'dashboard', t: 'transactions', a: 'analytics', e: 'bills', h: 'health', b: 'budgets', w: 'wealth', g: 'goals', s: 'settings' };
      if (map[k]) { location.hash = `#/${map[k]}`; gPressed = 0; return; }
    }
    if (k === 'g') gPressed = Date.now();
    if (k === 'n') { e.preventDefault(); Capture.open('quick'); }
    if (k === 'v') { e.preventDefault(); Capture.open('quick'); setTimeout(() => U.$('#mic')?.click(), 150); }
    if (k === '/') { e.preventDefault(); if (!location.hash.startsWith('#/transactions')) location.hash = '#/transactions'; setTimeout(() => U.$('#tx-search')?.focus(), 50); }
  }

  function route() {
    const [page = 'dashboard', sub] = location.hash.replace(/^#\/?/, '').split('/');
    U.$$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === page));
    U.$('#filters').hidden = !FILTERED_PAGES.includes(page);
    const root = U.$('#view');
    const scroll = window.scrollY;
    const prevPage = root.dataset.page;
    root.dataset.page = page;
    const fn = { dashboard: Views.dashboard, transactions: Views.transactions, analytics: (r) => Views.analytics(r, sub), bills: (r) => Views.bills(r, sub), health: Health.view, budgets: Views.budgets, goals: Views.goals, wealth: Views.wealth, documents: Views.documents, settings: Views.settings }[page] || Views.dashboard;
    Charts.hideTip();
    redraw = fn(root) || null;
    if (prevPage === page) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
    document.title = `${NAV.find((n) => n[0] === page)?.[1] || 'Dashboard'} · SpendWise`;
  }

  function renderFilters() {
    const ui = Store.state.ui;
    const host = U.$('#filters');
    host.innerHTML = `
      <div class="seg ws" role="radiogroup" aria-label="Workspace">${[['all', 'All'], ['personal', '🙂 Personal'], ['work', '💼 Work']].map(([k, l]) => `<button role="radio" aria-checked="${ui.workspace === k}" class="${ui.workspace === k ? 'on' : ''}" data-ws="${k}">${l}</button>`).join('')}</div>
      <select id="range" class="btn" aria-label="Date range">${A.RANGES.map(([k, l]) => `<option value="${k}" ${k === ui.range ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${ui.range === 'custom' ? `<span class="custom-range"><input type="date" id="r-from" value="${ui.from}" aria-label="From"><span>→</span><input type="date" id="r-to" value="${ui.to}" aria-label="To"></span>` : ''}`;
    U.$$('[data-ws]', host).forEach((b) => b.addEventListener('click', () => { ui.workspace = b.dataset.ws; Store.commit(); }));
    U.$('#range').addEventListener('change', (e) => {
      ui.range = e.target.value;
      if (ui.range === 'custom' && !ui.from) { const r = A.resolveRange({ range: '30d' }); ui.from = r.from; ui.to = r.to; }
      Store.commit();
    });
    ['from', 'to'].forEach((k) => U.$(`#r-${k}`)?.addEventListener('change', (e) => { ui[k] = e.target.value; if (ui.from > ui.to) [ui.from, ui.to] = [ui.to, ui.from]; Store.commit(); }));
  }

  function modal(html, { wide, onClose } = {}) {
    closeModal();
    const root = U.$('#modal-root');
    root.innerHTML = `<div class="backdrop"></div><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    U.$('.backdrop', root).addEventListener('click', closeModal);
    modalClose = onClose;
    document.body.classList.add('modal-open');
    setTimeout(() => U.$('.modal input:not([type=hidden]):not([type=radio]), .modal textarea, .modal button.tab', root)?.focus(), 30);
  }
  function closeModal() {
    const root = U.$('#modal-root');
    if (!root.childElementCount) return;
    modalClose?.();
    modalClose = null;
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  function undoToast(removed) {
    const host = U.$('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>Deleted ${removed.length} ${removed.length === 1 ? 'transaction' : 'transactions'}</span><button class="link-btn">Undo</button>`;
    el.querySelector('button').addEventListener('click', () => { Store.addTxns(removed); el.remove(); });
    host.appendChild(el);
    setTimeout(() => el.remove(), 7000);
  }

  function applyTheme() {
    const t = Store.state.settings.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  function toggleTheme() {
    const s = Store.state.settings;
    const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    s.theme = dark ? 'light' : 'dark';
    applyTheme();
    Store.commit();
  }

  function loadSample() {
    const st = Store.state;
    if (st.txns.length && !confirm('Replace your current transactions, budgets, goals and accounts with sample data?')) return;
    const data = Sample.build();
    Store.replace({ ...st, txns: [], budgets: data.budgets, goals: data.goals, assets: data.assets, subscriptions: data.subscriptions, emis: data.emis, docs: st.docs, rules: st.rules, categories: st.categories, settings: { ...st.settings, insurance: data.insurance } });
    const hook = Store.hooks.beforeAdd;
    Store.hooks.beforeAdd = null; // sample payments are already linked
    Store.addTxns(data.txns);
    Store.hooks.beforeAdd = hook;
    // sample amounts are in rupees; convert them when showing dollars
    if (Store.state.settings.currency === 'USD') Store.convertAmounts(1 / (Store.state.settings.fx?.usdInr || 95));
    Bills.syncLoanAsset(Store.state.emis[0]);
    Store.state.ui.range = '30d';
    Store.commit();
    U.toast(`Loaded ${data.txns.length} sample transactions`, 'success');
    location.hash = '#/dashboard';
  }

  return { init, modal, closeModal, undoToast, applyTheme, toggleTheme, loadSample, rerender: () => route() };
})();

document.addEventListener('DOMContentLoaded', App.init);
