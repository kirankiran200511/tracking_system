// Realistic demo data: ~6 months of personal + work money movement.
const Sample = (() => {
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function build() {
    const r = rng(42);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const between = (lo, hi, step = 10) => Math.round((lo + r() * (hi - lo)) / step) * step;
    const today = new Date();
    const start = U.addDays(today, -220);
    const txns = [];
    const add = (date, t) => txns.push({ date: U.iso(date), method: 'UPI', workspace: 'personal', source: 'sample', ...t });

    // loans: car loan running for a while, a phone on no-cost EMI
    const carStart = U.iso(new Date(today.getFullYear(), today.getMonth() - 20, 18));
    const carEmi = Math.round(Bills.emiAmount(650000, 9.25, 60));
    const phoneStart = U.iso(new Date(today.getFullYear(), today.getMonth() - 4, 10));
    const dueBefore = (startIso, before) => { let k = 0; while (Bills.addMonths(startIso, k) < before) k++; return k; };
    const emis = [
      { id: 'e-car', name: 'HDFC Car Loan', kind: 'car', lender: 'HDFC Bank', principal: 650000, rate: 9.25, tenure: 60, startDate: carStart, emi: carEmi, paidBefore: dueBefore(carStart, U.iso(start)), method: 'Auto-debit', workspace: 'personal', reminderDays: 3, trackInWealth: true, assetId: 'a8', status: 'active' },
      { id: 'e-phone', name: 'iPhone 16 (no-cost EMI)', kind: 'consumer', lender: 'Bajaj Finserv', principal: 72000, rate: 0, tenure: 12, startDate: phoneStart, emi: 6000, paidBefore: 0, method: 'Auto-debit', workspace: 'personal', reminderDays: 3, trackInWealth: false, status: 'active' },
    ];

    for (let d = new Date(start); d <= today; d = U.addDays(d, 1)) {
      const dom = d.getDate(), dow = d.getDay(), weekend = dow === 0 || dow === 6;
      // monthly fixed items
      if (dom === 1) add(d, { type: 'income', category: 'Salary', payee: 'Acme Technologies', amount: 125000, method: 'Net banking' });
      if (dom === 3) add(d, { type: 'expense', category: 'Health', payee: 'Cult.fit', amount: 1499, method: 'Card', linkId: 's-cult' });
      if (dom === 9) add(d, { type: 'expense', category: 'Subscriptions', payee: 'Google One', amount: 130, method: 'Card', linkId: 's-gone' });
      if (dom === 25) add(d, { type: 'expense', category: 'Subscriptions', payee: 'Disney+ Hotstar', amount: 299, method: 'Card', linkId: 's-hotstar' });
      if (dom === 10 && U.iso(d) >= phoneStart) add(d, { type: 'expense', category: 'EMI & Loans', payee: 'iPhone 16 (no-cost EMI)', amount: 6000, method: 'Auto-debit', linkId: 'e-phone' });
      if (dom === 5) add(d, { type: 'expense', category: 'Rent & Housing', payee: 'Landlord - Mr. Rao', amount: 18000, method: 'Net banking' });
      if (dom === 7) add(d, { type: 'investment', category: 'Mutual Funds', payee: 'Groww SIP', amount: 10000, method: 'Auto-debit' });
      if (dom === 8) add(d, { type: 'expense', category: 'Bills & Utilities', payee: 'BESCOM', amount: between(1100, 2400) });
      if (dom === 10) add(d, { type: 'saving', category: 'Savings', payee: 'Emergency fund', amount: 5000, method: 'Net banking', goalId: 'g-ef' });
      if (dom === 12) add(d, { type: 'expense', category: 'Subscriptions', payee: 'Netflix', amount: 649, method: 'Card', linkId: 's-netflix' });
      if (dom === 15) add(d, { type: 'expense', category: 'Bills & Utilities', payee: 'Airtel Broadband', amount: 999, method: 'Auto-debit', linkId: 's-airtel' });
      if (dom === 18) add(d, { type: 'expense', category: 'EMI & Loans', payee: 'HDFC Car Loan', amount: carEmi, method: 'Auto-debit', linkId: 'e-car' });
      if (dom === 20) add(d, { type: 'expense', category: 'Subscriptions', payee: 'Spotify', amount: 119, method: 'Card', linkId: 's-spotify' });
      if (dom === 22) add(d, { type: 'saving', category: 'Savings', payee: 'Goa trip', amount: 3000, method: 'Net banking', goalId: 'g-goa' });
      if (dom === 2) add(d, { type: 'expense', category: 'Software & Tools', payee: 'GitHub', amount: 400, method: 'Card', workspace: 'work', linkId: 's-github' });
      if (dom === 4) add(d, { type: 'expense', category: 'Software & Tools', payee: 'Figma', amount: 1250, method: 'Card', workspace: 'work', linkId: 's-figma' });
      if (dom === 6) add(d, { type: 'expense', category: 'Software & Tools', payee: 'AWS', amount: between(2600, 4400), method: 'Card', workspace: 'work', linkId: 's-aws' });
      if (dom === 25 && r() < 0.6) add(d, { type: 'income', category: 'Freelance', payee: pick(['Pixel Studio', 'Nova Labs', 'Brightpath']), amount: between(12000, 35000, 500), method: 'Net banking', workspace: 'work' });
      if (dom === 28 && r() < 0.5) add(d, { type: 'investment', category: 'Stocks', payee: 'Zerodha', amount: between(3000, 15000, 500), method: 'Net banking' });
      if (dom === 1 && [0, 3, 6, 9].includes(d.getMonth())) add(d, { type: 'income', category: 'Interest & Dividends', payee: 'HDFC Bank', amount: between(800, 2500) , method: 'Net banking' });
      if (dom === 14 && d.getMonth() % 3 === 0) add(d, { type: 'investment', category: 'PPF / EPF / NPS', payee: 'PPF - SBI', amount: 12500, method: 'Net banking' });

      // variable daily life
      if (r() < (weekend ? 0.75 : 0.45)) add(d, { type: 'expense', category: 'Food & Dining', payee: pick(['Swiggy', 'Zomato', 'Starbucks', 'Chai Point', 'Truffles', 'Meghana Foods']), amount: between(weekend ? 300 : 150, weekend ? 1400 : 650) });
      if (r() < 0.32) add(d, { type: 'expense', category: 'Groceries', payee: pick(['DMart', 'BigBasket', 'Blinkit', 'Zepto', 'Local Kirana']), amount: between(250, 2600) });
      if (!weekend && r() < 0.5) add(d, { type: 'expense', category: 'Transport', payee: pick(['Uber', 'Ola', 'Rapido', 'Namma Metro']), amount: between(60, 420) });
      if (r() < 0.07) add(d, { type: 'expense', category: 'Fuel', payee: pick(['Indian Oil', 'HP Petrol']), amount: between(1500, 3000, 100), method: 'Card' });
      if (r() < 0.08) add(d, { type: 'expense', category: 'Shopping', payee: pick(['Amazon', 'Myntra', 'Flipkart', 'Decathlon', 'IKEA']), amount: between(400, 5500), method: pick(['Card', 'UPI']) });
      if (weekend && r() < 0.25) add(d, { type: 'expense', category: 'Entertainment', payee: pick(['PVR Cinemas', 'BookMyShow', 'Smaaash']), amount: between(400, 1800), method: 'Card' });
      if (r() < 0.04) add(d, { type: 'expense', category: 'Health', payee: pick(['Apollo Pharmacy', '1mg', 'Dr. Mehta Clinic']), amount: between(200, 1800) });
      if (r() < 0.03) add(d, { type: 'expense', category: 'Personal Care', payee: pick(['Toni & Guy', 'Naturals Salon']), amount: between(400, 1500) });
      if (r() < 0.02) add(d, { type: 'expense', category: 'Gifts & Donations', payee: pick(['Archies', 'Give India', 'Amazon']), amount: between(500, 3000) });
      if (r() < 0.015) add(d, { type: 'expense', category: 'Education', payee: pick(['Udemy', 'Coursera', 'Sapna Book House']), amount: between(450, 3500), method: 'Card' });
      if (r() < 0.05) add(d, { type: 'expense', category: 'Cash', payee: 'ATM withdrawal', amount: 2000, method: 'Cash', _skip: true });

      // work
      if (!weekend && r() < 0.09) add(d, { type: 'expense', category: 'Client Meals', payee: pick(['Olive Bistro', 'Taj MG Road', 'Toit', 'The Permit Room']), amount: between(1400, 4800), method: 'Card', workspace: 'work', reimbursable: true });
      if (!weekend && r() < 0.12) add(d, { type: 'expense', category: 'Transport', payee: pick(['Uber', 'Ola']), amount: between(180, 650), workspace: 'work', reimbursable: true, note: 'Client visit' });
      if (r() < 0.02) add(d, { type: 'expense', category: 'Travel', payee: pick(['IndiGo', 'Air India', 'Taj Hotels', 'MakeMyTrip']), amount: between(4500, 14000, 100), method: 'Card', workspace: 'work', reimbursable: true });
      if (r() < 0.02) add(d, { type: 'expense', category: 'Office & Supplies', payee: pick(['Amazon', 'Staples', 'WeWork']), amount: between(300, 2500), method: 'Card', workspace: 'work' });
    }
    // one personal trip
    const trip = U.addDays(today, -70);
    add(trip, { type: 'expense', category: 'Travel', payee: 'IndiGo', amount: 8900, method: 'Card', tags: ['trip-kerala'] });
    add(U.addDays(trip, 1), { type: 'expense', category: 'Travel', payee: 'Airbnb', amount: 14500, method: 'Card', tags: ['trip-kerala'] });
    add(U.addDays(trip, 2), { type: 'expense', category: 'Food & Dining', payee: 'Kashi Art Cafe', amount: 1650, tags: ['trip-kerala'] });

    const clean = txns.filter((t) => !t._skip);
    // claims older than ~30 days were reimbursed in the following month's payroll
    const claims = clean.filter((t) => t.reimbursable && U.daysBetween(t.date, U.todayISO()) > 32);
    claims.forEach((t) => (t.reimbursed = true));
    const byMonth = U.groupBy(claims, (t) => t.date.slice(0, 7));
    Object.entries(byMonth).forEach(([m, list]) => {
      const [y, mo] = m.split('-').map(Number);
      const d = new Date(y, mo, 3);
      if (d <= today) clean.push({ date: U.iso(d), type: 'income', category: 'Reimbursement', payee: 'Acme Technologies', amount: U.sum(list, (t) => t.amount), method: 'Net banking', workspace: 'work', source: 'sample' });
    });

    // accounts with 6 monthly snapshots
    const snapDates = Array.from({ length: 7 }, (_, i) => U.iso(new Date(today.getFullYear(), today.getMonth() - 6 + i, i === 6 ? today.getDate() : 28)));
    const grow = (start, rate, jitter = 0.02) => snapDates.map((date, i) => ({ date, value: Math.round(start * (1 + rate) ** i * (1 + (r() - 0.5) * jitter)) }));
    const assets = [
      { id: 'a1', name: 'HDFC Savings', kind: 'bank', history: grow(185000, 0.035, 0.08) },
      { id: 'a2', name: 'Nifty 50 Index Fund', kind: 'mutual_fund', invested: 240000, history: grow(215000, 0.03, 0.04) },
      { id: 'a3', name: 'Parag Parikh Flexi Cap', kind: 'mutual_fund', invested: 150000, history: grow(142000, 0.028, 0.05) },
      { id: 'a4', name: 'Zerodha — Stocks', kind: 'stocks', invested: 120000, history: grow(118000, 0.02, 0.1) },
      { id: 'a5', name: 'SBI Fixed Deposit', kind: 'fd', invested: 200000, history: grow(203000, 0.006, 0) },
      { id: 'a6', name: 'EPF', kind: 'retirement', history: grow(410000, 0.012, 0) },
      { id: 'a7', name: 'Sovereign Gold Bond', kind: 'gold', invested: 60000, history: grow(64000, 0.015, 0.03) },
      { id: 'a8', name: 'HDFC Car Loan', kind: 'loan', history: grow(420000, -0.025, 0) },
      { id: 'a9', name: 'ICICI Credit Card', kind: 'credit_card', history: grow(28000, 0.01, 0.4) },
    ];
    const goals = [
      { id: 'g-ef', name: 'Emergency fund', emoji: '🛟', target: 300000, startAmount: 150000, deadline: U.iso(new Date(today.getFullYear() + 1, 5, 30)) },
      { id: 'g-goa', name: 'Goa trip', emoji: '🏖️', target: 40000, startAmount: 8000, deadline: U.iso(new Date(today.getFullYear(), today.getMonth() + 4, 15)) },
      { id: 'g-laptop', name: 'New laptop', emoji: '💻', target: 120000, startAmount: 35000, deadline: '' },
    ];
    const budgets = [
      { id: 'b1', category: 'Food & Dining', amount: 12000, workspace: 'personal' },
      { id: 'b2', category: 'Groceries', amount: 14000, workspace: 'personal' },
      { id: 'b3', category: 'Shopping', amount: 8000, workspace: 'personal' },
      { id: 'b4', category: 'Transport', amount: 3500, workspace: 'personal' },
      { id: 'b5', category: 'Entertainment', amount: 3000, workspace: 'personal' },
      { id: 'b6', category: 'Software & Tools', amount: 7000, workspace: 'work' },
      { id: 'b7', category: '__all', amount: 85000, workspace: 'personal' },
    ];
    // subscriptions: next renewal = next occurrence of their billing day after today
    const nextOn = (dom) => { const t = new Date(today.getFullYear(), today.getMonth(), dom); if (dom <= today.getDate()) t.setMonth(t.getMonth() + 1); return U.iso(t); };
    const sub = (id, name, amount, dom, extra = {}) => ({ id, name, amount, cycle: 'monthly', nextDate: nextOn(dom), category: 'Subscriptions', method: 'Card', workspace: 'personal', reminderDays: 3, status: 'active', usage: 'often', ...extra });
    const subscriptions = [
      sub('s-netflix', 'Netflix', 649, 12, { url: 'https://www.netflix.com/cancelplan' }),
      sub('s-spotify', 'Spotify', 119, 20),
      sub('s-hotstar', 'Disney+ Hotstar', 299, 25, { usage: 'rarely' }),
      sub('s-gone', 'Google One', 130, 9, { usage: 'sometimes' }),
      sub('s-airtel', 'Airtel Broadband', 999, 15, { category: 'Bills & Utilities', method: 'Auto-debit' }),
      sub('s-cult', 'Cult.fit', 1499, 3, { category: 'Health', usage: 'sometimes' }),
      sub('s-github', 'GitHub', 400, 2, { category: 'Software & Tools', workspace: 'work' }),
      sub('s-figma', 'Figma', 1250, 4, { category: 'Software & Tools', workspace: 'work' }),
      sub('s-aws', 'AWS', 3500, 6, { category: 'Software & Tools', workspace: 'work', variable: true }),
      { ...sub('s-prime', 'Amazon Prime', 1499, 1), cycle: 'yearly', nextDate: U.iso(U.addDays(today, 38)), usage: 'sometimes' },
      { ...sub('s-zee5', 'Zee5', 99, 5), status: 'cancelled', cancelledAt: U.iso(U.addDays(today, -95)), usage: 'rarely' },
    ];
    // a term + health policy so the health page has something to score
    const insurance = { term: 10000000, health: 500000 };
    assets.find((a) => a.id === 'a9').limit = 150000;

    return { txns: clean, assets, goals, budgets, subscriptions, emis, insurance };
  }

  return { build };
})();
