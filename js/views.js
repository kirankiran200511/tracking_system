// Page renderers: dashboard, transactions, analytics.
const Views = (() => {
  const TYPE_COLOR = { income: 'var(--s1)', expense: 'var(--s2)', investment: 'var(--s3)', saving: 'var(--s4)' };
  const WS_SERIES = [{ key: 'personal', name: 'Personal', color: 'var(--s1)' }, { key: 'work', name: 'Work', color: 'var(--s2)' }];
  const TYPE_LABEL = { expense: 'Expense', income: 'Income', investment: 'Investment', saving: 'Saving' };
  const STATUS = {
    good: { icon: '✓', label: 'On track' }, warning: { icon: '!', label: 'Near limit' },
    serious: { icon: '▲', label: 'Will overshoot' }, critical: { icon: '✕', label: 'Over budget' },
  };

  // Transactions page filter (drill-downs from charts write into this).
  const txFilter = { search: '', types: [], categories: [], payees: [], methods: [], tags: [], min: '', max: '', reimb: '', hasDoc: false, tag: '', sort: 'date', dir: -1, limit: 100 };
  const selected = new Set();

  function ctx() {
    const st = Store.state;
    const range = A.resolveRange(st.ui);
    const prevRange = A.previousRange(range);
    const ws = st.ui.workspace;
    const tag = st.ui.tag || '';
    return {
      range, prevRange, ws, tag,
      txns: A.filter(st.txns, { ...range, workspace: ws, ...(tag ? { tag } : {}) }),
      prev: A.filter(st.txns, { ...prevRange, workspace: ws, ...(tag ? { tag } : {}) }),
      label: A.RANGES.find((r) => r[0] === st.ui.range)?.[1] || '',
    };
  }

  function drill(patch) {
    Object.assign(txFilter, { search: '', types: [], categories: [], payees: [], methods: [], tags: [], min: '', max: '', reimb: '', hasDoc: false, tag: '', month: '', limit: 100 }, patch);
    selected.clear();
    location.hash = '#/transactions';
  }

  const delta = (cur, prev, goodWhenUp) => {
    if (!prev) return '<span class="delta muted">no prior data</span>';
    const d = (cur - prev) / prev;
    const up = d >= 0;
    const good = goodWhenUp ? up : !up;
    return `<span class="delta ${Math.abs(d) < 0.005 ? 'muted' : good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${U.pct(Math.abs(d))}<span class="muted"> vs prev.</span></span>`;
  };

  const card = (title, body, { id, extra = '', cls = '', sub = '' } = {}) => `
    <section class="card ${cls}">
      <header class="card-head"><div><h3>${title}</h3>${sub ? `<p class="card-sub">${sub}</p>` : ''}</div>${extra}</header>
      <div class="card-body" ${id ? `id="${id}"` : ''}>${body || ''}</div>
    </section>`;

  const txnRow = (t, { check } = {}) => `
    <tr data-id="${t.id}" class="${selected.has(t.id) ? 'sel' : ''}">
      ${check ? `<td class="c-check"><input type="checkbox" aria-label="Select" ${selected.has(t.id) ? 'checked' : ''}></td>` : ''}
      <td class="c-date">${U.fmtDate(t.date, { short: true })}<small>${t.date.slice(0, 4)}</small></td>
      <td class="c-payee"><div class="payee-cell"><span class="cat-ico" aria-hidden="true">${Store.icon(t.category)}</span><div><b>${U.esc(t.payee || t.category)}</b><small>${U.esc(t.category)}${t.note ? ' · ' + U.esc(t.note) : ''}</small></div></div></td>
      <td class="c-tags">${t.workspace === 'work' ? '<span class="pill work">Work</span>' : '<span class="pill">Personal</span>'}${t.reimbursable ? `<span class="pill ${t.reimbursed ? 'ok' : 'warn'}">${t.reimbursed ? 'Reimbursed' : 'To claim'}</span>` : ''}${t.linkId ? `<span class="pill" title="Linked to a subscription or EMI">${Store.state.emis.some((l) => l.id === t.linkId) ? '🏦 EMI' : '🔁 Sub'}</span>` : ''}${t.docIds.length ? '<span class="pill" title="Has document">📎</span>' : ''}${t.tags.map((x) => `<span class="pill tag">#${U.esc(x)}</span>`).join('')}</td>
      <td class="c-method muted">${U.esc(t.method)}</td>
      <td class="c-amt num ${t.type}">${t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}${U.money(t.amount)}<small>${TYPE_LABEL[t.type]}</small></td>
    </tr>`;

  const emptyState = () => `
    <div class="empty">
      <div class="empty-art">💸</div>
      <h2>Start tracking in seconds</h2>
      <p>Add your first spend by voice or text, import a bank statement CSV, or explore with sample data.</p>
      <div class="row-center"><button class="btn primary" data-add>＋ Add a spend</button><button class="btn" data-sample>Load sample data</button></div>
    </div>`;

  // =========================== DASHBOARD ===========================
  function dashboard(root) {
    const st = Store.state;
    if (!st.txns.length) { root.innerHTML = emptyState(); return; }
    const c = ctx();
    const T = A.totals(c.txns), P = A.totals(c.prev);
    const days = A.byDay(c.txns, c.range.from, c.range.to);
    const nDays = days.length;
    const nw = A.netWorthSeries();
    const nwNow = nw.length ? nw[nw.length - 1].value : null;
    const spark = (type) => Charts.spark(A.byDay(c.txns, c.range.from, c.range.to, type).map((d) => d.value), TYPE_COLOR[type]);
    const hour = new Date().getHours();

    root.innerHTML = `
      <div class="page-head">
        <div><h1>${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}${st.settings.name ? ', ' + U.esc(st.settings.name) : ''}</h1>
        <p class="muted">${c.label} · ${U.fmtDate(c.range.from)} – ${U.fmtDate(c.range.to)}${c.ws !== 'all' ? ` · ${U.cap(c.ws)} only` : ''}</p></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Spent</div><div class="kpi-value">${U.money(T.expense)}</div>${delta(T.expense, P.expense, false)}<div class="kpi-foot">${U.money(T.expense / nDays)}/day avg ${spark('expense')}</div></div>
        <div class="kpi"><div class="kpi-label">Income</div><div class="kpi-value">${U.money(T.income)}</div>${delta(T.income, P.income, true)}<div class="kpi-foot">${c.txns.filter((t) => t.type === 'income').length} credits</div></div>
        <div class="kpi"><div class="kpi-label">Net saved</div><div class="kpi-value ${T.net < 0 ? 'neg' : ''}">${U.money(T.net)}</div><span class="delta ${T.savingsRate >= 0.2 ? 'good' : T.savingsRate < 0 ? 'bad' : 'muted'}">${isFinite(T.savingsRate) ? `${U.pct(T.savingsRate)} savings rate` : 'add income to see rate'}</span><div class="kpi-foot">income − expenses</div></div>
        <div class="kpi"><div class="kpi-label">Invested + saved</div><div class="kpi-value">${U.money(T.invested + T.saved)}</div>${delta(T.invested + T.saved, P.invested + P.saved, true)}<div class="kpi-foot">${U.money(T.invested)} invested · ${U.money(T.saved)} to goals</div></div>
        <a class="kpi link" href="#/wealth"><div class="kpi-label">Net worth</div><div class="kpi-value">${nwNow == null ? '—' : U.money(nwNow)}</div>${nw.length > 1 ? delta(nwNow, nw[nw.length - 2].value, true) : '<span class="delta muted">add assets →</span>'}<div class="kpi-foot">${st.assets.length} accounts & holdings</div></a>
      </div>

      <div class="grid g-2-1">
        ${card('How much you spend each day', '', { id: 'd-daily', sub: 'Click a day to see its transactions', extra: c.ws === 'all' ? Charts.legend(WS_SERIES) : '' })}
        ${card('Insights', `<ul class="insights">${A.insights(c.txns, c.prev, c.range).map((i) => `<li class="ins ${i.tone}"><span class="ins-dot" aria-hidden="true"></span><span>${i.text}</span></li>`).join('') || '<li class="muted">Add more data to unlock insights.</li>'}</ul>`)}
      </div>

      <div class="grid g-2">
        ${card('Where it goes', '', { id: 'd-cats', sub: 'Spending by category', extra: '<a class="link-sm" href="#/analytics/categories">Deep dive →</a>' })}
        ${card('Who you pay', '', { id: 'd-payees', sub: 'Top payees by amount', extra: '<a class="link-sm" href="#/analytics/payees">Deep dive →</a>' })}
      </div>

      <div class="grid g-3">
        ${card('Upcoming bills & EMIs', upcomingMini(), { id: 'd-upcoming', extra: '<a class="link-sm" href="#/bills">All →</a>' })}
        ${card('Financial health', `${Health.mini()}${safeMini()}`, { extra: '<a class="link-sm" href="#/health">Details →</a>' })}
        ${card('Budgets this month', budgetsMini(), { extra: '<a class="link-sm" href="#/budgets">Manage →</a>' })}
      </div>

      <div class="grid g-2-1">
        ${card('Recent activity', `<div class="table-wrap"><table class="txn-table compact"><tbody>${c.txns.slice(0, 8).map((t) => txnRow(t)).join('')}</tbody></table></div>`, { extra: '<a class="link-sm" href="#/transactions">All transactions →</a>' })}
        ${card('Personal vs work', '', { id: 'd-split', sub: 'Share of spending' })}
      </div>

      ${dashSavings(st, c)}
      ${dashInvestments(st, c)}
    `;
    U.$$('#d-upcoming [data-pay]').forEach((b) => b.addEventListener('click', () => {
      const item = Bills.upcoming(40).find((x) => x.ref.id === b.dataset.pay && x.first) || Bills.upcoming(0).find((x) => x.ref.id === b.dataset.pay);
      if (item) { Bills.logPayment(item); U.toast(`${item.name} logged as paid`, 'success'); }
    }));

    const exp = c.txns.filter((t) => t.type === 'expense');
    const daily = () => {
      const series = c.ws === 'all' ? WS_SERIES : [WS_SERIES[c.ws === 'work' ? 1 : 0]];
      const data = A.byDayWorkspace(exp, c.range.from, c.range.to).map((d) => ({ label: U.fmtDate(d.date, { short: true }), date: d.date, values: d }));
      if (data.length > 120) {
        // long ranges: aggregate to months so bars stay readable
        const months = A.monthsBetween(c.range.from, c.range.to).map((k) => ({ label: U.fmtMonth(k), key: k, values: { personal: 0, work: 0 } }));
        data.forEach((d) => { const m = months.find((x) => x.key === d.date.slice(0, 7)); if (m) { m.values.personal += d.values.personal; m.values.work += d.values.work; } });
        return Charts.columns(U.$('#d-daily'), { data: months, series, height: 300, tipLabel: (d) => d.label, onClick: (d) => drill({ types: ['expense'], month: d.key }) });
      }
      Charts.columns(U.$('#d-daily'), { data, series, height: 300, tipLabel: (d) => `${U.DAYS[U.parseISO(d.date).getDay()]}, ${U.fmtDate(d.date)}`, onClick: (d) => { Store.state.ui.range = 'custom'; Store.state.ui.from = Store.state.ui.to = d.date; Store.commit(true); drill({ types: ['expense'] }); } });
    };
    daily();
    Charts.ranked(U.$('#d-cats'), { rows: A.byCategory(exp), total: T.expense, max: 7, icon: (r) => Store.icon(r.key), onClick: (r) => drill({ types: ['expense'], categories: [r.key] }) });
    Charts.ranked(U.$('#d-payees'), { rows: A.byPayee(exp), total: T.expense, max: 7, sub: (r) => `${r.count}×`, onClick: (r) => drill({ types: ['expense'], payees: [r.key] }) });
    const personal = U.sum(exp.filter((t) => t.workspace === 'personal'), (t) => t.amount), work = U.sum(exp.filter((t) => t.workspace === 'work'), (t) => t.amount);
    const split = U.$('#d-split');
    if (personal + work) {
      Charts.share(split, [{ name: 'Personal', value: personal, color: 'var(--s1)' }, { name: 'Work', value: work, color: 'var(--s2)' }].filter((p) => p.value));
      const pending = U.sum(exp.filter((t) => t.reimbursable && !t.reimbursed), (t) => t.amount);
      split.insertAdjacentHTML('beforeend', `<dl class="mini-stats"><div><dt>Personal</dt><dd>${U.money(personal)}</dd></div><div><dt>Work</dt><dd>${U.money(work)}</dd></div><div><dt>To claim</dt><dd>${U.money(pending)}</dd></div></dl>`);
    } else split.innerHTML = Charts.empty('No spending in this period.');
    return () => daily(); // re-render on resize
  }

  function budgetsMini() {
    const bs = A.budgetStatus();
    if (!bs.length) return `<div class="empty-mini">No budgets yet. <a href="#/budgets">Set one up →</a></div>`;
    return `<ul class="budget-mini">${bs.slice(0, 5).map((b) => `
      <li><div class="bm-top"><span>${b.category === '__all' ? 'Everything' : U.esc(b.category)}${b.workspace !== 'all' ? ` <small class="muted">${b.workspace}</small>` : ''}</span><span class="status s-${b.status}" title="${STATUS[b.status].label}">${STATUS[b.status].icon} ${U.pct(b.ratio)}</span></div>
      <div class="meter"><span class="m-${b.status}" style="width:${Math.min(b.ratio * 100, 100)}%"></span></div>
      <div class="bm-foot muted small">${U.money(b.spent)} of ${U.money(b.amount)}</div></li>`).join('')}</ul>`;
  }

  function upcomingMini() {
    const items = Bills.upcoming(30).filter((x) => x.first).slice(0, 6);
    if (!Store.state.subscriptions.length && !Store.state.emis.length) return recurringMini() + '<p class="small"><a href="#/bills">Track subscriptions & EMIs →</a></p>';
    if (!items.length) return '<div class="empty-mini">Nothing due in the next 30 days.</div>';
    return `<ul class="rec-mini">${items.map((x) => {
      const n = Bills.daysUntil(x.date);
      return `<li><span class="cat-ico">${x.kind === 'emi' ? '🏦' : Store.icon(x.category)}</span><div><b>${U.esc(x.name)}</b><small class="${n < 0 ? 'neg' : 'muted'}">${x.kind === 'emi' ? 'EMI' : Bills.CYCLES[x.ref.cycle].label} · ${U.fmtDate(x.date, { short: true })} · ${Bills.dueLabel(x.date)}</small></div><span class="num">${U.money(x.amount)}</span>${n <= 2 ? `<button class="icon-btn" data-pay="${x.ref.id}" title="Log as paid" aria-label="Log ${U.esc(x.name)} as paid">✓</button>` : ''}</li>`;
    }).join('')}</ul>`;
  }

  function safeMini() {
    const s = Health.safeToSpend();
    return `<div class="safe-box"><div><span class="muted small">Safe to spend this month</span><b class="${s.left < 0 ? 'neg' : ''}">${U.money(s.left)}</b></div><small class="muted">${s.left > 0 ? `≈ ${U.money(s.perDay)}/day for ${s.daysLeft} days · after bills & 20% saving` : 'over the safe limit — pause extras'}</small></div>`;
  }

  function recurringMini() {
    const rec = A.recurring(Store.state.txns).filter((r) => !r.stale).sort((a, b) => (a.next < b.next ? -1 : 1)).slice(0, 5);
    if (!rec.length) return '<div class="empty-mini">Nothing recurring detected yet — it appears after 3 similar payments.</div>';
    return `<ul class="rec-mini">${rec.map((r) => {
      const inDays = U.daysBetween(U.todayISO(), r.next);
      return `<li><span class="cat-ico">${Store.icon(r.category)}</span><div><b>${U.esc(r.payee)}</b><small class="muted">${r.cadence} · ${inDays < 0 ? `${-inDays}d overdue` : inDays === 0 ? 'due today' : `in ${inDays}d`}</small></div><span class="num">${U.money(r.amount)}</span></li>`;
    }).join('')}</ul>`;
  }

  // =========================== TRANSACTIONS ===========================
  function multiSelect(name, label, options, chosen) {
    return `<details class="ms" data-ms="${name}">
      <summary class="btn sm">${label}${chosen.length ? ` <b class="badge">${chosen.length}</b>` : ''}</summary>
      <div class="ms-pop">${options.length > 8 ? '<input class="ms-search" placeholder="Search…">' : ''}<div class="ms-list">
        ${options.map((o) => `<label class="check"><input type="checkbox" value="${U.esc(o)}" ${chosen.includes(o) ? 'checked' : ''}> ${U.esc(o)}</label>`).join('')}
      </div>${chosen.length ? '<button class="btn sm ghost ms-clear">Clear</button>' : ''}</div></details>`;
  }

  function transactions(root) {
    const st = Store.state;
    // a month drill-down (from a monthly chart) overrides the global date range
    const monthEnd = (k) => { const [y, m] = k.split('-').map(Number); return U.iso(new Date(y, m, 0)); };
    const range = txFilter.month ? { from: `${txFilter.month}-01`, to: monthEnd(txFilter.month) } : A.resolveRange(st.ui);
    const inRange = A.filter(st.txns, { ...range, workspace: st.ui.workspace, ...(st.ui.tag ? { tag: st.ui.tag } : {}) });
    let list = A.filter(inRange, txFilter);
    const key = txFilter.sort, dir = txFilter.dir;
    list = [...list].sort((a, b) => (key === 'amount' ? (a.amount - b.amount) * dir : key === 'payee' ? a.payee.localeCompare(b.payee) * dir : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * dir));
    const T = A.totals(list);
    const cats = st.categories.map((c) => c.name);
    const payees = [...new Set(inRange.map((t) => t.payee).filter(Boolean))].sort();
    const allTags = Store.allTags();
    const active = txFilter.search || txFilter.types.length || txFilter.categories.length || txFilter.payees.length || txFilter.methods.length || (txFilter.tags && txFilter.tags.length) || txFilter.min || txFilter.max || txFilter.reimb || txFilter.hasDoc || txFilter.tag || txFilter.month || !!st.ui.tag;

    root.innerHTML = `
      <div class="page-head"><div><h1>Transactions</h1><p class="muted">${list.length} of ${inRange.length} in ${U.fmtDate(range.from)} – ${U.fmtDate(range.to)}</p></div>
        <div class="row"><button class="btn" id="tx-export">⬇ Export CSV</button><button class="btn primary" data-add>＋ Add</button></div></div>
      <div class="filterbar">
        <input id="tx-search" type="search" placeholder="Search payee, note, tag, amount…  ( / )" value="${U.esc(txFilter.search)}">
        ${multiSelect('types', 'Type', Object.keys(TYPE_LABEL), txFilter.types)}
        ${multiSelect('categories', 'Category', cats, txFilter.categories)}
        ${multiSelect('payees', 'Payee', payees, txFilter.payees)}
        ${multiSelect('methods', 'Method', Store.METHODS, txFilter.methods)}
        ${allTags.length ? multiSelect('tags', 'Tag', allTags, txFilter.tags || (txFilter.tag ? [txFilter.tag] : [])) : ''}
        <details class="ms"><summary class="btn sm">Amount${txFilter.min || txFilter.max ? ' <b class="badge">•</b>' : ''}</summary><div class="ms-pop"><div class="inline"><input id="f-min" type="number" placeholder="Min" value="${txFilter.min}"><input id="f-max" type="number" placeholder="Max" value="${txFilter.max}"></div></div></details>
        <select id="f-reimb" class="btn sm"><option value="">All claims</option><option value="any" ${txFilter.reimb === 'any' ? 'selected' : ''}>Reimbursable</option><option value="pending" ${txFilter.reimb === 'pending' ? 'selected' : ''}>Pending claim</option></select>
        <label class="check sm"><input type="checkbox" id="f-doc" ${txFilter.hasDoc ? 'checked' : ''}> Has doc</label>
        ${active ? '<button class="btn sm ghost" id="f-clear">Clear filters</button>' : ''}
      </div>
      ${txFilter.month ? `<div class="notice">Showing ${U.fmtMonth(txFilter.month)} only. <button class="link-btn" id="f-month">Remove</button></div>` : ''}
      <div class="sum-strip">
        <span>Out <b class="expense">${U.money(T.expense)}</b></span><span>In <b class="income">${U.money(T.income)}</b></span><span>Invested <b>${U.money(T.invested)}</b></span><span>Saved <b>${U.money(T.saved)}</b></span><span>Net <b>${U.money(T.net)}</b></span>
      </div>
      <div class="bulk${selected.size ? ' show' : ''}" id="bulk">
        <b>${selected.size} selected</b>
        <select id="b-cat"><option value="">Set category…</option>${cats.map((c) => `<option>${U.esc(c)}</option>`).join('')}</select>
        <select id="b-ws"><option value="">Set workspace…</option><option value="personal">Personal</option><option value="work">Work</option></select>
        <button class="btn sm" id="b-reimb">Mark reimbursed</button>
        <button class="btn sm danger" id="b-del">Delete</button>
        <button class="btn sm ghost" id="b-none">Clear selection</button>
      </div>
      <div class="card flush"><div class="table-wrap"><table class="txn-table">
        <thead><tr><th class="c-check"><input type="checkbox" id="sel-all" aria-label="Select all"></th>
          <th class="sortable" data-sort="date">Date ${key === 'date' ? (dir < 0 ? '↓' : '↑') : ''}</th>
          <th class="sortable" data-sort="payee">Payee / category ${key === 'payee' ? (dir < 0 ? '↓' : '↑') : ''}</th>
          <th>Labels</th><th>Method</th>
          <th class="sortable num" data-sort="amount">Amount ${key === 'amount' ? (dir < 0 ? '↓' : '↑') : ''}</th></tr></thead>
        <tbody>${list.slice(0, txFilter.limit).map((t) => txnRow(t, { check: true })).join('') || `<tr><td colspan="6" class="empty-row">No transactions match. ${active ? '<button class="link-btn" id="f-clear2">Clear filters</button>' : ''}</td></tr>`}</tbody>
      </table></div>
      ${list.length > txFilter.limit ? `<div class="row-center pad"><button class="btn" id="more">Show more (${list.length - txFilter.limit} left)</button></div>` : ''}</div>`;

    const rerender = () => transactions(root);
    const s = U.$('#tx-search');
    s.addEventListener('input', U.debounce(() => { txFilter.search = s.value; rerender(); U.$('#tx-search').focus(); const v = U.$('#tx-search'); v.setSelectionRange(v.value.length, v.value.length); }, 250));
    U.$$('.ms[data-ms]', root).forEach((d) => {
      const name = d.dataset.ms;
      d.addEventListener('change', (e) => {
        if (!e.target.matches('.ms-list input')) return;
        txFilter[name] = U.$$('.ms-list input:checked', d).map((i) => i.value);
        rerender();
        U.$(`.ms[data-ms="${name}"]`)?.setAttribute('open', '');
      });
      U.$('.ms-search', d)?.addEventListener('input', (e) => U.$$('.ms-list label', d).forEach((l) => (l.hidden = !l.textContent.toLowerCase().includes(e.target.value.toLowerCase()))));
      U.$('.ms-clear', d)?.addEventListener('click', () => { txFilter[name] = []; rerender(); });
    });
    ['min', 'max'].forEach((k) => U.$(`#f-${k}`).addEventListener('change', (e) => { txFilter[k] = e.target.value; rerender(); }));
    U.$('#f-reimb').addEventListener('change', (e) => { txFilter.reimb = e.target.value; rerender(); });
    U.$('#f-doc').addEventListener('change', (e) => { txFilter.hasDoc = e.target.checked; rerender(); });
    const clear = () => {
      drill({});
      if (st.ui.tag) { st.ui.tag = ''; Store.commit(); }
      rerender();
    };
    U.$('#f-clear')?.addEventListener('click', clear);
    U.$('#f-clear2')?.addEventListener('click', clear);
    U.$('#f-month')?.addEventListener('click', () => { txFilter.month = ''; rerender(); });
    U.$('#more')?.addEventListener('click', () => { txFilter.limit += 200; rerender(); });
    U.$$('th.sortable', root).forEach((th) => th.addEventListener('click', () => { const k = th.dataset.sort; txFilter.dir = txFilter.sort === k ? -txFilter.dir : -1; txFilter.sort = k; rerender(); }));
    U.$('#tx-export').addEventListener('click', () => exportCSV(list));

    U.$$('tbody tr[data-id]', root).forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if (e.target.matches('input[type=checkbox]')) {
          e.target.checked ? selected.add(tr.dataset.id) : selected.delete(tr.dataset.id);
          return rerender();
        }
        Capture.edit(tr.dataset.id);
      });
    });
    U.$('#sel-all').addEventListener('change', (e) => { list.slice(0, txFilter.limit).forEach((t) => (e.target.checked ? selected.add(t.id) : selected.delete(t.id))); rerender(); });
    const bulk = (patch) => { selected.forEach((id) => Store.updateTxn(id, patch)); U.toast(`Updated ${selected.size}`, 'success'); selected.clear(); };
    U.$('#b-cat').addEventListener('change', (e) => { const c = Store.cat(e.target.value); if (c) bulk({ category: c.name, type: c.type }); });
    U.$('#b-ws').addEventListener('change', (e) => e.target.value && bulk({ workspace: e.target.value }));
    U.$('#b-reimb').addEventListener('click', () => bulk({ reimbursable: true, reimbursed: true }));
    U.$('#b-del').addEventListener('click', () => {
      const removed = st.txns.filter((t) => selected.has(t.id));
      Store.deleteTxns([...selected]); selected.clear(); App.undoToast(removed);
    });
    U.$('#b-none').addEventListener('click', () => { selected.clear(); rerender(); });
  }

  function exportCSV(list) {
    const head = ['date', 'type', 'amount', 'payee', 'category', 'workspace', 'method', 'note', 'tags', 'reimbursable', 'reimbursed'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(','), ...list.map((t) => head.map((h) => q(h === 'tags' ? t.tags.join(';') : t[h])).join(','))].join('\n');
    U.download(`spendwise-transactions-${U.todayISO()}.csv`, csv, 'text/csv');
  }

  // =========================== ANALYTICS ===========================
  const ANALYTICS_TABS = [['daily', 'Daily'], ['categories', 'Categories'], ['payees', 'Payees'], ['trends', 'Trends'], ['work', 'Work & claims'], ['recurring', 'Recurring']];
  let catFocus = '';
  let payeeSort = 'value';

  function analytics(root, sub = 'daily') {
    if (!Store.state.txns.length) { root.innerHTML = emptyState(); return; }
    const c = ctx();
    root.innerHTML = `
      <div class="page-head"><div><h1>Analytics</h1><p class="muted">${c.label} · ${U.fmtDate(c.range.from)} – ${U.fmtDate(c.range.to)}${c.ws !== 'all' ? ` · ${U.cap(c.ws)}` : ''}</p></div></div>
      <nav class="subtabs" role="tablist">${ANALYTICS_TABS.map(([k, l]) => `<a role="tab" href="#/analytics/${k}" class="${k === sub ? 'active' : ''}">${l}</a>`).join('')}</nav>
      <div id="an-body"></div>`;
    const body = U.$('#an-body');
    const fn = { daily: aDaily, categories: aCategories, payees: aPayees, trends: aTrends, work: aWork, recurring: aRecurring }[sub] || aDaily;
    return fn(body, c);
  }

  function aDaily(body, c) {
    const exp = c.txns.filter((t) => t.type === 'expense');
    const days = A.byDay(exp, c.range.from, c.range.to);
    const vals = days.map((d) => d.value);
    const total = U.sum(vals);
    const noSpend = vals.filter((v) => v === 0).length;
    const peak = days.reduce((m, d) => (d.value > m.value ? d : m), days[0] || { value: 0 });
    const today = U.todayISO();
    const monthStart = today.slice(0, 8) + '01';
    const mtd = U.sum(Store.state.txns.filter((t) => t.type === 'expense' && t.date >= monthStart && t.date <= today && (c.ws === 'all' || t.workspace === c.ws)), (t) => t.amount);
    const dim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    body.innerHTML = `
      <div class="kpis k4">
        <div class="kpi"><div class="kpi-label">Average per day</div><div class="kpi-value">${U.money(total / (days.length || 1))}</div><div class="kpi-foot">median ${U.money(U.median(vals))}</div></div>
        <div class="kpi"><div class="kpi-label">Highest day</div><div class="kpi-value">${U.money(peak.value)}</div><div class="kpi-foot">${peak.date ? U.fmtDate(peak.date) : '—'}</div></div>
        <div class="kpi"><div class="kpi-label">No-spend days</div><div class="kpi-value">${noSpend}</div><div class="kpi-foot">of ${days.length} days (${U.pct(noSpend / (days.length || 1))})</div></div>
        <div class="kpi"><div class="kpi-label">Month-end forecast</div><div class="kpi-value">${U.money((mtd / new Date().getDate()) * dim)}</div><div class="kpi-foot">${U.money(mtd)} so far this month</div></div>
      </div>
      ${card('Spending calendar', '', { id: 'a-cal', sub: 'Each square is a day; darker means more spent. Click a day to see it.' })}
      <div class="grid g-2-1">
        ${card('Daily spend', '', { id: 'a-daily', extra: c.ws === 'all' ? Charts.legend(WS_SERIES) : '' })}
        ${card('Average by weekday', '', { id: 'a-week', sub: 'Which days cost you the most' })}
      </div>
      ${card('Cumulative spending', '', { id: 'a-cum', sub: 'Running total across the period' })}`;
    const draw = () => {
      const goDay = (d) => { Store.state.ui.range = 'custom'; Store.state.ui.from = Store.state.ui.to = d.date; Store.commit(true); drill({ types: ['expense'] }); };
      Charts.calendar(U.$('#a-cal'), { days, onClick: goDay });
      const series = c.ws === 'all' ? WS_SERIES : [WS_SERIES[c.ws === 'work' ? 1 : 0]];
      Charts.columns(U.$('#a-daily'), { data: A.byDayWorkspace(exp, c.range.from, c.range.to).slice(-92).map((d) => ({ label: U.fmtDate(d.date, { short: true }), date: d.date, values: d })), series, tipLabel: (d) => `${U.DAYS[U.parseISO(d.date).getDay()]}, ${U.fmtDate(d.date)}`, onClick: goDay });
      Charts.columns(U.$('#a-week'), { data: A.byWeekday(exp, c.range.from, c.range.to).map((d) => ({ label: d.key, values: { v: d.value } })), series: [{ key: 'v', name: 'Avg spend', color: 'var(--s1)' }], labelEvery: 1 });
      let run = 0;
      Charts.line(U.$('#a-cum'), { data: days.map((d) => ({ label: U.fmtDate(d.date, { short: true }), value: (run += d.value), date: d.date })), name: 'Spent so far', color: 'var(--s2)', tipLabel: (d) => U.fmtDate(d.date) });
    };
    draw();
    return draw;
  }

  function aCategories(body, c) {
    const exp = c.txns.filter((t) => t.type === 'expense');
    const cats = A.byCategory(exp);
    const prev = Object.fromEntries(A.byCategory(c.prev.filter((t) => t.type === 'expense')).map((x) => [x.key, x.value]));
    const total = U.sum(cats, (x) => x.value);
    const needs = U.sum(cats.filter((x) => Store.cat(x.key)?.need), (x) => x.value);
    if (!catFocus || !cats.some((x) => x.key === catFocus)) catFocus = cats[0]?.key || '';
    const incomeCats = A.byCategory(c.txns.filter((t) => t.type === 'income'));
    const invCats = A.byCategory(c.txns.filter((t) => t.type === 'investment'));
    body.innerHTML = `
      <div class="grid g-2">
        ${card('Spending by category', '', { id: 'c-rank', sub: 'Click a category to see its transactions' })}
        <div class="stack-cards">
          ${card('Needs vs wants', '', { id: 'c-nw', sub: 'Essentials (rent, bills, groceries, health, EMI…) vs discretionary' })}
          ${card('Category trend', '', { id: 'c-trend', extra: `<select id="c-focus" class="btn sm">${cats.map((x) => `<option ${x.key === catFocus ? 'selected' : ''}>${U.esc(x.key)}</option>`).join('')}</select>`, sub: 'Monthly spend, last 12 months' })}
        </div>
      </div>
      ${card('Category breakdown', `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Category</th><th class="num">Spent</th><th class="num">Share</th><th class="num">Txns</th><th class="num">Avg / txn</th><th class="num">vs prev. period</th></tr></thead>
        <tbody>${cats.map((x) => { const p = prev[x.key]; const d = p ? (x.value - p) / p : null; return `<tr class="clickable" data-cat="${U.esc(x.key)}"><td>${Store.icon(x.key)} ${U.esc(x.key)}</td><td class="num">${U.money(x.value)}</td><td class="num">${U.pct(x.value / total)}</td><td class="num">${x.count}</td><td class="num">${U.money(x.avg)}</td><td class="num">${d == null ? '<span class="muted">new</span>' : `<span class="delta ${d > 0 ? 'bad' : 'good'}">${d > 0 ? '▲' : '▼'} ${U.pct(Math.abs(d))}</span>`}</td></tr>`; }).join('')}</tbody></table></div>`)}
      <div class="grid g-2">
        ${card('Income sources', '', { id: 'c-inc' })}
        ${card('Investments by type', '', { id: 'c-inv' })}
      </div>`;
    const draw = () => {
      Charts.ranked(U.$('#c-rank'), { rows: cats, total, max: 20, icon: (r) => Store.icon(r.key), sub: (r) => `${r.count}×`, onClick: (r) => drill({ types: ['expense'], categories: [r.key] }) });
      if (total) Charts.share(U.$('#c-nw'), [{ name: 'Needs', value: needs, color: 'var(--s1)' }, { name: 'Wants', value: total - needs, color: 'var(--s2)' }]);
      else U.$('#c-nw').innerHTML = Charts.empty('No spending yet.');
      const months = A.monthsBetween(U.iso(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1)), U.todayISO());
      const allCat = Store.state.txns.filter((t) => t.type === 'expense' && t.category === catFocus && (c.ws === 'all' || t.workspace === c.ws));
      Charts.columns(U.$('#c-trend'), { data: months.map((k) => ({ label: U.fmtMonth(k), key: k, values: { v: U.sum(allCat.filter((t) => t.date.startsWith(k)), (t) => t.amount) } })), series: [{ key: 'v', name: catFocus, color: 'var(--s1)' }], height: 200, onClick: (d) => drill({ categories: [catFocus], month: d.key }) });
      Charts.ranked(U.$('#c-inc'), { rows: incomeCats, total: U.sum(incomeCats, (x) => x.value), icon: (r) => Store.icon(r.key), onClick: (r) => drill({ types: ['income'], categories: [r.key] }) });
      Charts.ranked(U.$('#c-inv'), { rows: invCats, total: U.sum(invCats, (x) => x.value), icon: (r) => Store.icon(r.key), color: 'var(--s3)', onClick: (r) => drill({ types: ['investment'], categories: [r.key] }) });
    };
    draw();
    U.$('#c-focus')?.addEventListener('change', (e) => { catFocus = e.target.value; draw(); });
    U.$$('[data-cat]', body).forEach((tr) => tr.addEventListener('click', () => drill({ types: ['expense'], categories: [tr.dataset.cat] })));
    return draw;
  }

  function aPayees(body, c) {
    const exp = c.txns.filter((t) => t.type === 'expense');
    let rows = A.byPayee(exp);
    const catOf = {};
    exp.forEach((t) => (catOf[t.payee || '(unknown)'] ||= t.category));
    const total = U.sum(rows, (r) => r.value);
    if (payeeSort === 'count') rows = [...rows].sort((a, b) => b.count - a.count);
    if (payeeSort === 'avg') rows = [...rows].sort((a, b) => b.avg - a.avg);
    const top5 = U.sum(rows.slice(0, 5), (r) => r.value);
    body.innerHTML = `
      <div class="kpis k4">
        <div class="kpi"><div class="kpi-label">People & places paid</div><div class="kpi-value">${rows.length}</div></div>
        <div class="kpi"><div class="kpi-label">Top 5 share</div><div class="kpi-value">${U.pct(top5 / (total || 1))}</div><div class="kpi-foot">of all spending goes to 5 payees</div></div>
        <div class="kpi"><div class="kpi-label">Most frequent</div><div class="kpi-value sm">${U.esc([...rows].sort((a, b) => b.count - a.count)[0]?.key || '—')}</div><div class="kpi-foot">${[...rows].sort((a, b) => b.count - a.count)[0]?.count || 0} payments</div></div>
        <div class="kpi"><div class="kpi-label">Avg payment</div><div class="kpi-value">${U.money(total / (exp.length || 1))}</div></div>
      </div>
      <div class="grid g-2">
        ${card('Top payees', '', { id: 'p-rank', extra: `<div class="seg sm" id="p-sort">${[['value', 'Amount'], ['count', 'Frequency'], ['avg', 'Avg size']].map(([k, l]) => `<button class="${payeeSort === k ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>` })}
        ${card('All payees', `<input id="p-search" type="search" placeholder="Find a payee…" class="full-input"><div class="table-wrap tall"><table class="data-table"><thead><tr><th>Payee</th><th class="num">Total</th><th class="num">Times</th><th class="num">Avg</th><th>Last paid</th></tr></thead><tbody id="p-body"></tbody></table></div>`)}
      </div>`;
    const fillTable = (q = '') => {
      U.$('#p-body').innerHTML = rows.filter((r) => r.key.toLowerCase().includes(q.toLowerCase())).map((r) => `<tr class="clickable" data-p="${U.esc(r.key)}"><td>${Store.icon(catOf[r.key])} ${U.esc(r.key)}<small class="muted block">${U.esc(catOf[r.key] || '')}</small></td><td class="num">${U.money(r.value)}</td><td class="num">${r.count}</td><td class="num">${U.money(r.avg)}</td><td>${U.fmtDate(r.last, { short: true })}</td></tr>`).join('');
      U.$$('[data-p]', body).forEach((tr) => tr.addEventListener('click', () => drill({ types: ['expense'], payees: [tr.dataset.p] })));
    };
    fillTable();
    U.$('#p-search').addEventListener('input', (e) => fillTable(e.target.value));
    U.$$('#p-sort button').forEach((b) => b.addEventListener('click', () => { payeeSort = b.dataset.k; aPayees(body, c); }));
    const metric = payeeSort;
    const draw = () => Charts.ranked(U.$('#p-rank'), {
      rows: rows.map((r) => ({ ...r, value: metric === 'count' ? r.count : metric === 'avg' ? r.avg : r.value, real: r })), max: 15,
      icon: (r) => Store.icon(catOf[r.key]), sub: (r) => (metric === 'count' ? U.money(r.real.value) : `${r.count}×`),
      fmt: metric === 'count' ? (v) => `${v}×` : U.money,
      onClick: (r) => drill({ types: ['expense'], payees: [r.key] }),
    });
    draw();
    return draw;
  }

  function aTrends(body, c) {
    // last 12 months, but never before the first recorded transaction (empty months would drag averages down)
    const first = Store.state.txns.reduce((m, t) => (t.date < m ? t.date : m), U.todayISO());
    const from12 = U.iso(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1));
    const from = first.slice(0, 7) + '-01' > from12 ? first.slice(0, 7) + '-01' : from12;
    const txns = A.filter(Store.state.txns, { from, to: U.todayISO(), workspace: c.ws });
    const months = A.monthsBetween(from, U.todayISO());
    const bm = Object.fromEntries(A.byMonth(txns).map((m) => [m.key, m]));
    const rows = months.map((k) => bm[k] || { key: k, income: 0, expense: 0, investment: 0, saving: 0, personal: 0, work: 0 });
    const methods = A.byMethod(c.txns.filter((t) => t.type === 'expense'));
    const avgInc = U.sum(rows, (r) => r.income) / rows.length, avgExp = U.sum(rows, (r) => r.expense) / rows.length;
    body.innerHTML = `
      <p class="muted small">Trends cover up to the last 12 months (since you started tracking), regardless of the date filter.</p>
      <div class="kpis k4">
        <div class="kpi"><div class="kpi-label">Avg monthly income</div><div class="kpi-value">${U.money(avgInc)}</div></div>
        <div class="kpi"><div class="kpi-label">Avg monthly spend</div><div class="kpi-value">${U.money(avgExp)}</div></div>
        <div class="kpi"><div class="kpi-label">Avg savings rate</div><div class="kpi-value">${avgInc ? U.pct((avgInc - avgExp) / avgInc) : '—'}</div></div>
        <div class="kpi"><div class="kpi-label">Emergency fund target</div><div class="kpi-value">${U.money(avgExp * 6)}</div><div class="kpi-foot">6 × avg monthly spend</div></div>
      </div>
      ${card('Income vs spending', '', { id: 't-io', extra: Charts.legend([{ name: 'Income', color: 'var(--s1)' }, { name: 'Spending', color: 'var(--s2)' }]) })}
      <div class="grid g-2">
        ${card('Where the money went each month', '', { id: 't-alloc', sub: 'Spending, investing and saving', extra: Charts.legend([{ name: 'Spent', color: 'var(--s2)' }, { name: 'Invested', color: 'var(--s3)' }, { name: 'Saved', color: 'var(--s4)' }]) })}
        ${card('Net cash flow (cumulative)', '', { id: 't-net', sub: 'Income − spending, added up month by month' })}
      </div>
      <div class="grid g-2">
        ${card('Personal vs work, monthly', '', { id: 't-ws', extra: Charts.legend(WS_SERIES) })}
        ${card('Payment methods', '', { id: 't-methods', sub: 'For the selected period' })}
      </div>`;
    const draw = () => {
      const lbl = (k) => U.fmtMonth(k);
      Charts.columns(U.$('#t-io'), { data: rows.map((r) => ({ label: lbl(r.key), key: r.key, values: { income: r.income, expense: r.expense } })), series: [{ key: 'income', name: 'Income', color: 'var(--s1)' }, { key: 'expense', name: 'Spending', color: 'var(--s2)' }], mode: 'group', onClick: (d) => drill({ month: d.key }) });
      Charts.columns(U.$('#t-alloc'), { data: rows.map((r) => ({ label: lbl(r.key), values: r })), series: [{ key: 'expense', name: 'Spent', color: 'var(--s2)' }, { key: 'investment', name: 'Invested', color: 'var(--s3)' }, { key: 'saving', name: 'Saved', color: 'var(--s4)' }] });
      let run = 0;
      Charts.line(U.$('#t-net'), { data: rows.map((r) => ({ label: lbl(r.key), value: (run += r.income - r.expense) })), name: 'Cumulative net', color: 'var(--s1)', zeroBase: true });
      Charts.columns(U.$('#t-ws'), { data: rows.map((r) => ({ label: lbl(r.key), values: r })), series: WS_SERIES });
      Charts.ranked(U.$('#t-methods'), { rows: methods, total: U.sum(methods, (m) => m.value), sub: (r) => `${r.count}×`, onClick: (r) => drill({ methods: [r.key] }) });
    };
    draw();
    return draw;
  }

  function aWork(body, c) {
    const work = A.filter(Store.state.txns, { ...c.range, workspace: 'work' });
    const exp = work.filter((t) => t.type === 'expense');
    const claims = exp.filter((t) => t.reimbursable);
    const pending = claims.filter((t) => !t.reimbursed);
    const reimbursed = U.sum(claims.filter((t) => t.reimbursed), (t) => t.amount);
    body.innerHTML = `
      <div class="kpis k4">
        <div class="kpi"><div class="kpi-label">Work spending</div><div class="kpi-value">${U.money(U.sum(exp, (t) => t.amount))}</div><div class="kpi-foot">${exp.length} transactions</div></div>
        <div class="kpi"><div class="kpi-label">Waiting for reimbursement</div><div class="kpi-value">${U.money(U.sum(pending, (t) => t.amount))}</div><div class="kpi-foot">${pending.length} claims${pending.length ? `, oldest ${U.daysBetween(pending[pending.length - 1].date, U.todayISO())}d` : ''}</div></div>
        <div class="kpi"><div class="kpi-label">Reimbursed</div><div class="kpi-value">${U.money(reimbursed)}</div></div>
        <div class="kpi"><div class="kpi-label">Out of pocket</div><div class="kpi-value">${U.money(U.sum(exp.filter((t) => !t.reimbursable), (t) => t.amount))}</div><div class="kpi-foot">work costs not claimable</div></div>
      </div>
      <div class="grid g-2">
        ${card('Work spending by category', '', { id: 'w-cat' })}
        ${card('Pending claims', pending.length ? `<div class="table-wrap tall"><table class="data-table"><thead><tr><th><input type="checkbox" id="w-all" aria-label="Select all"></th><th>Date</th><th>Payee</th><th class="num">Amount</th></tr></thead><tbody>${pending.map((t) => `<tr><td><input type="checkbox" class="w-sel" value="${t.id}"></td><td>${U.fmtDate(t.date, { short: true })}</td><td>${U.esc(t.payee || t.category)}<small class="muted block">${U.esc(t.category)}${t.docIds.length ? ' · 📎' : ''}</small></td><td class="num">${U.money(t.amount)}</td></tr>`).join('')}</tbody></table></div>
          <div class="row-end"><button class="btn" id="w-export">⬇ Export claim sheet</button><button class="btn primary" id="w-mark">Mark selected reimbursed</button></div>` : '<div class="empty-mini">No pending claims 🎉</div>')}
      </div>`;
    const draw = () => Charts.ranked(U.$('#w-cat'), { rows: A.byCategory(exp), total: U.sum(exp, (t) => t.amount), icon: (r) => Store.icon(r.key), color: 'var(--s2)', onClick: (r) => { Store.state.ui.workspace = 'work'; Store.commit(true); drill({ types: ['expense'], categories: [r.key] }); } });
    draw();
    U.$('#w-all')?.addEventListener('change', (e) => U.$$('.w-sel').forEach((x) => (x.checked = e.target.checked)));
    U.$('#w-mark')?.addEventListener('click', () => {
      const ids = U.$$('.w-sel:checked').map((x) => x.value);
      if (!ids.length) return U.toast('Select claims first');
      ids.forEach((id) => Store.updateTxn(id, { reimbursed: true }));
      U.toast(`Marked ${ids.length} reimbursed`, 'success');
    });
    U.$('#w-export')?.addEventListener('click', () => exportCSV(pending));
    return draw;
  }

  function aRecurring(body, c) {
    const rec = A.recurring(A.filter(Store.state.txns, { workspace: c.ws }));
    const active = rec.filter((r) => !r.stale);
    const monthly = U.sum(active, (r) => r.perMonth);
    body.innerHTML = `
      <div class="kpis k4">
        <div class="kpi"><div class="kpi-label">Recurring payments</div><div class="kpi-value">${active.length}</div><div class="kpi-foot">${rec.length - active.length} look cancelled</div></div>
        <div class="kpi"><div class="kpi-label">Cost per month</div><div class="kpi-value">${U.money(monthly)}</div></div>
        <div class="kpi"><div class="kpi-label">Cost per year</div><div class="kpi-value">${U.money(monthly * 12)}</div></div>
        <div class="kpi"><div class="kpi-label">Subscriptions only</div><div class="kpi-value">${U.money(U.sum(active.filter((r) => r.category === 'Subscriptions' || r.category === 'Software & Tools'), (r) => r.perMonth))}</div><div class="kpi-foot">per month — review what you still use</div></div>
      </div>
      ${card('Detected automatically', rec.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Payee</th><th>Cadence</th><th class="num">Amount</th><th class="num">≈ per month</th><th>Last</th><th>Next expected</th><th>Status</th></tr></thead><tbody>
        ${rec.map((r) => { const inD = U.daysBetween(U.todayISO(), r.next); return `<tr class="clickable" data-p="${U.esc(r.payee)}"><td>${Store.icon(r.category)} ${U.esc(r.payee)}<small class="muted block">${U.esc(r.category)} · ${r.count} payments</small></td><td>${r.cadence}</td><td class="num">${U.money(r.amount)}</td><td class="num">${U.money(r.perMonth)}</td><td>${U.fmtDate(r.last, { short: true })}</td><td>${r.stale ? '—' : `${U.fmtDate(r.next, { short: true })} <small class="muted">${inD < 0 ? `${-inD}d late` : `in ${inD}d`}</small>`}</td><td>${r.stale ? '<span class="status s-warning">! Stopped?</span>' : '<span class="status s-good">✓ Active</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty-mini">Recurring payments show up here once a payee appears 3+ times at a steady interval and amount.</div>', { sub: 'Same payee, similar amount, steady interval' })}`;
    U.$$('[data-p]', body).forEach((tr) => tr.addEventListener('click', () => { Store.state.ui.range = 'all'; Store.commit(true); drill({ payees: [tr.dataset.p] }); }));
  }

  // =========================== DASHBOARD: SAVINGS SECTION ===========================
  function dashSavings(st) {
    if (!st.goals.length) return '';
    const saved = (g) => U.sum(st.txns.filter((t) => t.goalId === g.id), (t) => t.amount) + (g.startAmount || 0);
    const totalTarget = U.sum(st.goals, (g) => g.target);
    const totalSaved = U.sum(st.goals, (g) => saved(g));
    const goalCards = st.goals.slice(0, 4).map((g) => {
      const s = saved(g), ratio = g.target ? s / g.target : 0;
      return `<div class="savings-goal-card">
        <div class="sg-top"><span class="sg-emoji">${U.esc(g.emoji || '🎯')}</span><div class="sg-info"><b>${U.esc(g.name)}</b><small>${g.deadline ? `by ${U.fmtDate(g.deadline)}` : 'no deadline'}</small></div>
        ${ratio >= 1 ? '<span class="status s-good">✓ Done</span>' : `<span class="muted small">${U.pct(ratio)}</span>`}</div>
        <div class="sg-amt"><span class="muted">saved</span><b>${U.money(s)}</b></div>
        <div class="meter"><span class="m-good" style="width:${Math.min(ratio * 100, 100)}%"></span></div>
        <div class="muted small">${U.money(g.target - s > 0 ? g.target - s : 0)} to go</div>
      </div>`;
    }).join('');
    return `
      <div class="dash-section-head"><h2><span class="sec-icon">🐖</span> Savings Goals</h2><a class="link-sm" href="#/goals">Manage goals →</a></div>
      <div class="kpis k4" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-label">Total saved</div><div class="kpi-value">${U.money(totalSaved)}</div><div class="kpi-foot">${U.pct(totalSaved / (totalTarget || 1))} of targets</div></div>
        <div class="kpi"><div class="kpi-label">Total target</div><div class="kpi-value">${U.money(totalTarget)}</div></div>
        <div class="kpi"><div class="kpi-label">Remaining</div><div class="kpi-value">${U.money(Math.max(totalTarget - totalSaved, 0))}</div></div>
        <div class="kpi"><div class="kpi-label">Active goals</div><div class="kpi-value">${st.goals.length}</div><div class="kpi-foot">${st.goals.filter((g) => saved(g) >= g.target).length} completed</div></div>
      </div>
      <div class="savings-grid">${goalCards}</div>`;
  }

  // =========================== DASHBOARD: INVESTMENTS SECTION ===========================
  function dashInvestments(st, c) {
    const K = Store.ASSET_KINDS;
    const invAssets = st.assets.filter((a) => !K[a.kind]?.liability && ['mutual_fund', 'stocks', 'fd', 'retirement', 'gold', 'crypto'].includes(a.kind));
    const invTxns = c.txns.filter((t) => t.type === 'investment');
    const totalInvTxn = U.sum(invTxns, (t) => t.amount);
    if (!invAssets.length && !invTxns.length) return '';

    const totalValue = U.sum(invAssets, (a) => A.latestValue(a));
    const totalInvested = U.sum(invAssets.filter((a) => a.invested), (a) => a.invested);
    const totalGain = totalInvested ? totalValue - totalInvested : 0;
    const gainPct = totalInvested ? totalGain / totalInvested : 0;

    const invCards = invAssets.slice(0, 6).map((a) => {
      const val = A.latestValue(a);
      const gain = a.invested ? val - a.invested : null;
      return `<div class="invest-card" onclick="location.hash='#/wealth'">
        <div class="ic-top"><span class="ic-icon">${K[a.kind]?.icon || '📦'}</span><div class="ic-info"><b>${U.esc(a.name)}</b><small>${K[a.kind]?.label || a.kind}</small></div></div>
        <div class="ic-bottom"><span class="ic-val">${U.money(val)}</span>${gain != null ? `<span class="delta ${gain >= 0 ? 'good' : 'bad'}">${gain >= 0 ? '▲' : '▼'} ${a.invested ? U.pct(Math.abs(gain) / a.invested, 1) : ''}</span>` : ''}</div>
      </div>`;
    }).join('');

    return `
      <div class="dash-section-head"><h2><span class="sec-icon">📈</span> Investment Portfolio</h2><a class="link-sm" href="#/wealth">Full wealth →</a></div>
      <div class="kpis k4" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-label">Portfolio value</div><div class="kpi-value">${U.money(totalValue)}</div></div>
        <div class="kpi"><div class="kpi-label">Invested</div><div class="kpi-value">${U.money(totalInvested)}</div></div>
        <div class="kpi"><div class="kpi-label">Gain / loss</div><div class="kpi-value ${totalGain < 0 ? 'neg' : ''}">${U.money(totalGain)}</div><div class="kpi-foot"><span class="delta ${gainPct >= 0 ? 'good' : 'bad'}">${gainPct >= 0 ? '▲' : '▼'} ${U.pct(Math.abs(gainPct), 1)}</span></div></div>
        <div class="kpi"><div class="kpi-label">Invested this period</div><div class="kpi-value">${U.money(totalInvTxn)}</div><div class="kpi-foot">${invTxns.length} transactions</div></div>
      </div>
      ${invCards ? `<div class="invest-grid">${invCards}</div>` : ''}`;
  }

  return { dashboard, transactions, analytics, card, txnRow, drill, emptyState, STATUS, TYPE_COLOR, delta, txFilter };
})();
