// Page renderers: budgets, goals, wealth, documents, settings.
Object.assign(Views, (() => {
  const { card, STATUS } = Views;
  const S = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
  let budgetMonth = U.todayISO().slice(0, 7);

  // =========================== BUDGETS ===========================
  function budgets(root) {
    const st = Store.state;
    const bs = A.budgetStatus(budgetMonth);
    const totalB = U.sum(bs.filter((b) => b.category !== '__all'), (b) => b.amount), totalS = U.sum(bs.filter((b) => b.category !== '__all'), (b) => b.spent);
    const months = [...new Set([U.todayISO().slice(0, 7), ...st.txns.map((t) => t.date.slice(0, 7))])].sort().reverse().slice(0, 18);
    const statusChip = (s) => `<span class="status s-${s}">${STATUS[s].icon} ${STATUS[s].label}</span>`;
    root.innerHTML = `
      <div class="page-head"><div><h1>Budgets</h1><p class="muted">Monthly limits by category. Status uses your pace so far to project month-end.</p></div>
        <div class="row"><select id="b-month" class="btn">${months.map((m) => `<option value="${m}" ${m === budgetMonth ? 'selected' : ''}>${U.fmtMonth(m)}</option>`).join('')}</select>
        <button class="btn" id="b-suggest">✨ Suggest from history</button><button class="btn primary" id="b-add">＋ Budget</button></div></div>
      ${bs.length ? `
      <div class="kpis k4">
        <div class="kpi"><div class="kpi-label">Budgeted</div><div class="kpi-value">${U.money(totalB)}</div><div class="kpi-foot">across ${bs.filter((b) => b.category !== '__all').length} categories</div></div>
        <div class="kpi"><div class="kpi-label">Spent</div><div class="kpi-value">${U.money(totalS)}</div><div class="kpi-foot">${U.pct(totalS / (totalB || 1))} used</div></div>
        <div class="kpi"><div class="kpi-label">Left</div><div class="kpi-value ${totalB - totalS < 0 ? 'neg' : ''}">${U.money(totalB - totalS)}</div></div>
        <div class="kpi"><div class="kpi-label">Needing attention</div><div class="kpi-value">${bs.filter((b) => b.status !== 'good').length}</div><div class="kpi-foot">over, or projected to go over</div></div>
      </div>
      <div class="budget-grid">${bs.sort((a, b) => b.ratio - a.ratio).map((b) => `
        <article class="card budget" data-id="${b.id}">
          <div class="b-top"><span class="cat-ico lg">${b.category === '__all' ? '∑' : Store.icon(b.category)}</span>
            <div class="b-name"><b>${b.category === '__all' ? 'All spending' : U.esc(b.category)}</b><small class="muted">${b.workspace === 'all' ? 'Personal + work' : U.cap(b.workspace)}</small></div>
            ${statusChip(b.status)}</div>
          <div class="b-amt"><b>${U.money(b.spent)}</b> <span class="muted">of ${U.money(b.amount)}</span></div>
          <div class="meter lg"><span class="m-${b.status}" style="width:${Math.min(b.ratio * 100, 100)}%"></span>${budgetMonth === U.todayISO().slice(0, 7) ? `<i class="pace" style="left:${Math.min((new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()) * 100, 100)}%" title="Today"></i>` : ''}</div>
          <div class="b-foot muted small">${b.left >= 0 ? `${U.money(b.left)} left${b.perDayLeft ? ` · ${U.money(b.perDayLeft)}/day` : ''}` : `${U.money(-b.left)} over`}${b.projected > b.amount && b.ratio < 1 ? ` · on pace for ${U.money(b.projected)}` : ''}</div>
          <div class="b-actions"><button class="link-btn" data-edit>Edit</button><button class="link-btn" data-view>Transactions</button></div>
        </article>`).join('')}</div>` : `<div class="empty"><div class="empty-art">🎯</div><h2>No budgets yet</h2><p>Set a monthly limit per category, or let SpendWise suggest limits from your last 3 months.</p></div>`}`;
    U.$('#b-month').addEventListener('change', (e) => { budgetMonth = e.target.value; budgets(root); });
    U.$('#b-add').addEventListener('click', () => budgetModal());
    U.$('#b-suggest').addEventListener('click', suggestBudgets);
    U.$$('.budget', root).forEach((el) => {
      const b = st.budgets.find((x) => x.id === el.dataset.id);
      U.$('[data-edit]', el).addEventListener('click', () => budgetModal(b));
      U.$('[data-view]', el).addEventListener('click', () => { Store.state.ui.workspace = b.workspace; Store.commit(true); Views.drill({ types: ['expense'], categories: b.category === '__all' ? [] : [b.category], month: budgetMonth }); });
    });
  }

  function budgetModal(b = {}) {
    App.modal(`<div class="modal-head"><h2>${b.id ? 'Edit' : 'New'} budget</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="grid-form" id="bf">
        <label class="full">Category<select name="category"><option value="__all">All spending</option>${Store.catsOf('expense').map((c) => `<option ${c.name === b.category ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select></label>
        <label>Monthly limit<input name="amount" type="number" min="1" required value="${b.amount || ''}"></label>
        <label>Applies to<select name="workspace">${[['all', 'Personal + work'], ['personal', 'Personal'], ['work', 'Work']].map(([v, l]) => `<option value="${v}" ${v === (b.workspace || 'personal') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="row-end full">${b.id ? '<button type="button" class="btn danger ghost" id="bdel">Delete</button><span class="spacer"></span>' : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`);
    const f = U.$('#bf');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      Store.upsert('budgets', { ...(b.id ? { id: b.id } : {}), category: f.category.value, amount: Number(f.amount.value), workspace: f.workspace.value });
      App.closeModal();
    });
    U.$('#bdel')?.addEventListener('click', () => { Store.remove('budgets', b.id); App.closeModal(); });
  }

  function suggestBudgets() {
    const from = U.iso(new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1));
    const to = U.iso(new Date(new Date().getFullYear(), new Date().getMonth(), 0));
    const exp = A.filter(Store.state.txns, { from, to, types: ['expense'], workspace: 'personal' });
    const cats = A.byCategory(exp).filter((c) => c.value / 3 >= 500);
    if (!cats.length) return U.toast('Need at least a month of past personal spending to suggest budgets');
    let n = 0;
    cats.forEach((c) => {
      if (Store.state.budgets.some((b) => b.category === c.key)) return;
      const avg = c.value / 3;
      const step = avg > 10000 ? 1000 : avg > 2000 ? 500 : 100;
      Store.state.budgets.push({ id: U.uid(), category: c.key, workspace: 'personal', amount: Math.ceil((avg * 0.95) / step) * step });
      n++;
    });
    Store.commit();
    U.toast(n ? `Added ${n} budgets at ~95% of your 3-month average — a gentle 5% stretch.` : 'Every category already has a budget', 'success');
  }

  // =========================== GOALS ===========================
  function goals(root) {
    const st = Store.state;
    const saved = (g) => U.sum(st.txns.filter((t) => t.goalId === g.id), (t) => t.amount) + (g.startAmount || 0);
    root.innerHTML = `
      <div class="page-head"><div><h1>Savings goals</h1><p class="muted">Give every rupee a job. Contributions are recorded as "Saving" transactions.</p></div>
        <button class="btn primary" id="g-add">＋ Goal</button></div>
      ${st.goals.length ? `<div class="goal-grid">${st.goals.map((g) => {
        const s = saved(g), ratio = g.target ? s / g.target : 0;
        const monthsLeft = g.deadline ? Math.max((U.parseISO(g.deadline) - new Date()) / (30.44 * 86400000), 0) : null;
        const need = monthsLeft != null && s < g.target ? (g.target - s) / Math.max(monthsLeft, 1) : 0;
        return `<article class="card goal" data-id="${g.id}">
          <div class="g-top"><span class="g-emoji">${U.esc(g.emoji || '🎯')}</span><div><b>${U.esc(g.name)}</b><small class="muted">${g.deadline ? `by ${U.fmtDate(g.deadline)}` : 'no deadline'}</small></div>${ratio >= 1 ? '<span class="status s-good">✓ Reached</span>' : ''}</div>
          <div class="g-amt"><b>${U.money(s)}</b><span class="muted"> / ${U.money(g.target)}</span></div>
          <div class="meter lg"><span class="m-good" style="width:${Math.min(ratio * 100, 100)}%"></span></div>
          <div class="muted small">${U.pct(ratio)} saved${need ? ` · save <b>${U.money(need)}/month</b> to make it` : ''}</div>
          <div class="row"><button class="btn sm primary" data-contrib>＋ Add money</button><button class="btn sm ghost" data-edit>Edit</button></div>
        </article>`;
      }).join('')}</div>` : `<div class="empty"><div class="empty-art">🐖</div><h2>No goals yet</h2><p>Emergency fund, a trip, a laptop, a down payment — create a goal and track progress.</p><div class="row-center"><button class="btn primary" id="g-add2">Create a goal</button><button class="btn" id="g-ef">Start an emergency fund</button></div></div>`}`;
    U.$('#g-add').addEventListener('click', () => goalModal());
    U.$('#g-add2')?.addEventListener('click', () => goalModal());
    U.$('#g-ef')?.addEventListener('click', () => {
      const from = U.iso(new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1));
      const avg = U.sum(A.filter(st.txns, { from, types: ['expense'], workspace: 'personal' }), (t) => t.amount) / 3;
      goalModal({ name: 'Emergency fund', emoji: '🛟', target: Math.round((avg * 6 || 300000) / 1000) * 1000 });
    });
    U.$$('.goal', root).forEach((el) => {
      const g = st.goals.find((x) => x.id === el.dataset.id);
      U.$('[data-edit]', el).addEventListener('click', () => goalModal(g));
      U.$('[data-contrib]', el).addEventListener('click', () => contribModal(g));
    });
  }

  function goalModal(g = {}) {
    App.modal(`<div class="modal-head"><h2>${g.id ? 'Edit' : 'New'} goal</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="grid-form" id="gf">
        <label class="full">Name<input name="name" required value="${U.esc(g.name || '')}" placeholder="e.g. Goa trip"></label>
        <label>Target amount<input name="target" type="number" min="1" required value="${g.target || ''}"></label>
        <label>Deadline<input name="deadline" type="date" value="${g.deadline || ''}"></label>
        <label>Emoji<input name="emoji" maxlength="4" value="${U.esc(g.emoji || '🎯')}"></label>
        <label>Already saved<input name="startAmount" type="number" min="0" value="${g.startAmount || 0}"></label>
        <div class="row-end full">${g.id ? '<button type="button" class="btn danger ghost" id="gdel">Delete</button><span class="spacer"></span>' : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`);
    const f = U.$('#gf');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      Store.upsert('goals', { ...(g.id ? { id: g.id } : {}), name: f.name.value, target: Number(f.target.value), deadline: f.deadline.value, emoji: f.emoji.value, startAmount: Number(f.startAmount.value) || 0 });
      App.closeModal();
    });
    U.$('#gdel')?.addEventListener('click', () => { Store.remove('goals', g.id); App.closeModal(); });
  }

  function contribModal(g) {
    App.modal(`<div class="modal-head"><h2>Add to “${U.esc(g.name)}”</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="grid-form" id="cf">
        <label>Amount<input name="amount" type="number" min="1" required autofocus></label>
        <label>Date<input name="date" type="date" value="${U.todayISO()}"></label>
        <div class="row-end full"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Add</button></div>
      </form>`);
    const f = U.$('#cf');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      Store.addTxn({ type: 'saving', category: 'Savings', amount: Number(f.amount.value), date: f.date.value, payee: g.name, goalId: g.id, method: 'Net banking', note: 'Goal contribution' });
      U.toast('Nice! Contribution added', 'success');
      App.closeModal();
    });
  }

  // =========================== WEALTH ===========================
  function wealth(root) {
    const st = Store.state;
    const K = Store.ASSET_KINDS;
    const series = A.netWorthSeries();
    const assets = st.assets.map((a) => ({ ...a, value: A.latestValue(a), liability: !!K[a.kind]?.liability }));
    const totalA = U.sum(assets.filter((a) => !a.liability), (a) => a.value), totalL = U.sum(assets.filter((a) => a.liability), (a) => a.value);
    const invested = U.sum(assets.filter((a) => !a.liability && a.invested), (a) => a.invested);
    const invValue = U.sum(assets.filter((a) => !a.liability && a.invested), (a) => a.value);
    // allocation by kind — top 7 kinds + Other, colors assigned in fixed slot order by kind list
    const kindOrder = Object.keys(K).filter((k) => !K[k].liability);
    const byKind = kindOrder.map((k) => ({ k, value: U.sum(assets.filter((a) => a.kind === k), (a) => a.value) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    const parts = byKind.slice(0, 7).map((x, i) => ({ name: K[x.k].label, value: x.value, color: S[i] }));
    if (byKind.length > 7) parts.push({ name: 'Other', value: U.sum(byKind.slice(7), (x) => x.value), color: 'var(--muted)' });
    const c = { range: A.resolveRange(st.ui) };
    const inv = A.filter(st.txns, { ...c.range, types: ['investment'], workspace: st.ui.workspace });

    root.innerHTML = `
      <div class="page-head"><div><h1>Wealth</h1><p class="muted">Net worth = everything you own − everything you owe. Update balances monthly for a clean trend.</p></div>
        <div class="row"><button class="btn" id="w-snap">⟳ Update all balances</button><button class="btn primary" id="w-add">＋ Account / holding</button></div></div>
      <div class="kpis k4">
        <div class="kpi hero"><div class="kpi-label">Net worth</div><div class="kpi-value">${U.money(totalA - totalL)}</div>${series.length > 1 ? Views.delta(series[series.length - 1].value, series[series.length - 2].value, true) : ''}</div>
        <div class="kpi"><div class="kpi-label">Assets</div><div class="kpi-value">${U.money(totalA)}</div></div>
        <div class="kpi"><div class="kpi-label">Liabilities</div><div class="kpi-value">${U.money(totalL)}</div><div class="kpi-foot">${totalA ? `debt ratio ${U.pct(totalL / totalA)}` : ''}</div></div>
        <div class="kpi"><div class="kpi-label">Investment gain</div><div class="kpi-value ${invValue - invested < 0 ? 'neg' : ''}">${invested ? U.money(invValue - invested) : '—'}</div><div class="kpi-foot">${invested ? `${U.pct((invValue - invested) / invested, 1)} on ${U.money(invested)} invested` : 'add "amount invested" to holdings'}</div></div>
      </div>
      <div class="grid g-2-1">
        ${card('Net worth over time', series.length ? '' : Charts.empty('Add accounts and update their balances to see your trend.'), { id: series.length ? 'nw-line' : '' })}
        ${card('Asset allocation', parts.length ? '' : Charts.empty('No assets yet.'), { id: parts.length ? 'nw-alloc' : '' })}
      </div>
      <div class="grid g-2-1">
        ${card('Accounts & holdings', assets.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Type</th><th class="num">Value</th><th class="num">Invested</th><th class="num">Gain</th><th>Updated</th><th></th></tr></thead><tbody>
          ${assets.sort((a, b) => a.liability - b.liability || b.value - a.value).map((a) => { const last = [...a.history].sort((x, y) => (x.date < y.date ? 1 : -1))[0]; const gain = a.invested ? a.value - a.invested : null; return `<tr data-id="${a.id}"><td>${K[a.kind]?.icon || ''} <b>${U.esc(a.name)}</b></td><td class="muted">${K[a.kind]?.label || a.kind}</td><td class="num ${a.liability ? 'neg' : ''}">${a.liability ? '−' : ''}${U.money(a.value)}</td><td class="num muted">${a.invested ? U.money(a.invested) : ''}</td><td class="num">${gain == null ? '' : `<span class="delta ${gain >= 0 ? 'good' : 'bad'}">${gain >= 0 ? '▲' : '▼'} ${U.pct(Math.abs(gain) / a.invested, 1)}</span>`}</td><td class="muted small">${last ? U.fmtDate(last.date, { short: true }) : ''}</td><td class="nowrap"><div class="cell-actions"><button class="btn sm" data-upd>Update</button><button class="icon-btn" data-edit aria-label="Edit">✎</button></div></td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="empty-mini">Add your bank accounts, mutual funds, stocks, FDs, gold, PF, loans and credit cards.</div>')}
        ${card('Invested this period', '', { id: 'w-inv', sub: 'From your investment transactions' })}
      </div>`;
    const draw = () => {
      if (series.length) Charts.line(U.$('#nw-line'), { data: series.map((d) => ({ label: U.fmtDate(d.date, { short: true }), value: d.value, date: d.date })), name: 'Net worth', zeroBase: false, tipLabel: (d) => U.fmtDate(d.date) });
      if (parts.length) Charts.share(U.$('#nw-alloc'), parts);
      const rows = A.byCategory(inv);
      Charts.ranked(U.$('#w-inv'), { rows, total: U.sum(rows, (r) => r.value), icon: (r) => Store.icon(r.key), color: 'var(--s3)', onClick: (r) => Views.drill({ types: ['investment'], categories: [r.key] }) });
    };
    draw();
    U.$('#w-add').addEventListener('click', () => assetModal());
    U.$('#w-snap').addEventListener('click', snapshotModal);
    U.$$('tr[data-id]', root).forEach((tr) => {
      const a = st.assets.find((x) => x.id === tr.dataset.id);
      U.$('[data-upd]', tr).addEventListener('click', () => updateValueModal(a));
      U.$('[data-edit]', tr).addEventListener('click', () => assetModal(a));
    });
    return draw;
  }

  function assetModal(a = {}) {
    const K = Store.ASSET_KINDS;
    App.modal(`<div class="modal-head"><h2>${a.id ? 'Edit' : 'Add'} account or holding</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="grid-form" id="af">
        <label class="full">Name<input name="name" required value="${U.esc(a.name || '')}" placeholder="e.g. HDFC Savings, Nifty 50 index fund, Home loan"></label>
        <label>Type<select name="kind">${Object.entries(K).map(([k, v]) => `<option value="${k}" ${k === a.kind ? 'selected' : ''}>${v.icon} ${v.label}${v.liability ? ' (owe)' : ''}</option>`).join('')}</select></label>
        <label>${a.id ? 'Current value' : 'Value today'}<input name="value" type="number" step="0.01" required value="${a.id ? A.latestValue(a) : ''}"></label>
        <label>Amount invested <small class="muted">(optional, for gains)</small><input name="invested" type="number" step="0.01" value="${a.invested || ''}"></label>
        <label>Credit limit <small class="muted">(credit cards — for utilisation)</small><input name="limit" type="number" step="1000" min="0" value="${a.limit || ''}"></label>
        <div class="row-end full">${a.id ? '<button type="button" class="btn danger ghost" id="adel">Delete</button><span class="spacer"></span>' : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`);
    const f = U.$('#af');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = Number(f.value.value);
      const history = a.id ? [...a.history] : [];
      if (!a.id || value !== A.latestValue(a)) { const today = U.todayISO(); const i = history.findIndex((h) => h.date === today); i >= 0 ? (history[i] = { date: today, value }) : history.push({ date: today, value }); }
      Store.upsert('assets', { ...(a.id ? { id: a.id } : {}), name: f.name.value, kind: f.kind.value, invested: Number(f.invested.value) || 0, limit: Number(f.limit.value) || 0, history });
      App.closeModal();
    });
    U.$('#adel')?.addEventListener('click', () => { if (confirm(`Delete ${a.name} and its history?`)) { Store.remove('assets', a.id); App.closeModal(); } });
  }

  function updateValueModal(a) {
    App.modal(`<div class="modal-head"><h2>Update ${U.esc(a.name)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="grid-form" id="uf">
        <label>Value<input name="value" type="number" step="0.01" required value="${A.latestValue(a)}"></label>
        <label>As of<input name="date" type="date" value="${U.todayISO()}"></label>
        <div class="row-end full"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`);
    const f = U.$('#uf');
    f.value.select();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const history = a.history.filter((h) => h.date !== f.date.value).concat({ date: f.date.value, value: Number(f.value.value) });
      Store.upsert('assets', { id: a.id, history });
      App.closeModal();
    });
  }

  function snapshotModal() {
    const st = Store.state;
    if (!st.assets.length) return assetModal();
    App.modal(`<div class="modal-head"><h2>Monthly balance check-in</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <p class="muted">Enter today's balance for each. Leave unchanged ones as they are.</p>
      <form id="sf" class="snap-list">${st.assets.map((a) => `<label>${Store.ASSET_KINDS[a.kind]?.icon || ''} ${U.esc(a.name)}<input type="number" step="0.01" name="${a.id}" value="${A.latestValue(a)}"></label>`).join('')}
        <div class="row-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save snapshot</button></div></form>`);
    U.$('#sf').addEventListener('submit', (e) => {
      e.preventDefault();
      const today = U.todayISO();
      st.assets.forEach((a) => {
        const v = Number(e.target[a.id].value);
        a.history = a.history.filter((h) => h.date !== today).concat({ date: today, value: v });
      });
      Store.commit();
      U.toast('Snapshot saved', 'success');
      App.closeModal();
    });
  }

  // =========================== DOCUMENTS ===========================
  let docFilter = 'all';
  function documents(root) {
    const st = Store.state;
    const docs = st.docs.filter((d) => docFilter === 'all' || (docFilter === 'image' ? d.mime?.startsWith('image/') : docFilter === 'pdf' ? /pdf/.test(d.mime || '') : d.kind === 'url'));
    root.innerHTML = `
      <div class="page-head"><div><h1>Documents</h1><p class="muted">Receipts, bills, invoices, statements and links — attached to the transactions they prove.</p></div>
        <button class="btn primary" id="doc-up">📎 Upload</button></div>
      <div class="seg" id="doc-f">${[['all', 'All'], ['image', 'Images'], ['pdf', 'PDFs'], ['url', 'Links']].map(([k, l]) => `<button class="${k === docFilter ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
      ${docs.length ? `<div class="doc-grid">${docs.map((d) => {
        const txns = st.txns.filter((t) => t.docIds.includes(d.id));
        return `<article class="card doc" data-id="${d.id}" tabindex="0">
          <div class="doc-thumb" data-thumb="${d.id}">${d.kind === 'url' ? '🔗' : /pdf/.test(d.mime || '') ? '📄' : d.mime?.startsWith('image/') ? '🖼️' : '📎'}</div>
          <div class="doc-meta"><b title="${U.esc(d.name)}">${U.esc(d.name)}</b><small class="muted">${new Date(d.addedAt).toLocaleDateString()} · ${txns.length ? `${txns.length} linked · ${U.money(U.sum(txns, (t) => t.amount))}` : 'not linked'}</small></div>
        </article>`;
      }).join('')}</div>` : `<div class="empty"><div class="empty-art">🗂️</div><h2>No documents</h2><p>Upload a receipt photo, a PDF invoice or bank statement, or paste a link from the Add dialog.</p></div>`}`;
    U.$('#doc-up').addEventListener('click', () => Capture.open('upload'));
    U.$$('#doc-f button').forEach((b) => b.addEventListener('click', () => { docFilter = b.dataset.k; documents(root); }));
    U.$$('.doc', root).forEach((el) => {
      el.addEventListener('click', () => openDoc(el.dataset.id));
      el.addEventListener('keydown', (e) => e.key === 'Enter' && openDoc(el.dataset.id));
    });
    // lazy image thumbnails
    docs.filter((d) => d.hasFile && d.mime?.startsWith('image/')).forEach(async (d) => {
      const url = await Store.getFile(d.id).catch(() => null);
      const box = U.$(`[data-thumb="${d.id}"]`);
      if (url && box) box.innerHTML = `<img src="${url}" alt="">`;
    });
  }

  async function openDoc(id) {
    const d = Store.state.docs.find((x) => x.id === id);
    if (!d) return;
    const url = d.hasFile ? await Store.getFile(id).catch(() => null) : null;
    const txns = Store.state.txns.filter((t) => t.docIds.includes(id));
    const preview = d.kind === 'url' ? `<a class="btn" href="${U.esc(d.url)}" target="_blank" rel="noopener noreferrer">Open link ↗</a><p class="muted small break">${U.esc(d.url)}</p>`
      : url && d.mime?.startsWith('image/') ? `<img class="doc-full" src="${url}" alt="${U.esc(d.name)}">`
      : url && /pdf/.test(d.mime) ? `<iframe class="doc-full" src="${url}" title="${U.esc(d.name)}"></iframe>`
      : '<p class="muted">Preview not available.</p>';
    App.modal(`<div class="modal-head"><h2 class="ellipsis">${U.esc(d.name)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="doc-view">${preview}</div>
      <h4>Linked transactions</h4>
      ${txns.length ? `<table class="txn-table compact"><tbody>${txns.map((t) => Views.txnRow(t)).join('')}</tbody></table>` : '<p class="muted">None yet.</p>'}
      ${d.extractedText ? `<details><summary>Extracted text</summary><pre class="extracted">${U.esc(d.extractedText.slice(0, 5000))}</pre></details>` : ''}
      <div class="row-end">${url ? `<a class="btn" href="${url}" download="${U.esc(d.name)}">⬇ Download</a>` : ''}<button class="btn danger ghost" id="ddel">Delete document</button></div>`, { wide: true });
    U.$('#ddel').addEventListener('click', async () => { if (confirm('Delete this document? Transactions stay.')) { await Store.removeDoc(id); App.closeModal(); } });
    U.$$('.modal tr[data-id]').forEach((tr) => tr.addEventListener('click', () => Capture.edit(tr.dataset.id)));
  }

  // =========================== CURRENCY ===========================
  async function liveUsdInr() {
    try {
      const j = await (await fetch('https://open.er-api.com/v6/latest/USD')).json();
      if (j.result === 'success' && j.rates?.INR) return { rate: j.rates.INR, asOf: j.time_last_update_utc };
    } catch {}
    return null;
  }

  function currencyModal(to) {
    const s = Store.state.settings;
    const from = s.currency === 'USD' ? 'USD' : 'INR';
    const hasData = Store.state.txns.length || Store.state.assets.length || Store.state.budgets.length;
    App.modal(`<div class="modal-head"><h2>Switch to ${Store.CURRENCIES[to].symbol} ${to}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form id="cur-f" class="stack-form">
        <label class="stack">Exchange rate
          <div class="inline"><span class="nowrap">1 USD =</span><input name="rate" type="number" step="0.0001" min="0.0001" required value="${s.fx?.usdInr || ''}" placeholder="loading…"><span>INR</span></div>
          <small class="muted" id="fx-src">Fetching today’s rate…</small>
        </label>
        ${hasData ? `<fieldset class="choice-list">
          <label class="choice"><input type="radio" name="mode" value="convert" checked><b>Convert all my amounts</b><span>Your existing numbers are in ${from} — e.g. ${from === 'INR' ? '₹1,000 becomes about $' : '$100 becomes about ₹'}<i id="fx-eg">…</i>. Recommended.</span></label>
          <label class="choice"><input type="radio" name="mode" value="symbol"><b>Only change the symbol</b><span>My amounts were already entered in ${to}; just display them as ${to}.</span></label>
        </fieldset>` : '<p class="muted">No amounts yet — nothing to convert.</p>'}
        <p class="muted small">Tip: download a backup first. You can switch back any time (tiny rounding differences may appear).</p>
        <div class="row-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Switch to ${to}</button></div>
      </form>`);
    const f = U.$('#cur-f');
    const eg = () => {
      const r = Number(f.rate.value);
      const el = U.$('#fx-eg');
      if (el && r) el.textContent = from === 'INR' ? (1000 / r).toFixed(2) : Math.round(100 * r).toLocaleString('en-IN');
    };
    f.rate.addEventListener('input', eg);
    liveUsdInr().then((live) => {
      const src = U.$('#fx-src');
      if (!src) return;
      if (live) { f.rate.value = live.rate.toFixed(4); src.textContent = `Live rate from open.er-api.com, updated ${live.asOf.replace(/ \+0000$/, ' UTC')}. You can edit it.`; }
      else src.textContent = s.fx?.usdInr ? 'Could not fetch a live rate (offline?) — using your last rate. You can edit it.' : 'Could not fetch a live rate (offline?) — please type today’s rate.';
      eg();
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const rate = Number(f.rate.value);
      if (!(rate > 0)) return U.toast('Enter a valid exchange rate', 'error');
      const convert = !hasData || f.mode?.value === 'convert';
      if (convert && hasData) Store.convertAmounts(from === 'INR' ? 1 / rate : rate);
      s.fx = { usdInr: rate, at: Date.now() };
      Store.setCurrency(to);
      Store.commit();
      App.closeModal();
      U.toast(convert && hasData ? `Converted everything to ${to} at 1 USD = ₹${rate.toFixed(2)}` : `Now showing amounts in ${to}`, 'success');
    });
  }

  // =========================== SETTINGS ===========================
  function settings(root) {
    const st = Store.state;
    const s = st.settings;
    const used = new Set(st.txns.map((t) => t.category));
    const cur = s.currency === 'USD' ? 'USD' : 'INR';
    const fx = s.fx?.usdInr;
    // Ensure workspaces, tags, columns exist in settings
    if (!s.workspaces) s.workspaces = ['personal', 'work'];
    if (!s.tags) s.tags = [];
    if (!s.columns) s.columns = { date: true, payee: true, labels: true, method: true, amount: true };
    root.innerHTML = `
      <div class="page-head"><div><h1>Settings</h1></div></div>
      <div class="grid g-2">
        ${card('👤 Account & Security', `
          <div class="account-settings-card">
            <div class="account-info-row">
              <div class="account-avatar">${U.esc(((typeof Auth !== 'undefined' && Auth.getUserEmail() ? Auth.getUserEmail()[0] : 'U') || 'U').toUpperCase())}</div>
              <div>
                <div class="account-email">${U.esc(typeof Auth !== 'undefined' && Auth.getUserEmail() ? Auth.getUserEmail() : 'Active Account')}</div>
                <div class="account-session-badge">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                  <span>Signed in · Session active for ${typeof Auth !== 'undefined' ? Auth.getRemainingDays() : 30} days</span>
                </div>
              </div>
            </div>
            <div class="account-actions">
              <button class="btn danger" id="auth-signout-settings">Sign Out</button>
            </div>
          </div>`)}
        ${card('Currency', `
          <div class="seg cur-seg" role="radiogroup" aria-label="Currency">${Object.entries(Store.CURRENCIES).map(([code, c]) => `<button role="radio" aria-checked="${code === cur}" class="${code === cur ? 'on' : ''}" data-cur="${code}"><b>${c.symbol}</b> ${code}<small>${c.label}</small></button>`).join('')}</div>
          <p class="muted small">Showing all amounts in <b>${Store.CURRENCIES[cur].label}</b> (${U.money(1234567)}).${fx ? ` Last rate used: 1 USD = ₹${fx.toFixed(2)}${s.fx.at ? ` (${new Date(s.fx.at).toLocaleDateString()})` : ''}.` : ''}</p>
          <p class="muted small">Switching can convert every amount (transactions, budgets, goals, accounts, subscriptions, EMIs) at today's exchange rate, or just change the symbol.</p>`)}
      </div>
      <div class="grid g-2">
        ${card('Profile & region', `<form class="grid-form" id="sf">
          <label class="full">Your name<input name="name" value="${U.esc(s.name)}" placeholder="For the greeting"></label>
          <label>Voice language<select name="voiceLang">${[['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['hi-IN', 'Hindi'], ['ta-IN', 'Tamil'], ['te-IN', 'Telugu'], ['kn-IN', 'Kannada'], ['ml-IN', 'Malayalam'], ['mr-IN', 'Marathi'], ['bn-IN', 'Bengali']].map(([v, l]) => `<option value="${v}" ${v === s.voiceLang ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Theme<select name="theme">${[['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${v === s.theme ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </form>`)}
      </div>
      <div class="grid g-2">
        ${card('Workspaces', `
          <div class="settings-section">
            <p class="muted small">Workspaces help you separate personal and work expenses. Add custom workspaces below.</p>
            <div class="ws-tag-list" id="ws-list">
              ${s.workspaces.map((w) => `<div class="ws-tag-item"><span>${U.esc(U.cap(w))}</span>${['personal', 'work'].includes(w) ? '' : `<button class="x" data-del-ws="${U.esc(w)}" aria-label="Remove">✕</button>`}</div>`).join('')}
            </div>
            <form class="inline" id="ws-add"><input name="name" placeholder="New workspace name" required style="max-width:200px"><button class="btn sm">＋ Add</button></form>
          </div>`)}
        ${card('Tags', `
          <div class="settings-section">
            <p class="muted small">Tags let you add extra labels to transactions (e.g. #trip, #project-x). Manage your tags here.</p>
            <div class="ws-tag-list" id="tag-list">
              ${s.tags.length ? s.tags.map((t) => `<div class="ws-tag-item"><span>#${U.esc(t)}</span><button class="x" data-del-tag="${U.esc(t)}" aria-label="Remove">✕</button></div>`).join('') : '<span class="muted small">No custom tags yet. Tags are also created when you type them in transactions.</span>'}
            </div>
            <form class="inline" id="tag-add"><input name="name" placeholder="New tag name" required style="max-width:200px"><button class="btn sm">＋ Add</button></form>
          </div>`)}
      </div>
      <div class="grid g-2">
        ${card('Transaction table columns', `
          <div class="settings-section">
            <p class="muted small">Choose which columns are visible in the transactions table.</p>
            <div class="col-manager" id="col-mgr">
              ${[['date', 'Date'], ['payee', 'Payee / Category'], ['labels', 'Labels (workspace, tags)'], ['method', 'Payment method'], ['amount', 'Amount']].map(([k, l]) => `<div class="col-item"><label><input type="checkbox" ${s.columns[k] !== false ? 'checked' : ''} data-col="${k}"> ${l}</label></div>`).join('')}
            </div>
          </div>`)}
        ${card('Your data', `
          <p class="muted small">${Cloud.user ? `Stored in this browser and synced to your Supabase cloud (${U.esc(Cloud.user.email || '')}).` : 'Stored only in this browser on this device. Turn on Cloud sync below, or export a backup regularly.'}</p>
          <div class="btn-col">
            <button class="btn" id="s-backup">⬇ Download backup (.json)</button>
            <button class="btn" id="s-restore">⬆ Restore backup</button>
            <button class="btn" id="s-csv">⬇ Export all transactions (.csv)</button>
            <button class="btn" id="s-sample">🧪 Load sample data</button>
            <button class="btn danger ghost" id="s-wipe">Erase everything</button>
          </div>
          <input type="file" id="s-file" accept=".json" hidden>
          <p class="muted small">${st.txns.length} transactions · ${st.docs.length} documents · ${st.assets.length} accounts</p>`)}
      </div>
      <div class="grid g-2">
        ${card('☁️ Cloud sync (Supabase)', '', { id: 'cloud-card' })}
        <div></div>
      </div>
      <div class="grid g-2">
        ${card('Categories', `<ul class="cat-list">${['expense', 'income', 'investment', 'saving'].map((type) => `<li class="cat-group"><h4>${U.cap(type)}</h4><div class="chips">${Store.catsOf(type).map((c) => `<span class="chip">${c.icon} ${U.esc(c.name)}${!used.has(c.name) && c.custom ? ` <button class="x" data-delcat="${U.esc(c.name)}" aria-label="Remove">✕</button>` : ''}</span>`).join('')}</div></li>`).join('')}</ul>
          <form class="inline" id="cat-add"><input name="icon" placeholder="🙂" maxlength="4" class="xs"><input name="name" placeholder="New category" required><select name="type"><option value="expense">Expense</option><option value="income">Income</option><option value="investment">Investment</option></select><button class="btn">Add</button></form>`)}
        ${card('Auto-categorize rules', `<p class="muted small">When a payee contains the text, SpendWise picks the category and workspace. Rules are learned automatically when you save entries.</p>
          <form class="inline" id="rule-add"><input name="match" placeholder="Payee contains…" required><select name="category">${st.categories.map((c) => `<option>${U.esc(c.name)}</option>`).join('')}</select><select name="workspace"><option value="">Any</option><option value="personal">Personal</option><option value="work">Work</option></select><button class="btn">Add</button></form>
          <div class="table-wrap tall"><table class="data-table"><tbody>${st.rules.slice().reverse().map((r) => `<tr><td>"${U.esc(r.match)}"</td><td>→ ${Store.icon(r.category)} ${U.esc(r.category)}</td><td class="muted">${r.workspace || ''}${r.auto ? ' · learned' : ''}</td><td><button class="icon-btn" data-delrule="${r.id}" aria-label="Delete rule">✕</button></td></tr>`).join('') || '<tr><td class="muted">No rules yet.</td></tr>'}</tbody></table></div>`)}
      </div>
      ${card('Keyboard shortcuts', `<dl class="shortcuts"><div><dt><kbd>N</kbd></dt><dd>Add a transaction</dd></div><div><dt><kbd>V</kbd></dt><dd>Add by voice</dd></div><div><dt><kbd>/</kbd></dt><dd>Search transactions</dd></div><div><dt><kbd>G</kbd> then <kbd>D</kbd>/<kbd>T</kbd>/<kbd>A</kbd></dt><dd>Go to Dashboard / Transactions / Analytics</dd></div></dl>`)}`;

    Cloud.renderSettings(U.$('#cloud-card'));
    U.$('#auth-signout-settings')?.addEventListener('click', () => {
      if (confirm('Sign out of your SpendWise session?')) {
        Auth.logout();
      }
    });
    const f = U.$('#sf');
    f.addEventListener('change', () => {
      Object.assign(s, { name: f.name.value, voiceLang: f.voiceLang.value, theme: f.theme.value });
      App.applyTheme();
      Store.commit();
    });
    U.$$('[data-cur]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.cur !== cur) currencyModal(b.dataset.cur); }));
    U.$('#s-backup').addEventListener('click', () => U.download(`spendwise-backup-${U.todayISO()}.json`, Store.exportJSON(), 'application/json'));
    U.$('#s-restore').addEventListener('click', () => U.$('#s-file').click());
    U.$('#s-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !confirm('Replace all current data with this backup?')) return;
      try { Store.importJSON(await U.readFileAs(file, 'text')); U.toast('Backup restored', 'success'); } catch (err) { U.toast(err.message, 'error'); }
    });
    U.$('#s-csv').addEventListener('click', () => { const head = ['date', 'type', 'amount', 'payee', 'category', 'workspace', 'method', 'note']; U.download(`spendwise-all-${U.todayISO()}.csv`, [head.join(','), ...st.txns.map((t) => head.map((h) => `"${String(t[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'), 'text/csv'); });
    U.$('#s-sample').addEventListener('click', () => App.loadSample());
    U.$('#s-wipe').addEventListener('click', () => { if (confirm('Erase ALL transactions, budgets, goals, accounts and documents? This cannot be undone.') && confirm('Really erase everything?')) { Store.reset(); U.toast('All data erased'); } });
    U.$('#cat-add').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = e.target.name.value.trim();
      if (Store.cat(n)) return U.toast('That category exists', 'error');
      st.categories.push({ name: n, type: e.target.type.value, icon: e.target.icon.value || '•', custom: true });
      Store.commit();
    });
    U.$$('[data-delcat]').forEach((b) => b.addEventListener('click', () => { st.categories = st.categories.filter((c) => c.name !== b.dataset.delcat); Store.commit(); }));
    U.$('#rule-add').addEventListener('submit', (e) => { e.preventDefault(); st.rules.push({ id: U.uid(), match: e.target.match.value.trim(), category: e.target.category.value, workspace: e.target.workspace.value || null }); Store.commit(); });
    U.$$('[data-delrule]').forEach((b) => b.addEventListener('click', () => Store.remove('rules', b.dataset.delrule)));
    // Workspace management
    U.$('#ws-add')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = e.target.name.value.trim().toLowerCase().replace(/\s+/g, '-');
      if (!n || s.workspaces.includes(n)) return U.toast('Workspace already exists', 'error');
      s.workspaces.push(n);
      Store.commit();
    });
    U.$$('[data-del-ws]').forEach((b) => b.addEventListener('click', () => {
      s.workspaces = s.workspaces.filter((w) => w !== b.dataset.delWs);
      Store.commit();
    }));
    // Tag management
    U.$('#tag-add')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = e.target.name.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      if (!n || s.tags.includes(n)) return U.toast('Tag already exists', 'error');
      s.tags.push(n);
      Store.commit();
    });
    U.$$('[data-del-tag]').forEach((b) => b.addEventListener('click', () => {
      s.tags = s.tags.filter((t) => t !== b.dataset.delTag);
      Store.commit();
    }));
    // Column visibility management
    U.$$('[data-col]').forEach((cb) => cb.addEventListener('change', () => {
      s.columns[cb.dataset.col] = cb.checked;
      Store.commit();
    }));
  }

  return { budgets, goals, wealth, documents, settings, openDoc, currencyModal };
})());
