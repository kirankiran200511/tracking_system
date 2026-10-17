// Financial health: the ratios planners and FIRE folks track, scored against common guidelines.
const Health = (() => {
  const LEVEL = {
    good: { icon: '✓', label: 'Healthy' }, warning: { icon: '!', label: 'Watch' },
    serious: { icon: '▲', label: 'Needs work' }, critical: { icon: '✕', label: 'At risk' }, na: { icon: '–', label: 'Add data' },
  };
  const NOT_INCOME = ['Reimbursement', 'Refund']; // money coming back, not earnings

  // Whole calendar months, so every month has exactly one payday. A month counts if tracking
  // started by its 5th; with no complete month yet, fall back to this month so far.
  function completeMonths(count, skip = 0) {
    const st = Store.state;
    const first = st.txns.reduce((m, t) => (t.date < m ? t.date : m), U.todayISO());
    const now = new Date();
    const out = [];
    for (let i = 1 + skip; i <= count + skip; i++) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
      if (U.iso(new Date(s.getFullYear(), s.getMonth(), 5)) < first) break;
      out.push({ from: U.iso(s), to: U.iso(new Date(s.getFullYear(), s.getMonth() + 1, 0)) });
    }
    return out;
  }
  function window3() {
    const ms = completeMonths(3);
    if (ms.length) return { from: ms[ms.length - 1].from, to: ms[0].to, months: ms.length };
    const from = U.iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    return { from, to: U.todayISO(), months: Math.max((U.daysBetween(from, U.todayISO()) + 1) / 30.44, 0.25), partial: true };
  }

  function base() {
    const st = Store.state;
    const today = U.todayISO();
    const w = window3();
    const months = w.months;
    const txns = A.filter(st.txns, { from: w.from, to: w.to });
    const personalIncome = txns.filter((t) => t.type === 'income' && !NOT_INCOME.includes(t.category));
    const spend = txns.filter((t) => t.type === 'expense' && !t.reimbursable); // claimable work costs are the company's money
    const income = U.sum(personalIncome, (t) => t.amount) / months;
    const expense = U.sum(spend, (t) => t.amount) / months;
    const invested = U.sum(txns.filter((t) => t.type === 'investment'), (t) => t.amount) / months;
    const saved = U.sum(txns.filter((t) => t.type === 'saving'), (t) => t.amount) / months;
    const needs = U.sum(spend.filter((t) => Store.cat(t.category)?.need), (t) => t.amount) / months;
    const rent = U.sum(spend.filter((t) => t.category === 'Rent & Housing'), (t) => t.amount) / months;
    const value = (a) => A.latestValue(a);
    const K = Store.ASSET_KINDS, G = Store.ASSET_GROUPS;
    const assets = st.assets.filter((a) => !K[a.kind]?.liability);
    const liabilities = st.assets.filter((a) => K[a.kind]?.liability);
    const liquid = U.sum(assets.filter((a) => G.liquid.includes(a.kind)), value);
    const investable = U.sum(assets.filter((a) => G.investable.includes(a.kind)), value);
    const totalAssets = U.sum(assets, value);
    // loans tracked only as EMIs (not mirrored in Wealth) still count as debt
    const mirrored = new Set(st.emis.map((l) => l.assetId).filter(Boolean));
    const emiDebt = U.sum(Bills.activeLoans().filter((l) => !l.trackInWealth || !st.assets.some((a) => a.id === l.assetId)), (l) => Bills.loanState(l).outstanding);
    const totalDebt = U.sum(liabilities, value) + emiDebt;
    const cards = st.assets.filter((a) => a.kind === 'credit_card');
    const cardLimit = U.sum(cards, (a) => Number(a.limit) || 0);
    const cardUsed = U.sum(cards, value);
    // lifestyle creep: last 3 complete months vs the 3 before
    const recent = completeMonths(3), earlier = completeMonths(3, 3);
    const hasSixMonths = recent.length === 3 && earlier.length === 3;
    const win = (ms, type) => (ms.length ? U.sum(st.txns.filter((t) => t.date >= ms[ms.length - 1].from && t.date <= ms[0].to && t.type === type && !t.reimbursable && !NOT_INCOME.includes(t.category)), (t) => t.amount) : 0);
    const spendNow = win(recent, 'expense'), spendBefore = win(earlier, 'expense');
    const incNow = win(recent, 'income'), incBefore = win(earlier, 'income');
    const nw = A.netWorthSeries();
    return { months, window: w, income, expense, invested, saved, needs, rent, liquid, investable, totalAssets, totalDebt, cardLimit, cardUsed, cards: cards.length, spendNow, spendBefore, incNow, incBefore, hasSixMonths, nw, mirrored,
      emis: Bills.emisMonthly(), subs: Bills.subsMonthly(), rarelySubs: U.sum(Bills.activeSubs().filter((s) => s.usage === 'rarely'), Bills.monthly) };
  }

  // Score helpers: map a value onto 0–100 between a "bad" and a "good" anchor.
  const scoreUp = (v, bad, good) => Math.max(0, Math.min(100, ((v - bad) / (good - bad)) * 100));
  const levelOf = (score) => (score >= 75 ? 'good' : score >= 50 ? 'warning' : score >= 25 ? 'serious' : 'critical');

  function metrics() {
    const b = base();
    const ins = Store.state.settings.insurance || {};
    const annualIncome = b.income * 12, annualExpense = b.expense * 12;
    const fiNumber = annualExpense * 25;
    const list = [];
    const add = (m) => list.push({ ...m, level: m.score == null ? 'na' : levelOf(m.score) });

    const sr = b.income ? (b.income - b.expense) / b.income : null;
    add({ id: 'savings', title: 'Savings rate', value: sr == null ? '—' : U.pct(sr), score: sr == null ? null : scoreUp(sr, 0, 0.3), weight: 3,
      target: '≥ 20% (10% minimum)', why: 'Share of income you keep after spending. The single biggest driver of wealth and of how soon you can stop working.',
      tip: sr != null && sr < 0.2 ? `Saving ${U.money(Math.max(b.income * 0.2 - (b.income - b.expense), 0))} more a month gets you to 20%.` : 'Automate the saving on payday so it happens before spending.' });

    const ef = b.expense ? b.liquid / b.expense : null;
    add({ id: 'emergency', title: 'Emergency fund', value: ef == null ? '—' : `${ef.toFixed(1)} months`, score: ef == null ? null : scoreUp(ef, 0, 6), weight: 3,
      target: '3–6 months of expenses', why: 'Cash, savings and FDs you could use tomorrow, measured in months of your normal spending.',
      tip: ef != null && ef < 6 ? `Build it to ${U.money(b.expense * 6)} — ${U.money(Math.max(b.expense * 6 - b.liquid, 0))} to go. Keep it in a sweep FD or liquid fund.` : 'You are covered — park anything extra in long-term investments.' });

    const foir = b.income ? b.emis / b.income : null;
    add({ id: 'foir', title: 'EMI-to-income (FOIR)', value: foir == null ? '—' : U.pct(foir), score: foir == null ? null : b.emis === 0 ? 100 : scoreUp(-foir, -0.55, -0.2), weight: 3,
      target: '< 40% (banks cap around 50%)', why: 'All monthly EMIs divided by monthly income. Indian lenders call this FOIR and use it to decide new loans.',
      tip: foir > 0.4 ? 'Avoid new loans; prepay the highest-interest one first (see Bills & EMIs → prepayment calculator).' : b.emis ? 'Comfortable — prepaying costly loans still saves interest.' : 'No EMIs — great.' });

    const fixed = b.income ? (b.emis + b.subs + b.rent) / b.income : null;
    add({ id: 'fixed', title: 'Fixed commitments', value: fixed == null ? '—' : U.pct(fixed), score: fixed == null ? null : scoreUp(-fixed, -0.7, -0.35), weight: 2,
      target: '< 50% of income', why: 'Rent + EMIs + subscriptions — money that leaves every month before you decide anything. Lower means more flexibility.',
      tip: `Rent ${U.money(b.rent)} · EMIs ${U.money(b.emis)} · subscriptions ${U.money(b.subs)} per month.` });

    const ir = b.income ? (b.invested + b.saved) / b.income : null;
    add({ id: 'invest', title: 'Investment rate', value: ir == null ? '—' : U.pct(ir), score: ir == null ? null : scoreUp(ir, 0, 0.25), weight: 2,
      target: '≥ 15–20% of income', why: 'SIPs, stocks, PPF/NPS and goal savings as a share of income. Savings only grow if they are invested.',
      tip: ir != null && ir < 0.15 ? `A SIP of ${U.money(Math.max(b.income * 0.15 - b.invested - b.saved, 0))} more a month reaches 15%.` : 'Step up your SIP by 10% each year with your raise.' });

    const util = b.cardLimit ? b.cardUsed / b.cardLimit : null;
    add({ id: 'credit', title: 'Credit card utilisation', value: util == null ? (b.cards ? 'add limits' : 'no cards') : U.pct(util), score: util == null ? null : scoreUp(-util, -0.6, -0.1), weight: 1,
      target: '< 30% (best 1–10%)', why: 'Card balance ÷ total card limit. It drives about 30% of your CIBIL score.',
      tip: b.cards && !b.cardLimit ? 'Add each card’s credit limit in Wealth → edit card.' : 'Pay the full statement balance; pay mid-cycle before big loan applications.' });

    const dta = b.totalAssets ? b.totalDebt / b.totalAssets : null;
    add({ id: 'debt', title: 'Debt-to-assets', value: dta == null ? '—' : U.pct(dta), score: dta == null ? null : scoreUp(-dta, -0.8, -0.2), weight: 2,
      target: '< 30–40%', why: 'Everything you owe ÷ everything you own. Falls as loans are repaid and assets grow.',
      tip: `Owe ${U.money(b.totalDebt)} against ${U.money(b.totalAssets)} of assets.` });

    const fi = fiNumber ? b.investable / fiNumber : null;
    add({ id: 'fi', title: 'Financial independence', value: fi == null ? '—' : U.pct(fi, 1), score: fi == null ? null : scoreUp(fi, 0, 0.5), weight: 1,
      target: `FI number = 25 × yearly spend = ${U.moneyC(fiNumber)}`, why: 'Investable assets vs the corpus that could fund your lifestyle forever at a 4% withdrawal rate.',
      tip: yearsToFI(b, fiNumber) });

    let creep = null;
    if (b.hasSixMonths && b.spendBefore && b.incBefore) creep = b.spendNow / b.spendBefore - 1 - (b.incNow / b.incBefore - 1);
    add({ id: 'creep', title: 'Lifestyle creep', value: creep == null ? 'needs 6 months' : `${creep >= 0 ? '+' : ''}${(creep * 100).toFixed(1)} pts`, score: creep == null ? null : scoreUp(-creep, -0.15, 0), weight: 1,
      target: 'Spending grows no faster than income', why: 'Spending growth minus income growth, last 3 months vs the 3 before. Positive means spending is outrunning income.',
      tip: creep > 0 ? 'Check Analytics → Categories for what grew; cap it with a budget.' : 'Spending is under control relative to income.' });

    const subShare = b.income ? b.subs / b.income : null;
    add({ id: 'subs', title: 'Subscription load', value: subShare == null ? '—' : `${U.pct(subShare, 1)} · ${U.money(b.subs)}/mo`, score: subShare == null ? null : scoreUp(-subShare, -0.1, -0.02) - (b.rarelySubs ? 20 : 0), weight: 1,
      target: '< 5% of income, none unused', why: 'Recurring services add up quietly — most people underestimate them.',
      tip: b.rarelySubs ? `You marked ${U.money(b.rarelySubs)}/month of subscriptions as rarely used — ${U.money(b.rarelySubs * 12)}/year to reclaim.` : 'Review usage every quarter in Bills & EMIs.' });

    const termNeed = annualIncome * 10;
    const term = Number(ins.term) || 0;
    add({ id: 'term', title: 'Term life cover', value: term ? `${(term / (annualIncome || 1)).toFixed(1)}× income` : 'not added', score: term ? scoreUp(term / (annualIncome || 1), 0, 10) : ins.termNone ? 100 : null, weight: 1,
      target: '10–15× annual income (+ loans)', why: 'Replaces your income for dependents. Pure term plans are the cheapest way to get it.',
      tip: term && term < termNeed ? `Cover gap ≈ ${U.moneyC(termNeed + b.totalDebt - term)} (10× income + outstanding loans).` : 'Set your cover below. Tick “no dependents” if you don’t need one.' });

    const health = Number(ins.health) || 0;
    // ₹10 lakh guideline, expressed in the display currency
    const st = Store.state.settings;
    const healthTarget = st.currency === 'USD' ? Math.round(1000000 / (st.fx?.usdInr || 95)) : 1000000;
    add({ id: 'health', title: 'Health insurance', value: health ? U.moneyC(health) : 'not added', score: health ? scoreUp(health, 0, healthTarget) : null, weight: 1,
      target: `≥ ${U.moneyC(healthTarget)} family floater (₹10 lakh guideline for Indian metros)`, why: 'One hospital stay can undo years of saving. Employer cover ends when the job does.',
      tip: health && health < healthTarget ? 'A super top-up is a cheap way to raise cover.' : 'Keep a personal policy even if your employer covers you.' });

    const scored = list.filter((m) => m.score != null);
    const total = scored.length ? U.sum(scored, (m) => m.score * m.weight) / U.sum(scored, (m) => m.weight) : null;
    return { list, score: total, base: b, fiNumber };
  }

  function yearsToFI(b, fiNumber) {
    const monthlyAdd = b.income - b.expense;
    if (!fiNumber) return 'Add income and spending to estimate.';
    if (b.investable >= fiNumber) return 'You have reached your FI number 🎉';
    if (monthlyAdd <= 0) return 'Not reachable while spending ≥ income.';
    const r = 0.06 / 12; // ~6% real return assumption
    let v = b.investable;
    for (let m = 1; m <= 12 * 60; m++) { v = v * (1 + r) + monthlyAdd; if (v >= fiNumber) return `≈ ${(m / 12).toFixed(1)} years at today’s savings (6% real return).`; }
    return 'More than 60 years at today’s savings rate.';
  }

  // Money you can still spend this month without touching savings or bills.
  function safeToSpend() {
    const b = base();
    const now = new Date();
    const monthStart = U.iso(new Date(now.getFullYear(), now.getMonth(), 1));
    const today = U.todayISO();
    const mtd = Store.state.txns.filter((t) => t.date >= monthStart && t.date <= today);
    const incomeMTD = U.sum(mtd.filter((t) => t.type === 'income' && !NOT_INCOME.includes(t.category)), (t) => t.amount);
    const income = Math.max(incomeMTD, b.income);
    const spent = U.sum(mtd.filter((t) => t.type === 'expense' && !t.reimbursable), (t) => t.amount);
    const commitments = U.sum(Bills.dueThisMonth().filter((x) => x.date >= today), (x) => x.amount);
    const saveTarget = income * 0.2;
    const alreadySaved = U.sum(mtd.filter((t) => t.type === 'investment' || t.type === 'saving'), (t) => t.amount);
    const left = income - spent - commitments - Math.max(saveTarget - alreadySaved, 0);
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    return { income, spent, commitments, save: Math.max(saveTarget - alreadySaved, 0), left, perDay: left / daysLeft, daysLeft };
  }

  const grade = (s) => (s == null ? '—' : s >= 80 ? 'Excellent' : s >= 65 ? 'Good' : s >= 45 ? 'Fair' : 'Needs attention');

  // =========================== PAGE ===========================
  function view(root) {
    const st = Store.state;
    if (!st.txns.length) { root.innerHTML = Views.emptyState(); return; }
    const m = metrics();
    const b = m.base;
    const ins = st.settings.insurance || {};
    const needsShare = b.income ? b.needs / b.income : 0, wantsShare = b.income ? (b.expense - b.needs) / b.income : 0, saveShare = b.income ? Math.max(1 - needsShare - wantsShare, 0) : 0;
    const sts = safeToSpend();
    root.innerHTML = `
      <div class="page-head"><div><h1>Financial health</h1><p class="muted">The ratios financial planners check — monthly averages over ${b.window.partial ? 'this month so far (no complete month tracked yet)' : `${U.fmtMonth(b.window.from.slice(0, 7))} – ${U.fmtMonth(b.window.to.slice(0, 7))}`}. Claimable work costs and reimbursements are excluded.</p></div></div>
      <div class="health-hero card">
        <div class="hh-score"><div class="hh-num">${m.score == null ? '—' : Math.round(m.score)}<small>/100</small></div><div class="hh-grade">${grade(m.score)}</div>
          <div class="meter lg"><span class="m-${m.score == null ? 'good' : levelOf(m.score)}" style="width:${m.score || 0}%"></span></div></div>
        <dl class="hh-facts">
          <div><dt>Monthly income</dt><dd>${U.money(b.income)}</dd></div>
          <div><dt>Monthly spending</dt><dd>${U.money(b.expense)}</dd></div>
          <div><dt>Monthly EMIs</dt><dd>${U.money(b.emis)}</dd></div>
          <div><dt>Subscriptions</dt><dd>${U.money(b.subs)}/mo</dd></div>
          <div><dt>Liquid savings</dt><dd>${U.money(b.liquid)}</dd></div>
          <div><dt>Safe to spend</dt><dd class="${sts.left < 0 ? 'neg' : ''}">${U.money(sts.left)}<small class="muted"> this month</small></dd></div>
        </dl>
      </div>
      <div class="metric-grid">${m.list.map((x) => `
        <article class="card metric lv-${x.level}">
          <header><h3>${x.title}</h3><span class="status s-${x.level === 'na' ? 'na' : x.level}">${LEVEL[x.level].icon} ${LEVEL[x.level].label}</span></header>
          <div class="metric-val">${x.value}</div>
          ${x.score != null ? `<div class="meter"><span class="m-${x.level}" style="width:${Math.max(x.score, 3)}%"></span></div>` : ''}
          <div class="metric-target">Target: ${x.target}</div>
          <p class="metric-why">${x.why}</p>
          <p class="metric-tip">💡 ${x.tip}</p>
        </article>`).join('')}</div>
      <div class="grid g-2">
        ${Views.card('50 / 30 / 20 check', b.income ? `<div id="h-503020"></div>
          <table class="data-table"><thead><tr><th>Bucket</th><th class="num">Yours</th><th class="num">Guide</th></tr></thead><tbody>
          <tr><td>Needs (rent, bills, groceries, EMIs, health…)</td><td class="num">${U.pct(needsShare)}</td><td class="num">50%</td></tr>
          <tr><td>Wants (dining, shopping, travel, fun…)</td><td class="num">${U.pct(wantsShare)}</td><td class="num">30%</td></tr>
          <tr><td>Savings & investments</td><td class="num">${U.pct(saveShare)}</td><td class="num">20%</td></tr></tbody></table>` : Charts.empty('Add income to compare.'), { sub: 'Share of monthly income' })}
        ${Views.card('Insurance cover', `
          <form class="grid-form" id="ins-f">
            <label>Term life cover (sum assured)<input name="term" type="number" min="0" step="100000" value="${ins.term || ''}" placeholder="e.g. 10000000"></label>
            <label>Health cover (incl. top-up)<input name="health" type="number" min="0" step="100000" value="${ins.health || ''}" placeholder="e.g. 1000000"></label>
            <label class="check full"><input type="checkbox" name="termNone" ${ins.termNone ? 'checked' : ''}> I have no dependents (term cover not needed)</label>
          </form>
          <p class="muted small">Recommended term cover ≈ ${U.moneyC(b.income * 12 * 10)}–${U.moneyC(b.income * 12 * 15)} plus outstanding loans (${U.moneyC(b.totalDebt)}).</p>`, { sub: 'Used by the term & health metrics' })}
      </div>
      ${Views.card('Safe to spend this month', `
        <dl class="mini-stats five">
          <div><dt>Expected income</dt><dd>${U.money(sts.income)}</dd></div>
          <div><dt>− Spent so far</dt><dd>${U.money(sts.spent)}</dd></div>
          <div><dt>− Bills & EMIs still due</dt><dd>${U.money(sts.commitments)}</dd></div>
          <div><dt>− Savings to reach 20%</dt><dd>${U.money(sts.save)}</dd></div>
          <div><dt>= Safe to spend</dt><dd class="${sts.left < 0 ? 'neg' : ''}">${U.money(sts.left)}</dd></div>
        </dl><p class="muted small">${sts.left > 0 ? `About ${U.money(sts.perDay)} a day for the remaining ${sts.daysLeft} days.` : 'You are past your safe limit for this month — pause discretionary spending.'}</p>`)}
      <p class="muted small">Guidelines are general rules of thumb (sources in README), not personal financial advice.</p>`;
    const draw = () => {
      if (b.income) Charts.share(U.$('#h-503020'), [{ name: 'Needs', value: b.needs, color: 'var(--s1)' }, { name: 'Wants', value: Math.max(b.expense - b.needs, 0), color: 'var(--s2)' }, { name: 'Saved', value: Math.max(b.income - b.expense, 0), color: 'var(--s3)' }].filter((p) => p.value > 0));
    };
    draw();
    U.$('#ins-f').addEventListener('change', (e) => {
      const f = e.currentTarget;
      st.settings.insurance = { term: Number(f.term.value) || 0, health: Number(f.health.value) || 0, termNone: f.termNone.checked };
      Store.commit();
    });
    return draw;
  }

  // compact version for the dashboard
  function mini() {
    const m = metrics();
    const pick = ['savings', 'emergency', 'foir', 'invest'].map((id) => m.list.find((x) => x.id === id));
    return `<div class="hm-top"><div class="hh-num sm">${m.score == null ? '—' : Math.round(m.score)}<small>/100</small></div><div><b>${grade(m.score)}</b><div class="muted small">overall financial health</div></div></div>
      <ul class="hm-list">${pick.map((x) => `<li><span>${x.title}</span><span class="status s-${x.level === 'na' ? 'na' : x.level}">${LEVEL[x.level].icon} ${x.value}</span></li>`).join('')}</ul>`;
  }

  return { metrics, safeToSpend, view, mini, grade, LEVEL };
})();
