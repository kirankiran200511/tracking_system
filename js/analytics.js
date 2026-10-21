// Pure functions over transactions: filtering, aggregation, insight generation.
const A = (() => {
  const RANGES = [
    ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['mtd', 'This month'], ['lm', 'Last month'],
    ['90d', 'Last 90 days'], ['ytd', 'This year'], ['12m', 'Last 12 months'], ['all', 'All time'], ['custom', 'Custom…'],
  ];

  // Resolve the global range selector into concrete ISO dates.
  function resolveRange(ui, txns = Store.state.txns) {
    const today = new Date();
    const t = U.iso(today);
    switch (ui.range) {
      case '7d': return { from: U.iso(U.addDays(today, -6)), to: t };
      case '30d': return { from: U.iso(U.addDays(today, -29)), to: t };
      case '90d': return { from: U.iso(U.addDays(today, -89)), to: t };
      case 'mtd': return { from: U.iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: t };
      case 'lm': return { from: U.iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: U.iso(new Date(today.getFullYear(), today.getMonth(), 0)) };
      case 'ytd': return { from: `${today.getFullYear()}-01-01`, to: t };
      case '12m': return { from: U.iso(new Date(today.getFullYear(), today.getMonth() - 11, 1)), to: t };
      case 'custom': return { from: ui.from || t, to: ui.to || t };
      default: {
        const dates = txns.map((x) => x.date).sort();
        return { from: dates[0] || t, to: dates[dates.length - 1] > t ? dates[dates.length - 1] : t };
      }
    }
  }

  // Same-length window immediately before the given one.
  function previousRange({ from, to }) {
    const len = U.daysBetween(from, to) + 1;
    const pTo = U.addDays(U.parseISO(from), -1);
    return { from: U.iso(U.addDays(pTo, -(len - 1))), to: U.iso(pTo) };
  }

  function filter(txns, f = {}) {
    const q = (f.search || '').toLowerCase();
    return txns.filter((t) => {
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (f.workspace && f.workspace !== 'all' && t.workspace !== f.workspace) return false;
      if (f.types?.length && !f.types.includes(t.type)) return false;
      if (f.categories?.length && !f.categories.includes(t.category)) return false;
      if (f.payees?.length && !f.payees.includes(t.payee)) return false;
      if (f.methods?.length && !f.methods.includes(t.method)) return false;
      if (f.min != null && f.min !== '' && t.amount < Number(f.min)) return false;
      if (f.max != null && f.max !== '' && t.amount > Number(f.max)) return false;
      if (f.reimb === 'pending' && !(t.reimbursable && !t.reimbursed)) return false;
      if (f.reimb === 'any' && !t.reimbursable) return false;
      if (f.hasDoc && !t.docIds.length) return false;
      if (f.tag && !t.tags.includes(f.tag)) return false;
      if (f.tags?.length && !f.tags.some((tag) => t.tags.includes(tag))) return false;
      if (q && !`${t.payee} ${t.category} ${t.note} ${t.tags.join(' ')} ${t.method} ${t.amount}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function totals(txns) {
    const by = (type) => U.sum(txns.filter((t) => t.type === type), (t) => t.amount);
    const income = by('income'), expense = by('expense'), invested = by('investment'), saved = by('saving');
    return { income, expense, invested, saved, net: income - expense, savingsRate: income ? (income - expense) / income : NaN, count: txns.length };
  }

  // Daily series with zero-filled gaps.
  function byDay(txns, from, to, type = 'expense') {
    const map = {};
    txns.forEach((t) => { if (t.type === type) map[t.date] = (map[t.date] || 0) + t.amount; });
    const out = [];
    for (let d = U.parseISO(from); U.iso(d) <= to; d = U.addDays(d, 1)) out.push({ date: U.iso(d), value: map[U.iso(d)] || 0 });
    return out;
  }

  function byDayWorkspace(txns, from, to) {
    const p = byDay(txns.filter((t) => t.workspace === 'personal'), from, to);
    const w = byDay(txns.filter((t) => t.workspace === 'work'), from, to);
    return p.map((d, i) => ({ date: d.date, personal: d.value, work: w[i].value }));
  }

  function byKey(txns, keyFn) {
    const m = {};
    txns.forEach((t) => {
      const k = keyFn(t) || '—';
      const e = (m[k] ||= { key: k, value: 0, count: 0, last: t.date, first: t.date });
      e.value += t.amount; e.count++;
      if (t.date > e.last) e.last = t.date;
      if (t.date < e.first) e.first = t.date;
    });
    return Object.values(m).map((e) => ({ ...e, avg: e.value / e.count })).sort((a, b) => b.value - a.value);
  }
  const byCategory = (txns) => byKey(txns, (t) => t.category);
  const byPayee = (txns) => byKey(txns, (t) => t.payee || '(unknown)');
  const byMethod = (txns) => byKey(txns, (t) => t.method);

  function byMonth(txns) {
    const m = {};
    txns.forEach((t) => {
      const k = U.monthKey(t.date);
      const e = (m[k] ||= { key: k, income: 0, expense: 0, investment: 0, saving: 0, personal: 0, work: 0 });
      e[t.type] += t.amount;
      if (t.type === 'expense') e[t.workspace] += t.amount;
    });
    return Object.values(m).sort((a, b) => (a.key < b.key ? -1 : 1));
  }

  function monthsBetween(from, to) {
    const out = [];
    let [y, mo] = from.slice(0, 7).split('-').map(Number);
    const end = to.slice(0, 7);
    while (`${y}-${U.pad(mo)}` <= end) { out.push(`${y}-${U.pad(mo)}`); mo++; if (mo > 12) { mo = 1; y++; } }
    return out;
  }

  function byWeekday(txns, from, to) {
    const days = byDay(txns, from, to);
    const acc = Array.from({ length: 7 }, (_, i) => ({ key: U.DAYS[i], total: 0, n: 0 }));
    days.forEach((d) => { const w = U.parseISO(d.date).getDay(); acc[w].total += d.value; acc[w].n++; });
    // Monday-first
    return [1, 2, 3, 4, 5, 6, 0].map((i) => ({ key: acc[i].key, value: acc[i].n ? acc[i].total / acc[i].n : 0 }));
  }

  // Repeating payees with a steady cadence and amount → subscriptions / bills.
  function recurring(txns) {
    const groups = U.groupBy(txns.filter((t) => t.type === 'expense' && t.payee), (t) => U.normPayee(t.payee));
    const out = [];
    Object.values(groups).forEach((list) => {
      if (list.length < 3) return;
      const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
      const gaps = sorted.slice(1).map((t, i) => U.daysBetween(sorted[i].date, t.date)).filter((g) => g > 0);
      if (gaps.length < 2) return;
      const gap = U.median(gaps);
      const cadence = gap >= 26 && gap <= 35 ? 'Monthly' : gap >= 6 && gap <= 8 ? 'Weekly' : gap >= 13 && gap <= 16 ? 'Fortnightly' : gap >= 85 && gap <= 95 ? 'Quarterly' : gap >= 355 && gap <= 375 ? 'Yearly' : null;
      if (!cadence) return;
      // most gaps must sit close to the typical gap — filters out payees you just visit often
      const steady = gaps.filter((g) => Math.abs(g - gap) <= Math.max(3, gap * 0.2)).length / gaps.length;
      if (steady < 0.75) return;
      const amts = sorted.map((t) => t.amount);
      const mean = U.sum(amts) / amts.length;
      const sd = Math.sqrt(U.sum(amts, (a) => (a - mean) ** 2) / amts.length);
      // amounts must be similar — looser for very punctual payees (metered bills like power, cloud)
      if (mean && sd / mean > (steady >= 0.9 ? 0.4 : 0.25)) return;
      const last = sorted[sorted.length - 1];
      const perMonth = cadence === 'Monthly' ? mean : cadence === 'Weekly' ? mean * 4.33 : cadence === 'Fortnightly' ? mean * 2.17 : cadence === 'Quarterly' ? mean / 3 : mean / 12;
      out.push({ payee: last.payee, category: last.category, workspace: last.workspace, cadence, amount: last.amount, avg: mean, perMonth, count: sorted.length, last: last.date, next: U.iso(U.addDays(U.parseISO(last.date), Math.round(gap))), stale: U.daysBetween(last.date, U.todayISO()) > gap * 1.8 });
    });
    return out.sort((a, b) => b.perMonth - a.perMonth);
  }

  // Human-readable observations for the dashboard.
  function insights(cur, prev, range) {
    const out = [];
    const tc = totals(cur), tp = totals(prev);
    const days = U.daysBetween(range.from, range.to) + 1;
    if (tp.expense > 0 && tc.expense > 0) {
      const d = (tc.expense - tp.expense) / tp.expense;
      if (Math.abs(d) >= 0.05) out.push({ tone: d > 0 ? 'bad' : 'good', text: `Spending is ${d > 0 ? 'up' : 'down'} <b>${U.pct(Math.abs(d))}</b> compared with the previous ${days} days.` });
    }
    const cc = byCategory(cur.filter((t) => t.type === 'expense'));
    const pc = Object.fromEntries(byCategory(prev.filter((t) => t.type === 'expense')).map((c) => [c.key, c.value]));
    const jump = cc.map((c) => ({ ...c, delta: c.value - (pc[c.key] || 0) })).filter((c) => c.delta > 0 && pc[c.key]).sort((a, b) => b.delta - a.delta)[0];
    if (jump && jump.delta > tc.expense * 0.03) out.push({ tone: 'bad', text: `<b>${U.esc(jump.key)}</b> grew by ${U.money(jump.delta)} (${U.pct(jump.delta / pc[jump.key])}) — the biggest increase of any category.` });
    if (cc[0] && tc.expense) out.push({ tone: 'neutral', text: `<b>${U.esc(cc[0].key)}</b> is your largest category at ${U.pct(cc[0].value / tc.expense)} of spending.` });
    const exp = cur.filter((t) => t.type === 'expense');
    const big = exp.reduce((m, t) => (!m || t.amount > m.amount ? t : m), null);
    if (big) out.push({ tone: 'neutral', text: `Largest single spend: <b>${U.money(big.amount)}</b> at ${U.esc(big.payee || big.category)} on ${U.fmtDate(big.date, { short: true })}.` });
    const wk = byWeekday(cur, range.from, range.to);
    const weekend = (wk[5].value + wk[6].value) / 2, weekday = U.sum(wk.slice(0, 5), (d) => d.value) / 5;
    if (weekday > 0 && weekend > weekday * 1.3) out.push({ tone: 'neutral', text: `You spend <b>${U.pct(weekend / weekday - 1)} more</b> per day on weekends than on weekdays.` });
    const pending = U.sum(cur.filter((t) => t.reimbursable && !t.reimbursed), (t) => t.amount);
    if (pending > 0) out.push({ tone: 'warn', text: `<b>${U.money(pending)}</b> in work expenses is still waiting to be reimbursed.` });
    if (tc.income > 0 && isFinite(tc.savingsRate)) out.push({ tone: tc.savingsRate >= 0.2 ? 'good' : tc.savingsRate >= 0 ? 'neutral' : 'bad', text: `Savings rate is <b>${U.pct(tc.savingsRate)}</b>${tc.savingsRate >= 0.2 ? ' — above the 20% rule of thumb.' : tc.savingsRate >= 0 ? '; 20% or more is a common target.' : ' — you spent more than you earned.'}` });
    return out;
  }

  // Current-month budget status.
  function budgetStatus(month = U.todayISO().slice(0, 7)) {
    const st = Store.state;
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const isCurrent = month === U.todayISO().slice(0, 7);
    const elapsed = isCurrent ? new Date().getDate() : daysInMonth;
    return st.budgets.map((b) => {
      const spent = U.sum(st.txns.filter((t) => t.type === 'expense' && U.monthKey(t.date) === month && (b.category === '__all' || t.category === b.category) && (b.workspace === 'all' || t.workspace === b.workspace)), (t) => t.amount);
      const projected = isCurrent ? (spent / Math.max(elapsed, 1)) * daysInMonth : spent;
      const ratio = b.amount ? spent / b.amount : 0;
      const status = ratio >= 1 ? 'critical' : projected > b.amount ? 'serious' : ratio >= 0.8 ? 'warning' : 'good';
      return { ...b, spent, projected, ratio, status, left: b.amount - spent, perDayLeft: isCurrent ? Math.max(b.amount - spent, 0) / Math.max(daysInMonth - elapsed + 1, 1) : 0 };
    });
  }

  // Net worth: latest value of each asset at each snapshot date.
  function netWorthSeries() {
    const assets = Store.state.assets;
    const dates = [...new Set(assets.flatMap((a) => a.history.map((h) => h.date)))].sort();
    return dates.map((d) => {
      let assetsV = 0, liab = 0;
      assets.forEach((a) => {
        const h = a.history.filter((x) => x.date <= d).sort((x, y) => (x.date < y.date ? -1 : 1)).pop();
        if (!h) return;
        if (Store.ASSET_KINDS[a.kind]?.liability) liab += h.value; else assetsV += h.value;
      });
      return { date: d, value: assetsV - liab, assets: assetsV, liabilities: liab };
    });
  }
  const latestValue = (a) => (a.history.length ? [...a.history].sort((x, y) => (x.date < y.date ? -1 : 1)).pop().value : 0);

  return { RANGES, resolveRange, previousRange, filter, totals, byDay, byDayWorkspace, byCategory, byPayee, byMethod, byMonth, monthsBetween, byWeekday, recurring, insights, budgetStatus, netWorthSeries, latestValue };
})();
