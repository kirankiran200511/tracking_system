// Bills & EMIs page: upcoming payments, subscriptions, loans.
Object.assign(Views, (() => {
  const { card } = Views;
  const B = () => Bills;
  const TABS = [['upcoming', 'Upcoming'], ['subscriptions', 'Subscriptions'], ['emis', 'EMIs & loans']];
  let subFilter = 'active';
  let subSort = 'next';

  function bills(root, sub = 'upcoming') {
    const subs = Store.state.subscriptions, loans = Store.state.emis;
    const overdue = Bills.upcoming(0).filter((x) => x.first && x.date < U.todayISO());
    root.innerHTML = `
      <div class="page-head"><div><h1>Bills & EMIs</h1><p class="muted">Every commitment that leaves your account on a schedule — so nothing surprises you.</p></div>
        <div class="row"><button class="btn" id="bl-add-sub">＋ Subscription</button><button class="btn primary" id="bl-add-emi">＋ EMI / loan</button></div></div>
      <div class="kpis k4">
        <div class="kpi"><div class="kpi-label">Due this month (remaining)</div><div class="kpi-value">${U.money(U.sum(Bills.dueThisMonth().filter((x) => x.date >= U.todayISO()), (x) => x.amount))}</div><div class="kpi-foot">${Bills.dueThisMonth().filter((x) => x.date >= U.todayISO()).length} payments</div></div>
        <div class="kpi"><div class="kpi-label">Overdue</div><div class="kpi-value ${overdue.length ? 'neg' : ''}">${overdue.length}</div><div class="kpi-foot">${overdue.length ? U.money(U.sum(overdue, (x) => x.amount)) + ' unconfirmed' : 'all caught up'}</div></div>
        <div class="kpi"><div class="kpi-label">Subscriptions</div><div class="kpi-value">${U.money(Bills.subsMonthly())}<small class="muted">/mo</small></div><div class="kpi-foot">${Bills.activeSubs().length} active · ${U.money(Bills.subsMonthly() * 12)}/yr</div></div>
        <div class="kpi"><div class="kpi-label">EMIs</div><div class="kpi-value">${U.money(Bills.emisMonthly())}<small class="muted">/mo</small></div><div class="kpi-foot">${Bills.activeLoans().length} active · ${U.moneyC(U.sum(Bills.activeLoans(), (l) => Bills.loanState(l).outstanding))} outstanding</div></div>
      </div>
      <nav class="subtabs" role="tablist">${TABS.map(([k, l]) => `<a role="tab" href="#/bills/${k}" class="${k === sub ? 'active' : ''}">${l}${k === 'subscriptions' ? ` <span class="badge muted-badge">${subs.filter((s) => s.status === 'active').length}</span>` : k === 'emis' ? ` <span class="badge muted-badge">${Bills.activeLoans().length}</span>` : overdue.length ? ` <span class="badge danger-badge">${overdue.length}</span>` : ''}</a>`).join('')}</nav>
      <div id="bl-body"></div>`;
    U.$('#bl-add-sub').addEventListener('click', () => subModal());
    U.$('#bl-add-emi').addEventListener('click', () => emiModal());
    const body = U.$('#bl-body');
    return ({ subscriptions: subsTab, emis: emisTab }[sub] || upcomingTab)(body);
  }

  // ---------------- upcoming ----------------
  function upcomingTab(body) {
    const items = Bills.upcoming(60);
    const today = U.todayISO();
    const overdue = items.filter((x) => x.date < today && x.first);
    const next = items.filter((x) => x.date >= today);
    const groups = U.groupBy(next, (x) => { const n = Bills.daysUntil(x.date); return n <= 7 ? 'This week' : n <= 30 ? 'Next 30 days' : 'Later'; });
    const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    const row = (x, isOverdue) => `
      <li class="due-row${isOverdue ? ' overdue' : ''}" data-kind="${x.kind}" data-id="${x.ref.id}" data-date="${x.date}">
        <div class="due-date"><b>${U.parseISO(x.date).getDate()}</b><small>${U.MONTHS[U.parseISO(x.date).getMonth()]}</small></div>
        <span class="cat-ico">${x.kind === 'emi' ? '🏦' : Store.icon(x.category)}</span>
        <div class="due-main"><b>${U.esc(x.name)}</b><small class="muted">${x.kind === 'emi' ? `EMI ${x.seq}/${x.ref.tenure}` : Bills.CYCLES[x.ref.cycle].label} · ${U.esc(x.method || '')} · <span class="${isOverdue ? 'neg' : ''}">${Bills.dueLabel(x.date)}</span></small></div>
        <div class="num due-amt">${U.money(x.amount)}</div>
        ${x.first ? `<div class="due-actions"><button class="btn sm primary" data-pay>✓ Paid</button><button class="btn sm ghost" data-skip title="${x.kind === 'emi' ? 'Paid outside SpendWise — mark done without a transaction' : 'Skip this cycle'}">Skip</button></div>` : '<div class="due-actions"></div>'}
      </li>`;
    const hasAny = Store.state.subscriptions.length || Store.state.emis.length;
    body.innerHTML = !hasAny ? emptyBills() : `
      <div class="grid g-2-1">
        <div>
          ${overdue.length ? card('⚠ Overdue — did these get paid?', `<ul class="due-list">${overdue.map((x) => row(x, true)).join('')}</ul>`, { sub: 'Confirm to log the payment, or skip if it was paid elsewhere', cls: 'overdue-card' }) : ''}
          ${['This week', 'Next 30 days', 'Later'].filter((g) => groups[g]).map((g) => card(g, `<ul class="due-list">${groups[g].map((x) => row(x)).join('')}</ul>`, { extra: `<b class="num">${U.money(U.sum(groups[g], (x) => x.amount))}</b>` })).join('') || card('Coming up', Charts.empty('Nothing due in the next 60 days.'))}
        </div>
        <div class="stack-cards">
          ${card('Reminders', perm === 'granted' ? '<p>🔔 On. You’ll get a notification when you open SpendWise and something is due within its reminder window (default 3 days).</p>' : perm === 'denied' ? '<p class="muted">Notifications are blocked for this site. Allow them in the browser’s site settings.</p>' : perm === 'unsupported' ? '<p class="muted">This browser does not support notifications.</p>' : '<p>Get a heads-up before renewals and EMI dates.</p><button class="btn primary" id="bl-notify">🔔 Enable reminders</button>')}
          ${card('Next 60 days by week', '', { id: 'bl-weeks' })}
        </div>
      </div>`;
    bindEmpty(body);
    U.$$('.due-row', body).forEach((li) => {
      const item = Bills.upcoming(60).concat(overdue).find((x) => x.ref.id === li.dataset.id && x.date === li.dataset.date);
      U.$('[data-pay]', li)?.addEventListener('click', () => payModal(item));
      U.$('[data-skip]', li)?.addEventListener('click', () => { Bills.skip(item); U.toast(`${item.name}: moved to next due date`); });
    });
    U.$('#bl-notify')?.addEventListener('click', async () => { const p = await Notification.requestPermission(); if (p === 'granted') { localStorage.removeItem('spendwise.reminded.' + U.todayISO()); Bills.remind(); } App.rerender(); });
    const draw = () => {
      const host = U.$('#bl-weeks');
      if (!host) return;
      const weeks = Array.from({ length: 9 }, (_, i) => ({ label: i === 0 ? 'This wk' : U.fmtDate(U.iso(U.addDays(new Date(), i * 7)), { short: true }), values: { sub: 0, emi: 0 } }));
      next.forEach((x) => { const w = Math.floor(Bills.daysUntil(x.date) / 7); if (weeks[w]) weeks[w].values[x.kind] += x.amount; });
      Charts.columns(host, { data: weeks, series: [{ key: 'emi', name: 'EMIs', color: 'var(--s1)' }, { key: 'sub', name: 'Subscriptions', color: 'var(--s2)' }], height: 200, labelEvery: 2 });
      host.insertAdjacentHTML('afterbegin', Charts.legend([{ name: 'EMIs', color: 'var(--s1)' }, { name: 'Subscriptions', color: 'var(--s2)' }]));
    };
    if (hasAny) draw();
    return draw;
  }

  function payModal(item) {
    App.modal(`<div class="modal-head"><h2>Log payment — ${U.esc(item.name)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="grid-form" id="pay-f">
        <label>Amount paid<input name="amount" type="number" step="0.01" required value="${Math.round(item.amount * 100) / 100}"></label>
        <label>Paid on<input name="date" type="date" required value="${item.date <= U.todayISO() ? item.date : U.todayISO()}"></label>
        <p class="muted small full">Adds a ${item.kind === 'emi' ? '“EMI & Loans”' : `“${U.esc(item.ref.category || 'Subscriptions')}”`} expense and moves the next due date forward.</p>
        <div class="row-end full"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Log payment</button></div>
      </form>`);
    U.$('#pay-f').addEventListener('submit', (e) => {
      e.preventDefault();
      Bills.logPayment(item, { amount: Number(e.target.amount.value), date: e.target.date.value });
      App.closeModal();
      U.toast('Payment logged', 'success');
    });
  }

  const emptyBills = () => `<div class="empty"><div class="empty-art">🗓️</div><h2>Track your subscriptions and EMIs</h2>
    <p>Add Netflix, phone, broadband, insurance premiums and loans once — SpendWise shows what’s due, reminds you, and links payments automatically.</p>
    <div class="row-center"><button class="btn primary" data-new-sub>＋ Add subscription</button><button class="btn" data-new-emi>＋ Add EMI / loan</button>${A.recurring(Store.state.txns).length ? '<a class="btn ghost" href="#/bills/subscriptions">See detected ones</a>' : ''}</div></div>`;
  const bindEmpty = (el) => { U.$('[data-new-sub]', el)?.addEventListener('click', () => subModal()); U.$('[data-new-emi]', el)?.addEventListener('click', () => emiModal()); };

  // ---------------- subscriptions ----------------
  function subsTab(body) {
    const st = Store.state;
    const all = st.subscriptions;
    let list = all.filter((s) => subFilter === 'all' || s.status === subFilter);
    list = [...list].sort((a, b) => (subSort === 'cost' ? Bills.monthly(b) - Bills.monthly(a) : subSort === 'name' ? a.name.localeCompare(b.name) : a.nextDate < b.nextDate ? -1 : 1));
    const active = all.filter((s) => s.status === 'active');
    const rarely = active.filter((s) => s.usage === 'rarely');
    const cancelled = all.filter((s) => s.status === 'cancelled');
    const savedByCancel = U.sum(cancelled, (s) => Bills.monthly(s) * Math.max(Math.floor(U.daysBetween(s.cancelledAt || U.todayISO(), U.todayISO()) / 30.44), 0));
    const known = new Set(all.map((s) => U.normPayee(s.name)));
    const suggestions = A.recurring(st.txns).filter((r) => !r.stale && r.category !== 'EMI & Loans' && r.category !== 'Rent & Housing' && ![...known].some((k) => k && (U.normPayee(r.payee).includes(k) || k.includes(U.normPayee(r.payee)))));
    const usageChip = (s) => `<button class="usage u-${s.usage || 'unset'}" data-usage="${s.id}" title="How often do you use it? Click to change">${s.usage ? Bills.USAGE[s.usage] : 'Rate usage'}</button>`;
    body.innerHTML = `
      <div class="kpis k4">
        <div class="kpi"><div class="kpi-label">Active</div><div class="kpi-value">${active.length}</div><div class="kpi-foot">${all.filter((s) => s.status === 'paused').length} paused · ${cancelled.length} cancelled</div></div>
        <div class="kpi"><div class="kpi-label">Monthly cost</div><div class="kpi-value">${U.money(Bills.subsMonthly())}</div><div class="kpi-foot">${U.money(Bills.subsMonthly() * 12)} per year</div></div>
        <div class="kpi"><div class="kpi-label">Rarely used</div><div class="kpi-value ${rarely.length ? 'neg' : ''}">${U.money(U.sum(rarely, Bills.monthly) * 12)}<small class="muted">/yr</small></div><div class="kpi-foot">${rarely.length ? `${rarely.length} to review: ${rarely.slice(0, 2).map((s) => U.esc(s.name)).join(', ')}` : 'rate usage to find waste'}</div></div>
        <div class="kpi"><div class="kpi-label">Saved by cancelling</div><div class="kpi-value">${U.money(savedByCancel)}</div><div class="kpi-foot">since you cancelled</div></div>
      </div>
      ${suggestions.length ? card('💡 Looks like subscriptions', `<ul class="suggest-list">${suggestions.slice(0, 6).map((r, i) => `<li><span class="cat-ico">${Store.icon(r.category)}</span><div><b>${U.esc(r.payee)}</b><small class="muted">${r.cadence} · about ${U.money(r.avg)} · last ${U.fmtDate(r.last, { short: true })}</small></div><button class="btn sm" data-suggest="${i}">＋ Track</button></li>`).join('')}</ul>`, { sub: 'Detected from repeating payments in your transactions' }) : ''}
      <div class="card flush">
        <div class="table-tools">
          <div class="seg sm" id="sub-f">${[['active', 'Active'], ['paused', 'Paused'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l]) => `<button class="${k === subFilter ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
          <select id="sub-sort" class="btn sm"><option value="next" ${subSort === 'next' ? 'selected' : ''}>Sort: next renewal</option><option value="cost" ${subSort === 'cost' ? 'selected' : ''}>Sort: monthly cost</option><option value="name" ${subSort === 'name' ? 'selected' : ''}>Sort: name</option></select>
        </div>
        ${list.length ? `<div class="table-wrap"><table class="data-table subs-table"><thead><tr><th>Service</th><th class="num">Amount</th><th class="num">≈ / month</th><th>Next renewal</th><th>Usage</th><th>Paid via</th><th></th></tr></thead><tbody>
          ${list.map((s) => `<tr data-id="${s.id}" class="${s.status !== 'active' ? 'dim' : ''}">
            <td><div class="payee-cell"><span class="cat-ico">${Store.icon(s.category)}</span><div><b>${U.esc(s.name)}</b><small class="muted block">${U.esc(s.category)}${s.workspace === 'work' ? ' · Work' : ''}${s.status !== 'active' ? ` · ${U.cap(s.status)}` : ''}</small></div></div></td>
            <td class="num">${U.money(s.amount)}<small class="muted block">${Bills.CYCLES[s.cycle].label}${s.variable ? ' · varies' : ''}</small></td>
            <td class="num">${U.money(Bills.monthly(s))}</td>
            <td>${s.status === 'active' ? `${U.fmtDate(s.nextDate, { short: true })} <small class="${Bills.daysUntil(s.nextDate) < 0 ? 'neg' : 'muted'}">${Bills.dueLabel(s.nextDate)}</small>` : '—'}</td>
            <td>${usageChip(s)}</td>
            <td class="muted">${U.esc(s.method || '')}</td>
            <td><div class="cell-actions">${s.status === 'active' ? '<button class="btn sm" data-pay>✓ Paid</button>' : ''}${s.url ? `<a class="icon-btn" href="${U.esc(s.url)}" target="_blank" rel="noopener noreferrer" title="Manage / cancel">↗</a>` : ''}<button class="icon-btn" data-edit aria-label="Edit">✎</button></div></td>
          </tr>`).join('')}</tbody></table></div>` : `<div class="empty-mini">${all.length ? 'Nothing in this view.' : 'No subscriptions yet — add one or track a detected one above.'}</div>`}
      </div>
      ${active.length ? card('Where the subscription money goes', '', { id: 'sub-cats', sub: 'Monthly equivalent by category' }) : ''}`;
    U.$$('#sub-f button').forEach((b) => b.addEventListener('click', () => { subFilter = b.dataset.k; subsTab(body); }));
    U.$('#sub-sort').addEventListener('change', (e) => { subSort = e.target.value; subsTab(body); });
    U.$$('[data-suggest]', body).forEach((b) => b.addEventListener('click', () => {
      const r = suggestions[Number(b.dataset.suggest)];
      const cycle = { Weekly: 'weekly', Monthly: 'monthly', Fortnightly: 'weekly', Quarterly: 'quarterly', Yearly: 'yearly' }[r.cadence] || 'monthly';
      subModal({ name: r.payee, amount: Math.round(r.amount), cycle, nextDate: r.next < U.todayISO() ? Bills.advance(r.next, cycle) : r.next, category: r.category, workspace: r.workspace, variable: Math.abs(r.amount - r.avg) > r.avg * 0.1 });
    }));
    U.$$('tr[data-id]', body).forEach((tr) => {
      const s = st.subscriptions.find((x) => x.id === tr.dataset.id);
      U.$('[data-edit]', tr).addEventListener('click', () => subModal(s));
      U.$('[data-pay]', tr)?.addEventListener('click', () => payModal({ kind: 'sub', ref: s, name: s.name, amount: s.amount, date: s.nextDate }));
      U.$('[data-usage]', tr).addEventListener('click', () => {
        const order = ['often', 'sometimes', 'rarely'];
        Store.upsert('subscriptions', { id: s.id, usage: order[(order.indexOf(s.usage) + 1) % 3] });
      });
    });
    const draw = () => {
      const host = U.$('#sub-cats');
      if (!host) return;
      const rows = Object.entries(U.groupBy(active, (s) => s.category)).map(([k, v]) => ({ key: k, value: U.sum(v, Bills.monthly), count: v.length })).sort((a, b) => b.value - a.value);
      Charts.ranked(host, { rows, total: Bills.subsMonthly(), icon: (r) => Store.icon(r.key), sub: (r) => `${r.count}×`, color: 'var(--s2)' });
    };
    draw();
    return draw;
  }

  function subModal(s = {}) {
    const cats = Store.catsOf('expense');
    App.modal(`<div class="modal-head"><h2>${s.id ? 'Edit' : 'Add'} subscription</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="grid-form" id="sub-form">
        <label class="full">Service<input name="name" required value="${U.esc(s.name || '')}" placeholder="Netflix, Airtel postpaid, Google One, gym…" list="sub-names"></label>
        <datalist id="sub-names">${['Netflix', 'Amazon Prime', 'Disney+ Hotstar', 'Spotify', 'YouTube Premium', 'Apple iCloud', 'Google One', 'JioCinema', 'Zee5', 'SonyLIV', 'Airtel', 'Jio', 'ACT Fibernet', 'Cult.fit', 'ChatGPT Plus', 'Claude Pro', 'Microsoft 365', 'Adobe', 'Notion', 'LinkedIn Premium', 'Swiggy One', 'Zomato Gold'].map((n) => `<option value="${n}">`).join('')}</datalist>
        <label>Amount<input name="amount" type="number" step="0.01" min="0" required value="${s.amount ?? ''}"></label>
        <label>Billing cycle<select name="cycle">${Object.entries(Bills.CYCLES).map(([k, v]) => `<option value="${k}" ${k === (s.cycle || 'monthly') ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
        <label>Next renewal<input name="nextDate" type="date" required value="${s.nextDate || U.todayISO()}"></label>
        <label>Category<select name="category">${cats.map((c) => `<option ${c.name === (s.category || 'Subscriptions') ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select></label>
        <label>Paid via<select name="method">${Store.METHODS.map((m) => `<option ${m === (s.method || 'Card') ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label>Workspace<select name="workspace"><option value="personal">Personal</option><option value="work" ${s.workspace === 'work' ? 'selected' : ''}>Work</option></select></label>
        <label>How often you use it<select name="usage"><option value="">Not rated</option>${Object.entries(Bills.USAGE).map(([k, v]) => `<option value="${k}" ${k === s.usage ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Remind me<select name="reminderDays">${[0, 1, 3, 7].map((d) => `<option value="${d}" ${d === (s.reminderDays ?? 3) ? 'selected' : ''}>${d ? `${d} day${d > 1 ? 's' : ''} before` : 'On the day'}</option>`).join('')}</select></label>
        <label>Status<select name="status">${['active', 'paused', 'cancelled'].map((k) => `<option value="${k}" ${k === (s.status || 'active') ? 'selected' : ''}>${U.cap(k)}</option>`).join('')}</select></label>
        <label class="full">Manage / cancel link<input name="url" type="url" value="${U.esc(s.url || '')}" placeholder="https://… (optional)"></label>
        <label class="check full"><input type="checkbox" name="variable" ${s.variable ? 'checked' : ''}> Amount varies (usage-based bill like electricity or cloud)</label>
        <div class="row-end full">${s.id ? '<button type="button" class="btn danger ghost" id="sub-del">Delete</button><span class="spacer"></span>' : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`);
    const f = U.$('#sub-form');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const status = f.status.value;
      Store.upsert('subscriptions', {
        ...(s.id ? { id: s.id } : { createdAt: U.todayISO() }), name: f.name.value.trim(), amount: Number(f.amount.value), cycle: f.cycle.value, nextDate: f.nextDate.value,
        category: f.category.value, method: f.method.value, workspace: f.workspace.value, usage: f.usage.value || null, reminderDays: Number(f.reminderDays.value),
        status, url: f.url.value.trim(), variable: f.variable.checked, cancelledAt: status === 'cancelled' ? (s.cancelledAt || U.todayISO()) : null,
      });
      App.closeModal();
      U.toast(status === 'cancelled' && s.status !== 'cancelled' ? `Cancelled — saving ${U.money(Bills.monthly({ amount: Number(f.amount.value), cycle: f.cycle.value }) * 12)} a year` : 'Saved', 'success');
    });
    U.$('#sub-del')?.addEventListener('click', () => { if (confirm(`Delete ${s.name}? Past payments stay in Transactions.`)) { Store.remove('subscriptions', s.id); App.closeModal(); } });
  }

  // ---------------- EMIs ----------------
  function emisTab(body) {
    const loans = Store.state.emis;
    const rows = loans.map((l) => ({ l, s: Bills.loanState(l) })).sort((a, b) => a.s.closed - b.s.closed || (a.s.nextDue || '') .localeCompare(b.s.nextDue || ''));
    const active = rows.filter((r) => !r.s.closed);
    const proj = Bills.debtProjection();
    const debtFree = proj.length ? proj[proj.length - 1].key : null;
    const income = Health.metrics().base.income;
    body.innerHTML = !loans.length ? emptyBills() : `
      <div class="kpis k4">
        <div class="kpi"><div class="kpi-label">Outstanding</div><div class="kpi-value">${U.money(U.sum(active, (r) => r.s.outstanding))}</div><div class="kpi-foot">principal still owed</div></div>
        <div class="kpi"><div class="kpi-label">Monthly EMIs</div><div class="kpi-value">${U.money(Bills.emisMonthly())}</div><div class="kpi-foot">${income ? `${U.pct(Bills.emisMonthly() / income)} of income (FOIR)` : ''}</div></div>
        <div class="kpi"><div class="kpi-label">Interest still to pay</div><div class="kpi-value">${U.money(U.sum(active, (r) => r.s.interestLeft))}</div><div class="kpi-foot">if paid as scheduled</div></div>
        <div class="kpi"><div class="kpi-label">Debt-free by</div><div class="kpi-value">${debtFree ? U.fmtMonth(debtFree) : '—'}</div><div class="kpi-foot">${debtFree ? `${Math.max(proj.length - 1, 0)} months to go` : ''}</div></div>
      </div>
      <div class="loan-grid">${rows.map(({ l, s }) => `
        <article class="card loan${s.closed ? ' dim' : ''}" data-id="${l.id}">
          <div class="loan-top"><div><b>${U.esc(l.name)}</b><small class="muted block">${Bills.LOAN_KINDS[l.kind] || ''}${l.lender ? ' · ' + U.esc(l.lender) : ''} · ${l.rate}% p.a.</small></div>
            ${s.closed ? '<span class="status s-good">✓ Closed</span>' : `<span class="status ${Bills.daysUntil(s.nextDue) < 0 ? 's-critical' : Bills.daysUntil(s.nextDue) <= 5 ? 's-warning' : 's-good'}">${Bills.daysUntil(s.nextDue) < 0 ? '✕' : Bills.daysUntil(s.nextDue) <= 5 ? '!' : '✓'} Next: ${U.fmtDate(s.nextDue, { short: true })} · ${Bills.dueLabel(s.nextDue)}</span>`}</div>
          <div class="loan-emi"><b>${U.money(l.emi)}</b><span class="muted">/month · EMI ${Math.min(s.paid + (s.closed ? 0 : 1), l.tenure)} of ${l.tenure}</span></div>
          <div class="meter lg"><span class="m-good" style="width:${(s.paid / l.tenure) * 100}%"></span></div>
          <dl class="loan-facts">
            <div><dt>Outstanding</dt><dd>${U.money(s.outstanding)}</dd></div>
            <div><dt>Principal repaid</dt><dd>${U.pct(1 - s.outstanding / l.principal)}</dd></div>
            <div><dt>Interest paid</dt><dd>${U.money(s.interestPaid)}</dd></div>
            <div><dt>Ends</dt><dd>${U.fmtDate(s.endDate, { short: true })} ${s.endDate.slice(0, 4)}</dd></div>
          </dl>
          <div class="row">${s.closed ? '' : '<button class="btn sm primary" data-pay>✓ Pay EMI</button>'}<button class="btn sm" data-sched>Schedule & prepay</button><button class="btn sm ghost" data-edit>Edit</button></div>
        </article>`).join('')}</div>
      ${proj.length > 1 ? card('Road to debt-free', '', { id: 'emi-proj', sub: 'Total outstanding principal if every EMI is paid on time' }) : ''}`;
    bindEmpty(body);
    U.$$('.loan', body).forEach((el) => {
      const l = loans.find((x) => x.id === el.dataset.id);
      const s = Bills.loanState(l);
      U.$('[data-pay]', el)?.addEventListener('click', () => payModal({ kind: 'emi', ref: l, name: l.name, amount: l.emi, date: s.nextDue }));
      U.$('[data-sched]', el).addEventListener('click', () => scheduleModal(l));
      U.$('[data-edit]', el).addEventListener('click', () => emiModal(l));
    });
    const draw = () => {
      const host = U.$('#emi-proj');
      if (host) Charts.line(host, { data: proj.map((p) => ({ label: U.fmtMonth(p.key), value: p.value })), name: 'Outstanding', color: 'var(--s1)' });
    };
    draw();
    return draw;
  }

  function emiModal(l = {}) {
    App.modal(`<div class="modal-head"><h2>${l.id ? 'Edit' : 'Add'} EMI / loan</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="grid-form" id="emi-form">
        <label class="full">Name<input name="name" required value="${U.esc(l.name || '')}" placeholder="e.g. HDFC Car Loan, iPhone on no-cost EMI"></label>
        <label>Type<select name="kind">${Object.entries(Bills.LOAN_KINDS).map(([k, v]) => `<option value="${k}" ${k === (l.kind || 'personal') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Lender<input name="lender" value="${U.esc(l.lender || '')}" placeholder="HDFC Bank, Bajaj Finserv…"></label>
        <label>Loan amount (principal)<input name="principal" type="number" min="1" step="1" required value="${l.principal || ''}"></label>
        <label>Interest rate (% p.a.)<input name="rate" type="number" min="0" step="0.01" required value="${l.rate ?? ''}" placeholder="0 for no-cost EMI"></label>
        <label>Tenure (months)<input name="tenure" type="number" min="1" step="1" required value="${l.tenure || ''}"></label>
        <label>First EMI date<input name="startDate" type="date" required value="${l.startDate || U.todayISO()}"></label>
        <label>EMI amount<input name="emi" type="number" min="0" step="0.01" value="${l.emi ? Math.round(l.emi * 100) / 100 : ''}" placeholder="auto-calculated"></label>
        <label>EMIs already paid before tracking<input name="paidBefore" type="number" min="0" step="1" value="${l.paidBefore ?? ''}" placeholder="auto from first EMI date"></label>
        <label>Paid via<select name="method">${Store.METHODS.map((m) => `<option ${m === (l.method || 'Auto-debit') ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label>Workspace<select name="workspace"><option value="personal">Personal</option><option value="work" ${l.workspace === 'work' ? 'selected' : ''}>Work</option></select></label>
        <label>Remind me<select name="reminderDays">${[0, 1, 3, 7].map((d) => `<option value="${d}" ${d === (l.reminderDays ?? 3) ? 'selected' : ''}>${d ? `${d} day${d > 1 ? 's' : ''} before` : 'On the day'}</option>`).join('')}</select></label>
        <label class="check full"><input type="checkbox" name="trackInWealth" ${l.id ? (l.trackInWealth ? 'checked' : '') : 'checked'}> Show the outstanding balance as a liability in Wealth (net worth)</label>
        <div class="full calc-box" id="emi-calc"></div>
        <div class="row-end full">${l.id ? '<button type="button" class="btn danger ghost" id="emi-del">Delete</button><span class="spacer"></span>' : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`, { wide: true });
    const f = U.$('#emi-form');
    const calc = () => {
      const P = Number(f.principal.value), r = Number(f.rate.value), n = Number(f.tenure.value);
      const emi = Number(f.emi.value) || Bills.emiAmount(P, r, n);
      // EMIs whose due date is already behind us
      let monthsSince = 0;
      if (f.startDate.value) while (monthsSince < n && Bills.addMonths(f.startDate.value, monthsSince) < U.todayISO()) monthsSince++;
      if (!f.paidBefore.value && !l.id) f.paidBefore.placeholder = `${monthsSince} (auto)`;
      U.$('#emi-calc').innerHTML = P && n ? `EMI <b>${U.money(emi)}</b> · total interest <b>${U.money(emi * n - P)}</b> · total payable <b>${U.money(emi * n)}</b> · last EMI <b>${f.startDate.value ? U.fmtDate(Bills.addMonths(f.startDate.value, n - 1)) : '—'}</b>` : '<span class="muted">Enter amount, rate and tenure to calculate the EMI.</span>';
      return { emi, monthsSince };
    };
    f.addEventListener('input', calc);
    calc();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const { emi, monthsSince } = calc();
      const data = {
        ...(l.id ? { id: l.id, assetId: l.assetId } : { assetId: U.uid() }), name: f.name.value.trim(), kind: f.kind.value, lender: f.lender.value.trim(), principal: Number(f.principal.value),
        rate: Number(f.rate.value), tenure: Number(f.tenure.value), startDate: f.startDate.value, emi: Math.round(emi * 100) / 100,
        paidBefore: f.paidBefore.value === '' ? (l.id ? l.paidBefore : monthsSince) : Number(f.paidBefore.value),
        method: f.method.value, workspace: f.workspace.value, reminderDays: Number(f.reminderDays.value), trackInWealth: f.trackInWealth.checked, status: 'active',
      };
      const saved = Store.upsert('emis', data);
      if (saved.trackInWealth) Bills.syncLoanAsset(saved);
      else if (l.assetId && Store.state.assets.some((a) => a.id === l.assetId) && confirm('Also remove its liability from Wealth?')) Store.remove('assets', l.assetId);
      App.closeModal();
      U.toast('Saved', 'success');
    });
    U.$('#emi-del')?.addEventListener('click', () => {
      if (!confirm(`Delete ${l.name}? Past EMI payments stay in Transactions.`)) return;
      Store.remove('emis', l.id);
      if (l.assetId && Store.state.assets.some((a) => a.id === l.assetId)) Store.remove('assets', l.assetId);
      App.closeModal();
    });
  }

  function scheduleModal(l) {
    const s = Bills.loanState(l);
    const sched = Bills.schedule(l);
    const years = Object.entries(U.groupBy(sched, (r) => r.date.slice(0, 4))).map(([y, rs]) => ({ y, principal: U.sum(rs, (r) => r.principal), interest: U.sum(rs, (r) => r.interest), balance: rs[rs.length - 1].balance, n: rs.length }));
    App.modal(`<div class="modal-head"><h2>${U.esc(l.name)} — schedule</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <dl class="mini-stats five">
        <div><dt>EMI</dt><dd>${U.money(l.emi)}</dd></div><div><dt>Paid</dt><dd>${s.paid} / ${l.tenure}</dd></div>
        <div><dt>Outstanding</dt><dd>${U.money(s.outstanding)}</dd></div><div><dt>Interest left</dt><dd>${U.money(s.interestLeft)}</dd></div><div><dt>Total interest</dt><dd>${U.money(s.totalInterest)}</dd></div>
      </dl>
      ${s.closed || !l.rate ? '' : `<div class="calc-box prepay">
        <b>Prepayment calculator</b> <span class="muted small">(keep the same EMI, shorten the tenure)</span>
        <div class="inline"><input type="number" id="pp-amt" min="0" step="10000" placeholder="Prepay amount" value="${Math.round(Math.min(s.outstanding * 0.2, 200000) / 10000) * 10000 || ''}"><span id="pp-out"></span></div>
      </div>`}
      <h4>Year by year</h4>
      <div class="table-wrap tall"><table class="data-table"><thead><tr><th>Year</th><th class="num">EMIs</th><th class="num">Principal</th><th class="num">Interest</th><th class="num">Balance at year end</th></tr></thead><tbody>
        ${years.map((r) => `<tr><td>${r.y}</td><td class="num">${r.n}</td><td class="num">${U.money(r.principal)}</td><td class="num">${U.money(r.interest)}</td><td class="num">${U.money(r.balance)}</td></tr>`).join('')}
      </tbody></table></div>
      <details><summary>Full month-by-month schedule (${sched.length} EMIs)</summary><div class="table-wrap tall"><table class="data-table"><thead><tr><th>#</th><th>Date</th><th class="num">Principal</th><th class="num">Interest</th><th class="num">Balance</th></tr></thead><tbody>
        ${sched.map((r) => `<tr class="${r.n <= s.paid ? 'dim' : r.n === s.paid + 1 ? 'sel' : ''}"><td>${r.n}${r.n <= s.paid ? ' ✓' : ''}</td><td>${U.fmtDate(r.date)}</td><td class="num">${U.money(r.principal)}</td><td class="num">${U.money(r.interest)}</td><td class="num">${U.money(r.balance)}</td></tr>`).join('')}
      </tbody></table></div></details>`, { wide: true });
    const pp = U.$('#pp-amt');
    if (pp) {
      const upd = () => {
        const amt = Number(pp.value);
        if (!amt) { U.$('#pp-out').textContent = ''; return; }
        const r = Bills.prepayment(l, amt);
        U.$('#pp-out').innerHTML = `saves <b>${U.money(r.interestSaved)}</b> interest and <b>${r.monthsSaved} EMIs</b> — loan ends ${U.fmtMonth(r.newEnd.slice(0, 7))} instead of ${U.fmtMonth(s.endDate.slice(0, 7))}`;
      };
      pp.addEventListener('input', upd);
      upd();
    }
  }

  return { bills };
})());
