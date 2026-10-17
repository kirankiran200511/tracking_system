// Subscriptions & EMIs: calculations, due dates, auto-linking payments, reminders.
const Bills = (() => {
  const CYCLES = { weekly: { label: 'Weekly', perMonth: 52 / 12 }, monthly: { label: 'Monthly', perMonth: 1 }, quarterly: { label: 'Quarterly', perMonth: 1 / 3 }, 'half-yearly': { label: 'Half-yearly', perMonth: 1 / 6 }, yearly: { label: 'Yearly', perMonth: 1 / 12 } };
  const LOAN_KINDS = { home: '🏠 Home loan', car: '🚗 Vehicle loan', personal: '💳 Personal loan', education: '🎓 Education loan', consumer: '📱 Consumer / no-cost EMI', gold: '🪙 Gold loan', business: '🏢 Business loan', other: '🧾 Other loan' };
  const USAGE = { often: 'Use often', sometimes: 'Sometimes', rarely: 'Rarely use' };

  // ---------- date helpers ----------
  function addMonths(iso, k) {
    const d = U.parseISO(iso);
    const day = d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + k, 1);
    t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
    return U.iso(t);
  }
  function advance(iso, cycle, times = 1) {
    if (cycle === 'weekly') return U.iso(U.addDays(U.parseISO(iso), 7 * times));
    const months = { monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 }[cycle] || 1;
    return addMonths(iso, months * times);
  }
  const daysUntil = (iso) => U.daysBetween(U.todayISO(), iso);
  const dueLabel = (iso) => { const n = daysUntil(iso); return n < 0 ? `${-n}d overdue` : n === 0 ? 'due today' : n === 1 ? 'tomorrow' : `in ${n}d`; };

  // ---------- subscriptions ----------
  const monthly = (s) => s.amount * (CYCLES[s.cycle]?.perMonth || 1);
  const activeSubs = () => Store.state.subscriptions.filter((s) => s.status === 'active');
  const subsMonthly = () => U.sum(activeSubs(), monthly);

  // ---------- EMI maths ----------
  function emiAmount(principal, ratePct, months) {
    const r = ratePct / 1200;
    if (!months) return 0;
    if (!r) return principal / months;
    const f = (1 + r) ** months;
    return (principal * r * f) / (f - 1);
  }
  function balanceAfter(principal, ratePct, emi, k) {
    const r = ratePct / 1200;
    if (!r) return Math.max(principal - emi * k, 0);
    const f = (1 + r) ** k;
    return Math.max(principal * f - (emi * (f - 1)) / r, 0);
  }
  function schedule(l) {
    const rows = [];
    let bal = l.principal;
    const r = l.rate / 1200;
    for (let i = 0; i < l.tenure && bal > 0.5; i++) {
      const interest = bal * r;
      const principal = Math.min(l.emi - interest, bal);
      bal -= principal;
      rows.push({ n: i + 1, date: addMonths(l.startDate, i), interest, principal, balance: Math.max(bal, 0) });
    }
    return rows;
  }
  const paidCount = (l) => (Number(l.paidBefore) || 0) + Store.state.txns.filter((t) => t.linkId === l.id).length;
  function loanState(l) {
    const paid = Math.min(paidCount(l), l.tenure);
    const outstanding = balanceAfter(l.principal, l.rate, l.emi, paid);
    const totalInterest = l.emi * l.tenure - l.principal;
    const interestPaid = paid * l.emi - (l.principal - outstanding);
    const closed = paid >= l.tenure || outstanding < 1 || l.status === 'closed';
    return {
      paid, remaining: Math.max(l.tenure - paid, 0), outstanding: closed ? 0 : outstanding, totalInterest, interestPaid: Math.max(interestPaid, 0),
      interestLeft: Math.max(totalInterest - interestPaid, 0), nextDue: closed ? null : addMonths(l.startDate, paid), endDate: addMonths(l.startDate, l.tenure - 1), closed,
    };
  }
  const activeLoans = () => Store.state.emis.filter((l) => !loanState(l).closed);
  const emisMonthly = () => U.sum(activeLoans(), (l) => l.emi);

  // Prepay `amount` now keeping EMI the same → months and interest saved.
  function prepayment(l, amount) {
    const st = loanState(l);
    const r = l.rate / 1200;
    const b0 = st.outstanding, b1 = Math.max(b0 - amount, 0);
    const monthsFor = (b) => (b <= 0 ? 0 : !r ? Math.ceil(b / l.emi) : Math.ceil(-Math.log(1 - (b * r) / l.emi) / Math.log(1 + r)));
    const m0 = monthsFor(b0), m1 = monthsFor(b1);
    const interest0 = m0 * l.emi - b0, interest1 = m1 * l.emi - b1;
    return { monthsSaved: Math.max(m0 - m1, 0), interestSaved: Math.max(interest0 - interest1, 0), newEnd: m1 ? addMonths(st.nextDue || U.todayISO(), m1 - 1) : U.todayISO() };
  }

  // Month-by-month total outstanding for all active loans (for the debt-free chart).
  function debtProjection() {
    const loans = activeLoans().map((l) => ({ l, s: loanState(l) }));
    if (!loans.length) return [];
    const out = [];
    const start = new Date(); start.setDate(1);
    for (let m = 0; m < 480; m++) {
      const key = U.iso(new Date(start.getFullYear(), start.getMonth() + m, 1)).slice(0, 7);
      const total = U.sum(loans, ({ l, s }) => balanceAfter(l.principal, l.rate, l.emi, Math.min(s.paid + m, l.tenure)));
      out.push({ key, value: total });
      if (total < 1) break;
    }
    return out;
  }

  // ---------- upcoming payments ----------
  function upcoming(days = 45) {
    const end = U.iso(U.addDays(new Date(), days));
    const items = [];
    activeSubs().forEach((s) => {
      let d = s.nextDate;
      for (let i = 0; i < 12 && d <= end; i++) { items.push({ kind: 'sub', ref: s, name: s.name, amount: s.amount, date: d, first: i === 0, category: s.category, method: s.method }); d = advance(d, s.cycle); }
    });
    activeLoans().forEach((l) => {
      const st = loanState(l);
      let d = st.nextDue;
      for (let i = 0; i < st.remaining && d <= end; i++) { items.push({ kind: 'emi', ref: l, name: l.name, amount: l.emi, date: d, first: i === 0, seq: st.paid + 1 + i, category: 'EMI & Loans', method: l.method }); d = addMonths(d, 1); }
    });
    return items.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  const dueThisMonth = () => {
    const end = U.iso(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
    return upcoming(40).filter((x) => x.date <= end);
  };

  // ---------- paying ----------
  function logPayment(item, { date, amount } = {}) {
    const base = { date: date || (item.date <= U.todayISO() ? item.date : U.todayISO()), amount: amount ?? item.amount, type: 'expense', payee: item.name, method: item.ref.method || 'Auto-debit', workspace: item.ref.workspace || 'personal', linkId: item.ref.id, source: 'bill' };
    if (item.kind === 'sub') {
      Store.addTxn({ ...base, category: item.ref.category || 'Subscriptions', note: `${CYCLES[item.ref.cycle].label} subscription` });
      Store.upsert('subscriptions', { id: item.ref.id, nextDate: advance(item.ref.nextDate, item.ref.cycle) });
    } else {
      const st = loanState(item.ref);
      Store.addTxn({ ...base, category: 'EMI & Loans', note: `EMI ${st.paid + 1} of ${item.ref.tenure}` });
      syncLoanAsset(item.ref);
    }
  }
  function skip(item) {
    if (item.kind === 'sub') Store.upsert('subscriptions', { id: item.ref.id, nextDate: advance(item.ref.nextDate, item.ref.cycle) });
    else Store.upsert('emis', { id: item.ref.id, paidBefore: (Number(item.ref.paidBefore) || 0) + 1 }), syncLoanAsset(item.ref);
  }

  // Keep a linked "loan" liability in Wealth up to date with the outstanding principal.
  function syncLoanAsset(l) {
    if (!l.trackInWealth) return;
    const st = loanState(Store.state.emis.find((x) => x.id === l.id) || l);
    const today = U.todayISO();
    let a = Store.state.assets.find((x) => x.id === l.assetId);
    if (!a) {
      a = { id: l.assetId || U.uid(), name: l.name, kind: 'loan', history: [] };
      Store.state.assets.push(a);
      if (!l.assetId) { const e = Store.state.emis.find((x) => x.id === l.id); if (e) e.assetId = a.id; }
    }
    a.name = l.name;
    a.history = a.history.filter((h) => h.date !== today).concat({ date: today, value: Math.round(st.outstanding) });
    Store.commit();
  }

  // When a new transaction looks like a known subscription/EMI payment, link it and advance the due date.
  function autoLink(txns) {
    const st = Store.state;
    const near = (a, b, before, after) => { const d = U.daysBetween(b, a); return d >= -before && d <= after; };
    const nameHit = (payee, ...names) => { const p = U.normPayee(payee); return p.length >= 3 && names.some((n) => { const q = U.normPayee(n); return q.length >= 3 && (p.includes(q) || q.includes(p)); }); };
    const linked = [];
    txns.forEach((t) => {
      if (t.linkId || t.type !== 'expense') return;
      const s = st.subscriptions.find((x) => x.status === 'active' && nameHit(t.payee, x.name) && Math.abs(t.amount - x.amount) <= Math.max(x.amount * (x.variable ? 0.6 : 0.2), 2) && near(t.date, x.nextDate, 10, 12));
      if (s) { t.linkId = s.id; s.nextDate = advance(s.nextDate, s.cycle); linked.push(s.name); return; }
      const l = st.emis.find((x) => { const ls = loanState(x); return !ls.closed && nameHit(t.payee, x.name, x.lender || '') && Math.abs(t.amount - x.emi) <= Math.max(x.emi * 0.05, 2) && near(t.date, ls.nextDue, 12, 20); });
      if (l) { t.linkId = l.id; t.category = 'EMI & Loans'; linked.push(l.name); setTimeout(() => syncLoanAsset(l), 0); }
    });
    if (linked.length && typeof document !== 'undefined') setTimeout(() => U.toast(`Linked to ${linked.join(', ')} — due date moved forward`, 'success'), 50);
  }

  // ---------- reminders (browser notifications) ----------
  function remind() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const key = 'spendwise.reminded.' + U.todayISO();
    if (localStorage.getItem(key)) return;
    const due = upcoming(10).filter((x) => x.first && daysUntil(x.date) <= (x.ref.reminderDays ?? 3));
    if (!due.length) return;
    const lines = due.slice(0, 4).map((x) => `${x.name} ${U.money(x.amount)} · ${dueLabel(x.date)}`);
    try { new Notification(`${due.length} payment${due.length > 1 ? 's' : ''} coming up`, { body: lines.join('\n'), tag: 'spendwise-due' }); } catch {}
    localStorage.setItem(key, '1');
  }

  return { CYCLES, LOAN_KINDS, USAGE, addMonths, advance, daysUntil, dueLabel, monthly, activeSubs, subsMonthly, emiAmount, balanceAfter, schedule, loanState, activeLoans, emisMonthly, prepayment, debtProjection, upcoming, dueThisMonth, logPayment, skip, syncLoanAsset, autoLink, remind };
})();
