// Turns free text (typed, spoken, bank SMS, receipt OCR) into transaction drafts.
const NLP = (() => {
  // Merchant / keyword → category. Checked against the whole sentence.
  const KEYWORDS = [
    ['Client Meals', /\b(client|team|business) (lunch|dinner|meeting|meal|breakfast|coffee)\b/i],
    ['Food & Dining', /\b(swiggy|zomato|restaurant|cafe|coffee|starbucks|chai|tea|lunch|dinner|breakfast|snacks?|pizza|burger|domino'?s|mcdonald'?s|kfc|biryani|food|eat(ing)?|dine|dining|bakery|juice|ice ?cream)\b/i],
    ['Groceries', /\b(grocer(y|ies)|dmart|d-mart|bigbasket|big basket|blinkit|zepto|instamart|vegetables?|veggies|fruits?|milk|kirana|supermarket|reliance fresh|more store|jiomart)\b/i],
    ['Transport', /\b(uber|ola|rapido|cab|taxi|auto|rickshaw|metro|bus|train ticket|irctc|parking|toll|fastag)\b/i],
    ['Fuel', /\b(petrol|diesel|fuel|gas station|hp pump|indian oil|bharat petroleum|cng)\b/i],
    ['Shopping', /\b(amazon|flipkart|myntra|ajio|meesho|nykaa|shopping|clothes|shoes|dress|shirt|electronics|gadget|mall)\b/i],
    ['Bills & Utilities', /\b(electricity|power bill|water bill|gas bill|lpg|cylinder|broadband|wifi|wi-fi|internet|recharge|mobile bill|postpaid|prepaid|dth|airtel|jio|vodafone|vi bill|bescom|tneb|utility|utilities|bill)\b/i],
    ['Rent & Housing', /\b(rent|landlord|maintenance|society|house ?keeping|maid|plumber|electrician|repair)\b/i],
    ['Health', /\b(doctor|hospital|clinic|pharmacy|medicine|medical|apollo|1mg|pharmeasy|netmeds|dentist|lab test|health|gym|fitness|cult\.?fit|insurance premium)\b/i],
    ['Entertainment', /\b(movie|movies|cinema|pvr|inox|bookmyshow|concert|game|gaming|party|outing|bowling)\b/i],
    ['Subscriptions', /\b(netflix|prime video|hotstar|spotify|youtube premium|apple music|subscription|icloud|google one|chatgpt|claude|notion|canva|linkedin premium)\b/i],
    ['Travel', /\b(flight|airline|indigo|air india|vistara|hotel|airbnb|oyo|makemytrip|goibibo|trip|travel|vacation|holiday|visa)\b/i],
    ['Education', /\b(course|udemy|coursera|tuition|school fees?|college fees?|books?|exam|certification|class(es)?)\b/i],
    ['Personal Care', /\b(salon|haircut|spa|parlou?r|grooming|cosmetics|skincare)\b/i],
    ['Gifts & Donations', /\b(gift|donation|donate|charity|temple|church|mosque|birthday present)\b/i],
    ['EMI & Loans', /\b(emi|loan|credit card bill|card payment|repayment)\b/i],
    ['Taxes & Fees', /\b(tax|gst|tds|fine|penalty|fee|charges)\b/i],
    ['Office & Supplies', /\b(office supplies|stationery|printer|printing|courier|co-?working|desk)\b/i],
    ['Software & Tools', /\b(aws|azure|gcp|google cloud|github|figma|slack|zoom|domain|hosting|saas|software|license|jira|atlassian)\b/i],
    // income
    ['Salary', /\b(salary|payroll|paycheck|stipend)\b/i],
    ['Freelance', /\b(freelance|client payment|invoice paid|project payment|consulting)\b/i],
    ['Interest & Dividends', /\b(interest|dividend)\b/i],
    ['Refund', /\b(refund|cashback|reversal)\b/i],
    ['Reimbursement', /\b(reimb\w*|expense claim|exp claim)\b/i],
    // investments
    ['Mutual Funds', /\b(sip|mutual funds?|mf|groww|kuvera|coin|index fund|elss)\b/i],
    ['Stocks', /\b(stocks?|shares?|zerodha|upstox|equity|nifty|sensex)\b/i],
    ['FD / RD', /\b(fd|fixed deposit|rd|recurring deposit)\b/i],
    ['Gold', /\b(gold|sgb|digital gold)\b/i],
    ['Crypto', /\b(crypto|bitcoin|btc|eth|ethereum|wazirx|coinswitch)\b/i],
    ['PPF / EPF / NPS', /\b(ppf|epf|nps|provident fund|pension)\b/i],
  ];

  const INCOME_RE = /\b(received|receive|got paid|got|earned|salary|credited|credit(ed)? to|refund|cashback|income|deposit(ed)?|reimbursed|sold|dividend|interest)\b/i;
  const INVEST_RE = /\b(invest(ed|ment)?|sip|bought (shares|stocks?|gold|units)|mutual funds?|fixed deposit|\bfd\b|ppf|nps|crypto)\b/i;
  const SAVING_RE = /\b(saved|save|moved to savings|put aside|set aside|emergency fund|goal)\b/i;
  const WORK_RE = /\b(for work|work|office|client|business|company|official|team|reimbursable|expense claim|project)\b/i;
  const PERSONAL_RE = /\b(personal|for me|for myself|family|home)\b/i;
  const METHOD_RULES = [
    ['UPI', /\b(upi|gpay|google pay|phonepe|phone pe|paytm|bhim|vpa)\b/i],
    ['Card', /\b(card|credit card|debit card|visa|mastercard|rupay|amex)\b/i],
    ['Cash', /\b(cash)\b/i],
    ['Net banking', /\b(net ?banking|neft|imps|rtgs|bank transfer)\b/i],
    ['Wallet', /\b(wallet|amazon pay)\b/i],
    ['Auto-debit', /\b(auto[- ]?debit|standing instruction|nach|mandate)\b/i],
  ];

  // --- spoken numbers: "two thousand five hundred" → 2500 ---
  const SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, a: 1 };
  const MULT = { hundred: 100, thousand: 1000, k: 1000, lakh: 100000, lakhs: 100000, lac: 100000, million: 1000000, crore: 10000000, crores: 10000000 };
  const NUM_WORD = '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a|hundred|thousand|lakhs?|lac|million|crores?|and)';
  const NUM_RUN = new RegExp(`\\b${NUM_WORD}(?:[\\s-]+${NUM_WORD})*\\b`, 'gi');
  function wordsToNumbers(text) {
    return text.replace(NUM_RUN, (m) => {
      const words = m.toLowerCase().split(/[\s-]+/).filter((w) => w && w !== 'and');
      if (!words.some((w) => w !== 'a' && (SMALL[w] !== undefined || MULT[w]))) return m;
      if (words.length === 1 && words[0] === 'a') return m;
      let total = 0, cur = 0;
      for (const w of words) {
        if (SMALL[w] !== undefined) cur += SMALL[w];
        else if (w === 'hundred') cur = (cur || 1) * 100;
        else if (MULT[w]) { total += (cur || 1) * MULT[w]; cur = 0; }
      }
      const n = total + cur;
      return n ? ` ${n} ` : m;
    });
  }

  // --- amounts ---
  // Note: "Cr"/"Dr" in bank statements mean credit/debit, so crore must be spelled out.
  const AMOUNT_RE = /(?:₹|rs\.?|inr|\$|usd|€|eur|£)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lac|crores?)?\b\s*(?:rupees|rs|bucks|dollars)?/gi;
  function findAmounts(text) {
    const out = [];
    let m;
    AMOUNT_RE.lastIndex = 0;
    while ((m = AMOUNT_RE.exec(text))) {
      const hasCurrency = /₹|rs|inr|\$|usd|€|eur|£|rupees|bucks|dollars/i.test(m[0]);
      let n = parseFloat(m[1].replace(/,/g, ''));
      const suf = (m[2] || '').toLowerCase();
      if (suf === 'k' || suf === 'thousand') n *= 1000;
      else if (/^(lac|lakhs?)$/.test(suf)) n *= 100000;
      else if (/^crores?$/.test(suf)) n *= 10000000;
      out.push({ value: n, index: m.index, end: m.index + m[0].length, hasCurrency, raw: m[0] });
    }
    return out;
  }

  // --- dates ---
  const MONTH_IDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  function parseDate(text, base = new Date()) {
    const t = text.toLowerCase();
    if (/\bday before yesterday\b/.test(t)) return U.iso(U.addDays(base, -2));
    if (/\byesterday\b/.test(t)) return U.iso(U.addDays(base, -1));
    if (/\btoday|tonight|this morning|this evening\b/.test(t)) return U.iso(base);
    let m = t.match(/\b(\d+) days? ago\b/);
    if (m) return U.iso(U.addDays(base, -Number(m[1])));
    m = t.match(/\blast (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/) || t.match(/\bon (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m) {
      const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(m[1]);
      let diff = (base.getDay() - target + 7) % 7 || 7;
      return U.iso(U.addDays(base, -diff));
    }
    m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/); // dd/mm/yyyy (Indian format)
    if (m) {
      let y = Number(m[3]); if (y < 100) y += 2000;
      let d = Number(m[1]), mo = Number(m[2]);
      if (mo > 12 && d <= 12) [d, mo] = [mo, d];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${U.pad(mo)}-${U.pad(d)}`;
    }
    m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-]*(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[\s\-,]*(\d{2,4})?\b/) ;
    if (m) return fromParts(Number(m[1]), MONTH_IDX[m[2]], m[3], base);
    m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/);
    if (m) return fromParts(Number(m[2]), MONTH_IDX[m[1]], m[3], base);
    m = t.match(/\bon (?:the )?(\d{1,2})(?:st|nd|rd|th)\b/);
    if (m) {
      const d = new Date(base.getFullYear(), base.getMonth(), Number(m[1]));
      if (d > base) d.setMonth(d.getMonth() - 1);
      return U.iso(d);
    }
    return null;
  }
  function fromParts(day, month, year, base) {
    let y = year ? Number(year) : base.getFullYear();
    if (y < 100) y += 2000;
    const d = new Date(y, month, day);
    if (!year && d > base) d.setFullYear(y - 1);
    return U.iso(d);
  }

  // --- payee ---
  const STOP = /\b(for|on|via|using|with|by|yesterday|today|tonight|this|last|through|from my|from|to|at|in|and|paid|worth|of|rs|inr|rupees|upi|card|cash|gpay|phonepe|paytm|\d)\b/i;
  function findPayee(text, type) {
    const preps = type === 'income' ? ['from'] : ['to', 'at', 'paid', 'from'];
    for (const p of preps) {
      const re = new RegExp(`\\b${p}\\s+(?:the\\s+|my\\s+|vpa\\s+)?([A-Za-z][\\w&'.@-]*(?:\\s+[A-Za-z][\\w&'.@-]*){0,3})`, 'i');
      const m = text.match(re);
      if (m) {
        const words = [];
        for (const w of m[1].split(/\s+/)) { if (STOP.test(w) && words.length) break; if (STOP.test(w)) break; words.push(w); }
        const name = words.join(' ').replace(/@.*$/, '').replace(/[.,]+$/, '');
        if (name && !/^(me|my|him|her|them|work|office)$/i.test(name)) return U.titleCase(name);
      }
    }
    // fallback: a known merchant keyword
    const merchant = text.match(/\b(swiggy|zomato|uber|ola|rapido|amazon|flipkart|myntra|netflix|spotify|dmart|bigbasket|blinkit|zepto|starbucks|airtel|jio|irctc|makemytrip|apollo|pvr|bookmyshow|aws|github|figma)\b/i);
    return merchant ? U.titleCase(merchant[1]) : '';
  }

  function detectCategory(text, type) {
    for (const [cat, re] of KEYWORDS) {
      if (!re.test(text)) continue;
      const c = Store.cat(cat);
      if (c && c.type === type) return cat;
    }
    // user-defined category name mentioned verbatim
    const byName = Store.catsOf(type).find((c) => new RegExp(`\\b${c.name.replace(/[^\w ]/g, '.?')}\\b`, 'i').test(text));
    return byName?.name || null;
  }

  function detectType(text) {
    if (/\b(debited|spent|paid|bought|purchased?|ordered)\b/i.test(text) && !/\b(bought (shares|stocks?|gold|units))\b/i.test(text)) {
      if (INVEST_RE.test(text) && /\b(invest|sip)\b/i.test(text)) return 'investment';
      return 'expense';
    }
    if (INVEST_RE.test(text)) return 'investment';
    if (SAVING_RE.test(text)) return 'saving';
    if (INCOME_RE.test(text)) return 'income';
    return 'expense';
  }

  // Parse ONE clause into a draft.
  const FILLER_NOTE = /^(?:(?:work|office|personal|business|company|reimbursable|official|me|myself|the|my)\s*)+$/i;
  function parseOne(raw, base = new Date()) {
    const text = wordsToNumbers(raw);
    const amounts = findAmounts(text).filter((a) => !isYearOrDate(text, a));
    if (!amounts.length) return null;
    const amt = amounts.find((a) => a.hasCurrency) || amounts.reduce((m, a) => (a.value > m.value ? a : m), amounts[0]);
    const type = detectType(text);
    const payee = findPayee(text, type);
    const learned = Store.suggestFor(payee);
    let category = detectCategory(text, type);
    if (!category && learned?.category && Store.cat(learned.category)?.type === type) category = learned.category;
    if (!category && type === 'saving') category = 'Savings';
    let workspace = WORK_RE.test(text) ? 'work' : PERSONAL_RE.test(text) ? 'personal' : learned?.workspace || null;
    if (category && ['Office & Supplies', 'Software & Tools', 'Client Meals'].includes(category) && !workspace) workspace = 'work';
    const method = (METHOD_RULES.find(([, re]) => re.test(text)) || [learned?.method || 'UPI'])[0];
    const noteM = text.match(/\b(?:for|note|memo)\s+(.{3,60}?)(?:\s+(?:via|using|at|to|on|yesterday|today)\b|$)/i);
    return {
      amount: Math.round(amt.value * 100) / 100,
      type, payee, category, method,
      workspace: workspace || 'personal',
      reimbursable: /\breimbursable|claim|expense report\b/i.test(text) || (workspace === 'work' && type === 'expense' && /\bclaim|reimburse\b/i.test(text)),
      date: parseDate(text, base) || U.iso(base),
      note: noteM && !Store.cat(U.titleCase(noteM[1])) && !FILLER_NOTE.test(noteM[1].trim()) ? noteM[1].trim() : '',
      raw: raw.trim(),
    };
  }

  function isYearOrDate(text, a) {
    const after = text.slice(a.end, a.end + 3);
    const before = text.slice(Math.max(0, a.index - 1), a.index);
    if (/^[\/\-.]\d/.test(after) || /[\/\-.]$/.test(before)) return true; // part of a date
    if (/^(st|nd|rd|th)\b/i.test(after)) return true;
    if (!a.hasCurrency && a.value >= 1990 && a.value <= 2100 && Number.isInteger(a.value) && /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*,?\s*$/i.test(text.slice(0, a.index))) return true;
    if (/(a\/c|acct?|account|card|xx|ending)\s*[\w*]*$/i.test(text.slice(Math.max(0, a.index - 14), a.index))) return true; // account numbers in SMS
    return false;
  }

  // Parse a sentence that may contain several spends ("200 on coffee and 1500 on groceries").
  function parse(text, base = new Date()) {
    if (!text || !text.trim()) return [];
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const clauses = line.split(/\s*(?:,|;|\band then\b|\bthen\b|\balso\b|\band\b)\s*(?=[^,;]*\d)/i).filter(Boolean);
      const drafts = clauses.map((c) => parseOne(c, base)).filter(Boolean);
      // a date mentioned once applies to the whole line
      const shared = parseDate(line, base);
      if (shared) drafts.forEach((d) => { if (!parseDate(d.raw, base)) d.date = shared; });
      out.push(...(drafts.length ? drafts : []));
    }
    return out;
  }

  // Receipts / invoices / web pages: find the grand total, a date and the merchant.
  function parseReceipt(text) {
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    let best = null;
    const totalRe = /\b(grand total|total amount|amount paid|net amount|total payable|amount due|total|paid|balance due|order total)\b/i;
    lines.forEach((l, i) => {
      if (!totalRe.test(l) || /sub ?total|savings|discount|tax\b(?! ?incl)/i.test(l)) return;
      const nums = findAmounts(l).concat(i + 1 < lines.length && !findAmounts(l).length ? findAmounts(lines[i + 1]) : []);
      nums.forEach((n) => {
        const score = (/(grand total|amount paid|total amount|order total|net amount)/i.test(l) ? 3 : 1) + (n.hasCurrency ? 1 : 0);
        if (n.value > 0 && (!best || score > best.score || (score === best.score && n.value > best.value))) best = { value: n.value, score };
      });
    });
    if (!best) {
      const all = findAmounts(text).filter((a) => a.hasCurrency && a.value > 0);
      if (all.length) best = { value: Math.max(...all.map((a) => a.value)) };
    }
    const merchant = (lines.find((l) => /[a-z]{3,}/i.test(l) && !/receipt|invoice|tax|bill no|gst|date|phone|tel|www\.|http/i.test(l)) || '').slice(0, 40);
    const cleanMerchant = U.titleCase(merchant.replace(/[^\w&' .-]/g, ' ').replace(/\s+/g, ' ').trim());
    const type = /\b(refund|credited|salary|received)\b/i.test(text) && !/\b(debited|paid)\b/i.test(text) ? 'income' : 'expense';
    const learned = Store.suggestFor(cleanMerchant);
    return {
      amount: best ? Math.round(best.value * 100) / 100 : 0,
      date: parseDate(text) || U.todayISO(),
      payee: cleanMerchant,
      type,
      category: detectCategory(text, type) || learned?.category || null,
      workspace: learned?.workspace || (WORK_RE.test(text) ? 'work' : 'personal'),
      method: (METHOD_RULES.find(([, re]) => re.test(text)) || ['Card'])[0],
      note: '',
    };
  }

  // ---------- bank statements ----------
  const DATE_ANY = /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[\s\-](?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[\s\-,]*\d{2,4}\b/gi;
  const CREDIT_WORDS = /\b(cr|credit|credited|deposit|received|refund|reversal|salary|interest|cashback|inward|by transfer)\b/i;
  const DEBIT_WORDS = /\b(dr|debit|debited|withdrawal|wdl|paid|purchase|pos|atm|emi|ach|nach|to transfer)\b/i;

  // How the money moved, from the bank narration.
  function methodFromDesc(desc) {
    const s = String(desc || '');
    if (/\bupi\b|vpa|@(ok|ybl|ibl|axl|paytm|apl|upi)/i.test(s)) return 'UPI';
    if (/\b(atm|cash wdl|cash withdrawal|nwd|cwdr)\b/i.test(s)) return 'Cash';
    if (/\b(nach|ach|ecs|si |standing instruction|mandate|autopay|auto debit)\b/i.test(s)) return 'Auto-debit';
    if (/\b(neft|imps|rtgs|ift|inb|net ?banking|fund transfer)\b/i.test(s)) return 'Net banking';
    if (/\b(pos|card|visa|mastercard|rupay|ecom|vps)\b/i.test(s)) return 'Card';
    if (/\b(wallet|paytm wallet|amazon pay)\b/i.test(s)) return 'Wallet';
    return null;
  }
  // Movements between your own accounts shouldn't count as spending or income.
  function transferHint(desc) {
    const s = String(desc || '');
    if (/\b(credit ?card (payment|bill)|cc (payment|bill)|card ?payment|autopay.*card|billdesk.*card|cred\b.*card|ccpay)/i.test(s)) return 'card-bill';
    if (/\b(self|own a\/?c|own account|to savings|from savings|sweep|fd (booking|closure|premat)|trf to fd|transfer to (my|self))\b/i.test(s)) return 'self';
    if (/\b(atm|cash wdl|cash withdrawal|nwd)\b/i.test(s)) return 'atm';
    return null;
  }

  // Use running balances to decide debit/credit exactly: if balance went up by the amount it's money in.
  function inferDirections(rows) {
    const withBal = rows.filter((r) => r.balance != null);
    if (withBal.length >= 2) {
      const descending = withBal[0].date > withBal[withBal.length - 1].date;
      rows.forEach((r, i) => {
        if (r.direction || r.balance == null) return;
        const prev = descending ? rows[i + 1] : rows[i - 1];
        const base = prev?.balance ?? (i === 0 && !descending ? rows.opening : null);
        if (base == null) return;
        const delta = Math.round((r.balance - base) * 100) / 100;
        if (Math.abs(Math.abs(delta) - r.amount) < 0.02) r.direction = delta > 0 ? 'credit' : 'debit';
      });
    }
    rows.forEach((r) => {
      if (r.direction) return;
      const c = CREDIT_WORDS.test(r.desc), d = DEBIT_WORDS.test(r.desc);
      if (c && !d) r.direction = 'credit';
      else if (d && !c) r.direction = 'debit';
    });
    return rows;
  }

  // "UPI/P2M/424511/NETFLIX COM/Payment" → "Netflix Com"; "NEFT CR-ACME TECHNOLOGIES-SALARY" → "Acme Technologies"
  const NOISE = /^(upi|neft|imps|rtgs|pos|ach|nach|ecs|si|dr|cr|d|c|payment|payments|transfer|trf|to|from|by|ref|txn|inb|ib|mb|ecom|p2a|p2m|paid|purchase|debit|credit|a\/c|ac|acct|no|the|of|for|via|bank|ltd|pvt|india|yesb|hdfc|icic|sbin|utib|kkbk|barb|punb|ybl|ibl|axl|okaxis|oksbi|okhdfcbank|okicici|paytm|apl|mandate|autopay|emi|till|sep|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug)$/i;
  function cleanPayee(desc) {
    const cleanPart = (p) => p.split(/\s+/).filter((w) => w && !NOISE.test(w) && !/\d/.test(w) && !/@/.test(w) && w.length > 1 && !/^[A-Z]{4}0/i.test(w)).join(' ');
    const parts = String(desc).split(/[\/|*]|\s-\s|-(?=[A-Za-z])|(?<=[A-Za-z])-/).map((s) => cleanPart(s.trim())).filter((s) => /[a-z]{3,}/i.test(s));
    const generic = /^(salary|interest|refund|cashback|charges|fee|gst|payment|transfer)$/i;
    const best = parts.find((s) => !generic.test(s)) || parts[0] || '';
    return U.titleCase(best.replace(/\s+/g, ' ').trim().slice(0, 36));
  }

  // Build a statement row from a narration + amount + direction.
  function statementRow({ date, amount, direction, desc, balance, payee: known }) {
    const payee = known && !/^(rs|inr|a\/?c)\b/i.test(known) ? known : cleanPayee(desc);
    const learned = Store.suggestFor(payee);
    const hint = transferHint(desc);
    const investLike = /\b(sip|mutual fund|zerodha|groww|kuvera|upstox|coin by|nps|ppf|indmoney|smallcase)\b/i.test(desc);
    const type = direction === 'credit' ? 'income' : investLike ? 'investment' : 'expense';
    const category = detectCategory(`${desc} ${payee}`, type) || (learned?.category && Store.cat(learned.category)?.type === type ? learned.category : null);
    return { date, amount: Math.round(amount * 100) / 100, direction: direction || null, desc: String(desc).trim(), payee, type, category, hint, balance,
      method: methodFromDesc(desc) || learned?.method || null, workspace: learned?.workspace || 'personal', learned: !!learned, note: '' };
  }

  // Statement text (PDF export, pasted SMS list): lines with a date and an amount.
  function parseStatementLines(text) {
    const rows = [];
    let opening = null;
    for (const raw of text.split(/\n/)) {
      const l = raw.trim();
      if (l.length < 6) continue;
      const noDates = l.replace(DATE_ANY, ' ');
      const nums = [...noDates.matchAll(/(?<![\d.])(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{2})(?![\d])/g)].map((m) => parseFloat(m[1].replace(/,/g, '')));
      if (/opening balance|balance b\/?f|brought forward/i.test(l) && nums.length) { opening = nums[nums.length - 1]; continue; }
      if (/closing balance|total|statement summary/i.test(l)) continue;
      const date = parseDate(l);
      if (!date) continue;
      let amount, balance = null, direction = null;
      if (nums.length >= 2) { amount = nums[nums.length - 2]; balance = nums[nums.length - 1]; }
      else if (nums.length === 1) amount = nums[0];
      else { const p = parseOne(l); if (!p) continue; amount = p.amount; direction = p.type === 'income' ? 'credit' : null; }
      if (!amount) continue;
      // SMS alerts say it outright, and name the other party after "to"/"from"
      let payee = null;
      if (/\b(debited|spent|paid|withdrawn)\b/i.test(l)) { direction = 'debit'; payee = findPayee(l.replace(/\bfrom (my )?a\/?c\b[^,;]*?(?= to |$)/i, ''), 'expense'); }
      else if (/\b(credited|received|deposited)\b/i.test(l)) { direction = 'credit'; payee = findPayee(l.replace(/\bto (your |my )?a\/?c\b\s*\S*/i, ''), 'income'); }
      const desc = noDates.replace(/(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{2})/g, ' ').replace(/\b(cr|dr)\.?\s*$/i, ' ').replace(/\s+/g, ' ').trim();
      rows.push({ date, amount, balance, direction, desc: desc || l, payee });
    }
    rows.opening = opening;
    return inferDirections(rows).map(statementRow);
  }

  // upi://pay?pa=merchant@bank&pn=Name&am=250&tn=note
  function parseUPI(link) {
    try {
      const u = new URL(link.replace(/^upi:\/\//i, 'https://upi/'));
      const pn = decodeURIComponent(u.searchParams.get('pn') || '').replace(/\+/g, ' ');
      const pa = u.searchParams.get('pa') || '';
      const payee = U.titleCase(pn || pa.split('@')[0]);
      const note = decodeURIComponent(u.searchParams.get('tn') || '').replace(/\+/g, ' ');
      const learned = Store.suggestFor(payee);
      return {
        amount: Number(u.searchParams.get('am')) || 0, payee, note, type: 'expense', method: 'UPI', date: U.todayISO(),
        category: detectCategory(`${payee} ${note}`, 'expense') || learned?.category || null,
        workspace: learned?.workspace || 'personal',
      };
    } catch { return null; }
  }

  return { parse, parseOne, parseReceipt, parseStatementLines, parseUPI, parseDate, findAmounts, detectCategory, wordsToNumbers, methodFromDesc, transferHint, inferDirections, cleanPayee, statementRow };
})();
