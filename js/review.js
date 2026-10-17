// Statement review wizard: after a document is uploaded, separate money out (debits) from
// money in (credits), then ask only the questions needed to file each transaction properly.
// Transactions to the same payee are grouped so one answer covers them all.
const Review = (() => {
  let S = null; // session

  const DIR = {
    debit: { icon: '↑', label: 'Money out', long: 'Debit · money out' },
    credit: { icon: '↓', label: 'Money in', long: 'Credit · money in' },
  };
  const SPECIAL = {
    transfer: { label: 'Own-account transfer / card bill', icon: '🔁', hint: 'Not counted as spending or income' },
    atm: { label: 'ATM cash withdrawal', icon: '🏧' },
  };

  // ---------- building the session ----------
  function open(drafts, ctx = {}) {
    const items = drafts.map((d, i) => {
      const direction = d.direction !== undefined ? d.direction : d.type === 'income' ? 'credit' : 'debit';
      const type = d.type || (direction === 'credit' ? 'income' : 'expense');
      const cat = d.category && Store.cat(d.category)?.type === type ? d.category : null;
      // already in SpendWise: same date and amount, same direction (when known)
      const dupe = Store.state.txns.some((t) => t.date === d.date && Math.abs(t.amount - d.amount) < 0.01 && (!direction || (t.type === 'income') === (direction === 'credit')));
      return {
        id: 'r' + i, date: d.date || U.todayISO(), amount: Number(d.amount) || 0, direction: direction || null,
        desc: d.desc || d.raw || '', payee: d.payee || '', type, category: cat, method: d.method || null, workspace: d.workspace || 'personal',
        reimbursable: !!d.reimbursable, note: d.note || '', tags: [], hint: d.hint || NLP.transferHint(d.desc || ''), learned: !!d.learned,
        docId: d._docId || null, source: d.source || ctx.source || 'upload', dupe, include: !dupe, skip: false, linkTo: '', newSub: null, balance: d.balance ?? null,
      };
    });
    items.forEach((it) => {
      if (it.hint === 'card-bill' || it.hint === 'self') it.skip = true; // suggested; user confirms
      // "sure" only when your own rules/history already say how to file this payee
      it.confident = !!(it.direction && it.category && it.amount && it.learned && !it.hint && it.payee);
    });
    // group by direction + payee + purpose (salary and a reimbursement from the same employer stay separate)
    const groups = [];
    const byKey = {};
    items.forEach((it) => {
      const p = U.normPayee(it.payee);
      const key = p.length >= 3 && it.direction ? `${it.direction}|${p}|${it.category || '?'}|${it.hint || ''}` : it.id;
      if (!byKey[key]) { byKey[key] = { key, items: [], remember: true, applyAll: true }; groups.push(byKey[key]); }
      byKey[key].items.push(it);
    });
    S = { items, groups, ctx, step: 'overview', mode: 'all', q: 0, queue: [] };
    App.modal('<div id="rv" class="rv"></div>', { wide: true });
    render();
  }

  const needsQuestion = (g) => g.items.some((it) => it.include && (!it.confident || it.hint || !it.direction));
  function buildQueue() {
    const pool = S.groups.filter((g) => g.items.some((it) => it.include) && (S.mode === 'all' || needsQuestion(g)));
    const total = (g) => U.sum(g.items, (i) => i.amount);
    const dirRank = (g) => (g.items[0].direction === 'debit' ? 0 : g.items[0].direction === 'credit' ? 1 : -1); // unknown first
    S.queue = pool.sort((a, b) => dirRank(a) - dirRank(b) || total(b) - total(a));
    S.q = 0;
  }

  // ---------- rendering ----------
  function render() {
    const host = U.$('#rv');
    if (!host) return;
    host.onkeydown = null;
    if (S.step === 'overview') host.innerHTML = overview();
    else if (S.step === 'question') host.innerHTML = question();
    else host.innerHTML = reviewTable();
    bind(host);
    const first = U.$('.rv [autofocus]', host);
    first?.focus();
  }

  const sumOf = (list) => U.sum(list, (i) => i.amount);
  const dirBadge = (d) => (d ? `<span class="dir dir-${d}">${DIR[d].icon} ${DIR[d].label}</span>` : '<span class="dir dir-unknown">? In or out</span>');

  function overview() {
    const inc = S.items.filter((i) => i.include);
    const out = inc.filter((i) => i.direction === 'debit'), inn = inc.filter((i) => i.direction === 'credit'), unk = inc.filter((i) => !i.direction);
    const dupes = S.items.filter((i) => i.dupe), transfers = inc.filter((i) => i.hint === 'card-bill' || i.hint === 'self');
    const dates = S.items.map((i) => i.date).sort();
    S.mode = S.mode || 'unsure';
    const qUnsure = S.groups.filter((g) => g.items.some((it) => it.include) && needsQuestion(g)).length;
    const qAll = S.groups.filter((g) => g.items.some((it) => it.include)).length;
    const list = (arr) => arr.slice(0, 7).map((i) => `<li><span class="muted">${U.fmtDate(i.date, { short: true })}</span><span class="ellipsis">${U.esc(i.payee || i.desc || '—')}</span><b class="num">${U.money(i.amount)}</b></li>`).join('') + (arr.length > 7 ? `<li class="muted">+ ${arr.length - 7} more</li>` : '');
    return `
      <div class="modal-head"><div><h2>Review ${S.ctx.docName ? `“${U.esc(S.ctx.docName)}”` : 'transactions'}</h2><p class="muted small">${S.items.length} found${dates.length ? ` · ${U.fmtDate(dates[0])} – ${U.fmtDate(dates[dates.length - 1])}` : ''}</p></div><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="rv-split">
        <section class="rv-side out"><header>${dirBadge('debit')}<span class="muted small">Debits</span></header><div class="rv-total">${U.money(sumOf(out))}</div><div class="muted small">${out.length} transactions</div><ul class="rv-mini">${list(out)}</ul></section>
        <section class="rv-side in"><header>${dirBadge('credit')}<span class="muted small">Credits</span></header><div class="rv-total">${U.money(sumOf(inn))}</div><div class="muted small">${inn.length} transactions</div><ul class="rv-mini">${list(inn)}</ul></section>
      </div>
      <ul class="rv-flags">
        ${unk.length ? `<li class="warn">? <b>${unk.length}</b> couldn’t be classified as in or out — you’ll be asked.</li>` : ''}
        ${transfers.length ? `<li>🔁 <b>${transfers.length}</b> look like transfers between your own accounts or card-bill payments (${U.money(sumOf(transfers))}) — suggested to leave out so nothing is counted twice.</li>` : ''}
        ${dupes.length ? `<li>⧉ <b>${dupes.length}</b> already exist in SpendWise (same date & amount) — skipped.</li>` : ''}
        <li>✓ <b>${inc.filter((i) => i.confident && !i.hint).length}</b> recognised automatically from your rules and history.</li>
      </ul>
      <fieldset class="choice-list rv-mode">
        <label class="choice"><input type="radio" name="mode" value="all" ${S.mode === 'all' ? 'checked' : ''}><b>Ask me about each transaction</b><span>${qAll} question${qAll === 1 ? '' : 's'} — repeat payments to the same payee are grouped, and my best guess is pre-selected so it’s one click when it’s right.</span></label>
        <label class="choice"><input type="radio" name="mode" value="unsure" ${S.mode === 'unsure' ? 'checked' : ''}><b>Only ask what SpendWise can’t work out</b><span>${qUnsure} question${qUnsure === 1 ? '' : 's'} — payees already known from your rules and history are filed automatically.</span></label>
      </fieldset>
      <div class="row-end"><button class="btn ghost" data-go="review">Skip questions — go to table</button><button class="btn primary" data-go="start" autofocus>${qUnsure || S.mode === 'all' ? 'Start →' : 'Continue →'}</button></div>`;
  }

  function chip(value, label, on, attrs = '') { return `<button type="button" class="qchip${on ? ' on' : ''}" data-v="${U.esc(value)}" ${attrs}>${label}</button>`; }

  function catSuggestions(g, type) {
    const it = g.items[0];
    const seen = new Set();
    const out = [];
    const push = (c) => { if (c && !seen.has(c) && Store.cat(c)?.type === type) { seen.add(c); out.push(c); } };
    push(it.category);
    push(Store.suggestFor(it.payee)?.category);
    push(NLP.detectCategory(`${it.desc} ${it.payee}`, type));
    // your most-used categories for this type
    const counts = {};
    Store.state.txns.filter((t) => t.type === type).forEach((t) => (counts[t.category] = (counts[t.category] || 0) + 1));
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([c]) => push(c));
    Store.catsOf(type).forEach((c) => push(c.name));
    return out.slice(0, type === 'expense' ? 9 : 7);
  }

  function question() {
    const g = S.queue[S.q];
    const n = S.queue.length;
    const it = g.items[0];
    const many = g.items.filter((x) => x.include).length > 1 && g.applyAll;
    const dir = it.direction;
    const cur = it; // answers live on the first item until applied
    const typeForCats = cur.skip ? null : cur.type;
    const cats = typeForCats ? catSuggestions(g, typeForCats) : [];
    const pending = Store.state.txns.filter((t) => t.reimbursable && !t.reimbursed);
    const dates = g.items.map((x) => x.date).sort();
    const recurringLike = dir === 'debit' && cur.type === 'expense' && !cur.skip && (g.items.length >= 2 || ['Subscriptions', 'Bills & Utilities', 'EMI & Loans', 'Software & Tools', 'Health', 'Education', 'Rent & Housing'].includes(cur.category));
    const subs = Store.state.subscriptions.filter((s) => s.status !== 'cancelled');
    const loans = Bills.activeLoans();
    const methods = Store.METHODS;
    let qn = 0;
    const Q = (title, body, sub = '') => `<div class="q"><div class="q-title"><span class="q-num">${++qn}</span>${title}${sub ? `<small class="muted"> ${sub}</small>` : ''}</div>${body}</div>`;

    return `
      <div class="modal-head"><div class="rv-progress"><span>Question ${S.q + 1} of ${n}</span><div class="meter"><span class="m-good" style="width:${((S.q) / n) * 100}%"></span></div></div><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="q-head">
        ${dirBadge(dir)}
        <input class="q-payee" data-f="payee" value="${U.esc(cur.payee)}" placeholder="Who was it ${dir === 'credit' ? 'from' : 'paid to'}?" aria-label="Payee">
        ${many
          ? `<div class="q-amt"><b>${U.money(sumOf(g.items.filter((x) => x.include)))}</b><small class="muted">${g.items.filter((x) => x.include).length} payments · ${U.fmtDate(dates[0], { short: true })} – ${U.fmtDate(dates[dates.length - 1], { short: true })}</small></div>`
          : `<div class="q-amt edit"><input data-f="amount" type="number" step="0.01" min="0" value="${cur.amount || ''}" placeholder="Amount" aria-label="Amount" class="${cur.amount ? '' : 'need'}"><input data-f="date" type="date" value="${cur.date}" aria-label="Date"></div>`}
      </div>
      ${cur.desc ? `<div class="q-desc" title="Bank narration">🏦 ${U.esc(cur.desc)}</div>` : ''}
      ${many ? `<details class="q-list"><summary>Show all ${g.items.length}</summary><ul>${g.items.map((x) => `<li><label class="check"><input type="checkbox" data-inc="${x.id}" ${x.include ? 'checked' : ''}> ${U.fmtDate(x.date)}</label><span class="num">${U.money(x.amount)}</span></li>`).join('')}</ul></details>` : ''}

      <div class="q-body">
        ${!dir ? Q('Is this money going out or coming in?', `<div class="qchips" data-q="direction">${chip('debit', '↑ Money out (debit)', false)}${chip('credit', '↓ Money in (credit)', false)}</div>`, 'we couldn’t tell from the statement') : ''}

        ${dir ? Q(dir === 'debit' ? 'What was this payment for?' : 'What is this money?', `
          <div class="qchips" data-q="category">
            ${cats.map((c, i) => chip(c, `${Store.icon(c)} ${U.esc(c)}${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}`, !cur.skip && cur.category === c)).join('')}
            <select class="qchip-select" data-q="category-more" aria-label="Other category"><option value="">More…</option>${Store.catsOf(cur.skip ? (dir === 'credit' ? 'income' : 'expense') : cur.type).map((c) => `<option ${c.name === cur.category ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select>
          </div>
          <div class="qchips alt" data-q="kind">
            ${dir === 'debit' ? `${chip('investment', '📈 It’s an investment', cur.type === 'investment' && !cur.skip)}${chip('saving', '🐖 Moved to savings / goal', cur.type === 'saving' && !cur.skip)}${chip('expense', '🧾 Normal spending', cur.type === 'expense' && !cur.skip)}` : chip('income', '💰 Real income', !cur.skip)}
            ${chip('transfer', `🔁 ${dir === 'debit' ? 'Transfer to my own account / credit-card bill' : 'Transfer from my own account'} — don’t count`, cur.skip)}
          </div>
          ${cur.hint === 'atm' && !cur.skip ? '<p class="muted small">🏧 ATM withdrawal: file it as spending (e.g. “Other”), or mark it as a transfer if you track cash separately.</p>' : ''}
          ${cur.hint && cur.hint !== 'atm' ? `<p class="muted small">💡 The narration looks like ${cur.hint === 'card-bill' ? 'a credit-card bill payment' : 'a transfer between your own accounts'}. Counting it would double-count spending.</p>` : ''}`) : ''}

        ${dir && !cur.skip ? Q('Personal or work?', `<div class="qchips" data-q="workspace">${chip('personal', '🙂 Personal', cur.workspace === 'personal')}${chip('work', '💼 Work / business', cur.workspace === 'work')}</div>`) : ''}

        ${dir === 'debit' && !cur.skip && cur.workspace === 'work' && cur.type === 'expense' ? Q('Will you claim this back from your employer or client?', `<div class="qchips" data-q="reimbursable">${chip('yes', '✓ Yes — reimbursable', cur.reimbursable)}${chip('no', 'No — business cost', !cur.reimbursable)}</div>`) : ''}

        ${dir === 'credit' && !cur.skip && cur.category === 'Reimbursement' && pending.length ? Q('Which of your pending claims does this settle?', `
          <div class="claims">${pending.slice(0, 20).map((t) => `<label class="check"><input type="checkbox" data-claim="${t.id}" ${(cur.claims || suggestClaims(cur.amount, pending)).includes(t.id) ? 'checked' : ''}> ${U.fmtDate(t.date, { short: true })} · ${U.esc(t.payee || t.category)} <b class="num">${U.money(t.amount)}</b></label>`).join('')}</div>
          <p class="muted small" id="claim-sum"></p>`, 'they’ll be marked reimbursed') : ''}

        ${recurringLike ? Q('Is this a recurring bill or subscription?', `
          <select data-q="linkTo" class="q-select">
            <option value="">No — one-off</option>
            ${subs.length ? `<optgroup label="Your subscriptions">${subs.map((s) => `<option value="sub:${s.id}" ${cur.linkTo === 'sub:' + s.id ? 'selected' : ''}>${U.esc(s.name)} · ${U.money(s.amount)} ${Bills.CYCLES[s.cycle].label.toLowerCase()}</option>`).join('')}</optgroup>` : ''}
            ${loans.length ? `<optgroup label="Your EMIs">${loans.map((l) => `<option value="emi:${l.id}" ${cur.linkTo === 'emi:' + l.id ? 'selected' : ''}>${U.esc(l.name)} · ${U.money(l.emi)}/month</option>`).join('')}</optgroup>` : ''}
            <optgroup label="Start tracking it"><option value="new:monthly" ${cur.linkTo === 'new:monthly' ? 'selected' : ''}>＋ New monthly subscription</option><option value="new:yearly" ${cur.linkTo === 'new:yearly' ? 'selected' : ''}>＋ New yearly subscription</option><option value="new:quarterly" ${cur.linkTo === 'new:quarterly' ? 'selected' : ''}>＋ New quarterly subscription</option></optgroup>
          </select>`, g.items.length >= 2 ? `seen ${g.items.length} times` : '') : ''}

        ${dir && !cur.skip ? Q(dir === 'debit' ? 'How was it paid?' : 'How did it arrive?', `<div class="qchips" data-q="method">${methods.map((m) => chip(m, m, cur.method === m)).join('')}</div>`, cur.method ? 'read from the narration' : '') : ''}

        ${dir && !cur.skip ? `<details class="q-extra" ${cur.note || cur.tags.length ? 'open' : ''}><summary>Add a note or tags (optional)</summary>
          <div class="inline"><input data-f="note" value="${U.esc(cur.note)}" placeholder="Note — e.g. what it was for"><input data-f="tags" value="${U.esc(cur.tags.join(', '))}" placeholder="Tags — e.g. trip-goa, tax"></div></details>` : ''}
      </div>

      <div class="q-foot">
        <div class="q-opts">
          ${g.items.length > 1 ? `<label class="check small"><input type="checkbox" data-opt="applyAll" ${g.applyAll ? 'checked' : ''}> Apply to all ${g.items.length} from ${U.esc(cur.payee || 'this payee')}</label>` : ''}
          ${cur.payee && !cur.skip ? `<label class="check small"><input type="checkbox" data-opt="remember" ${g.remember ? 'checked' : ''}> Remember for next time</label>` : ''}
        </div>
        <div class="row"><button class="btn ghost" data-go="back">← Back</button><button class="btn" data-go="skipq" title="Keep the current guess">Skip</button><button class="btn primary" data-go="next" autofocus>${S.q + 1 < n ? 'Next →' : 'Review →'}</button></div>
      </div>`;
  }

  // pick pending claims whose total is closest to the reimbursement (greedy, oldest first)
  function suggestClaims(amount, pending) {
    const sorted = [...pending].sort((a, b) => (a.date < b.date ? -1 : 1));
    const pick = [];
    let sum = 0;
    for (const t of sorted) if (sum + t.amount <= amount + 1) { pick.push(t.id); sum += t.amount; }
    return pick;
  }

  function reviewTable() {
    const inc = S.items.filter((i) => i.include && !i.skip && i.direction);
    const out = inc.filter((i) => i.direction === 'debit'), inn = inc.filter((i) => i.direction === 'credit');
    const left = S.items.filter((i) => !i.include || i.skip || !i.direction);
    const catOpts = (i) => Store.catsOf(i.type).map((c) => `<option ${c.name === i.category ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('');
    const rows = (arr) => arr.map((i) => `<tr data-id="${i.id}">
        <td>${U.fmtDate(i.date, { short: true })}</td>
        <td><b>${U.esc(i.payee || '—')}</b><small class="muted block ellipsis" title="${U.esc(i.desc)}">${U.esc(i.desc).slice(0, 60)}</small></td>
        <td><select data-t="category" class="${i.category ? '' : 'need'}"><option value="">Choose…</option>${catOpts(i)}</select></td>
        <td><select data-t="workspace"><option value="personal">Personal</option><option value="work" ${i.workspace === 'work' ? 'selected' : ''}>Work</option></select>${i.reimbursable ? ' <span class="pill warn">claim</span>' : ''}${i.linkTo ? ' <span class="pill">🔁</span>' : ''}</td>
        <td class="muted">${U.esc(i.method || '—')}</td>
        <td class="num"><b>${U.money(i.amount)}</b></td>
        <td><button class="icon-btn" data-t="exclude" title="Leave out" aria-label="Leave out">✕</button></td>
      </tr>`).join('');
    const missing = inc.filter((i) => !i.category).length;
    return `
      <div class="modal-head"><div><h2>Ready to import</h2><p class="muted small">Change anything below. Nothing is saved until you press Import.</p></div><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <section class="rv-table"><header>${dirBadge('debit')} <b>${out.length}</b> · ${U.money(sumOf(out))}</header>
        ${out.length ? `<div class="table-wrap"><table class="data-table"><tbody>${rows(out)}</tbody></table></div>` : '<p class="muted small">None.</p>'}</section>
      <section class="rv-table"><header>${dirBadge('credit')} <b>${inn.length}</b> · ${U.money(sumOf(inn))}</header>
        ${inn.length ? `<div class="table-wrap"><table class="data-table"><tbody>${rows(inn)}</tbody></table></div>` : '<p class="muted small">None.</p>'}</section>
      ${left.length ? `<details class="rv-left"><summary>Not importing ${left.length} (transfers, duplicates, removed)</summary><ul>${left.map((i) => `<li><span>${U.fmtDate(i.date, { short: true })} · ${U.esc(i.payee || i.desc || '—')} · ${U.money(i.amount)} <small class="muted">${i.dupe ? 'duplicate' : i.skip ? 'own-account transfer' : !i.direction ? 'in/out unknown' : 'removed'}</small></span><button class="link-btn" data-restore="${i.id}">Include</button></li>`).join('')}</ul></details>` : ''}
      <div class="row-end">${S.queue.length ? '<button class="btn ghost" data-go="back">← Back to questions</button>' : '<button class="btn ghost" data-go="overview">← Overview</button>'}<span class="spacer"></span>
        ${missing ? `<span class="muted small">${missing} without a category will be filed as “Other”.</span>` : ''}
        <button class="btn primary" data-go="import">Import ${inc.length}</button></div>`;
  }

  // ---------- interaction ----------
  function setOnGroup(g, patch) {
    const targets = g.applyAll ? g.items : [g.items[0]];
    targets.forEach((it) => Object.assign(it, patch));
  }

  function bind(host) {
    U.$$('[data-go]', host).forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    U.$$('input[name=mode]', host).forEach((r) => r.addEventListener('change', () => { S.mode = r.value; render(); }));
    if (S.step === 'question') bindQuestion(host);
    if (S.step === 'review') bindReview(host);
  }

  function bindQuestion(host) {
    const g = S.queue[S.q];
    const it = g.items[0];
    const refresh = () => { const y = U.$('.modal').scrollTop; render(); U.$('.modal').scrollTop = y; };
    U.$$('.qchips[data-q]', host).forEach((box) => box.addEventListener('click', (e) => {
      const btn = e.target.closest('.qchip');
      if (!btn) return;
      const v = btn.dataset.v, q = box.dataset.q;
      if (q === 'direction') setOnGroup(g, { direction: v, type: v === 'credit' ? 'income' : 'expense', category: null });
      if (q === 'category') setOnGroup(g, { category: v, skip: false });
      if (q === 'workspace') setOnGroup(g, { workspace: v, reimbursable: v === 'work' ? it.reimbursable : false });
      if (q === 'reimbursable') setOnGroup(g, { reimbursable: v === 'yes' });
      if (q === 'method') setOnGroup(g, { method: v });
      if (q === 'kind') {
        if (v === 'transfer') setOnGroup(g, { skip: true });
        else {
          const cat = v === 'saving' ? 'Savings' : Store.cat(it.category)?.type === v ? it.category : v === 'investment' ? (NLP.detectCategory(it.desc, 'investment') || 'Mutual Funds') : null;
          setOnGroup(g, { skip: false, type: v, category: cat });
        }
      }
      refresh();
    }));
    U.$('[data-q="category-more"]', host)?.addEventListener('change', (e) => { if (e.target.value) { setOnGroup(g, { category: e.target.value, skip: false }); refresh(); } });
    U.$('[data-q="linkTo"]', host)?.addEventListener('change', (e) => {
      setOnGroup(g, { linkTo: e.target.value });
      if (e.target.value.startsWith('emi:')) setOnGroup(g, { category: 'EMI & Loans' });
    });
    U.$$('[data-f]', host).forEach((inp) => inp.addEventListener('change', () => {
      const f = inp.dataset.f;
      if (f === 'payee') setOnGroup(g, { payee: inp.value.trim() });
      if (f === 'amount') { g.items[0].amount = Number(inp.value) || 0; inp.classList.toggle('need', !g.items[0].amount); }
      if (f === 'date' && inp.value) g.items[0].date = inp.value;
      if (f === 'note') setOnGroup(g, { note: inp.value.trim() });
      if (f === 'tags') setOnGroup(g, { tags: inp.value.split(',').map((s) => s.trim()).filter(Boolean) });
    }));
    U.$$('[data-inc]', host).forEach((c) => c.addEventListener('change', () => { S.items.find((x) => x.id === c.dataset.inc).include = c.checked; }));
    U.$$('[data-opt]', host).forEach((c) => c.addEventListener('change', () => {
      g[c.dataset.opt] = c.checked;
      if (c.dataset.opt === 'applyAll' && !c.checked) splitGroup(g);
      else if (c.dataset.opt === 'applyAll') setOnGroup(g, pick(it));
      refresh();
    }));
    const claimBoxes = U.$$('[data-claim]', host);
    const claimSum = () => {
      const ids = claimBoxes.filter((c) => c.checked).map((c) => c.dataset.claim);
      g.items[0].claims = ids;
      const sum = U.sum(Store.state.txns.filter((t) => ids.includes(t.id)), (t) => t.amount);
      const el = U.$('#claim-sum');
      if (el) el.innerHTML = `Selected ${U.money(sum)} of ${U.money(g.items[0].amount)}${Math.abs(sum - g.items[0].amount) < 1 ? ' ✓ exact match' : ''}`;
    };
    claimBoxes.forEach((c) => c.addEventListener('change', claimSum));
    if (claimBoxes.length) claimSum();
    host.onkeydown = (e) => {
      if (e.target.matches('input:not([type=checkbox]), select, textarea')) { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); e.target.blur(); go('next'); } return; }
      if (e.key === 'Enter') { e.preventDefault(); go('next'); }
      if (/^[1-9]$/.test(e.key)) { const chips = U.$$('.qchips[data-q="category"] .qchip', host); chips[Number(e.key) - 1]?.click(); }
      if (e.key === 'ArrowLeft') go('back');
    };
  }

  const pick = (it) => ({ direction: it.direction, type: it.type, category: it.category, workspace: it.workspace, reimbursable: it.reimbursable, method: it.method, skip: it.skip, linkTo: it.linkTo, note: it.note, tags: it.tags, payee: it.payee });

  // answer each payment in this group separately
  function splitGroup(g) {
    const idx = S.queue.indexOf(g);
    const singles = g.items.map((it) => ({ key: it.id, items: [it], remember: g.remember, applyAll: true }));
    S.groups.splice(S.groups.indexOf(g), 1, ...singles);
    S.queue.splice(idx, 1, ...singles);
  }

  function bindReview(host) {
    U.$$('tr[data-id]', host).forEach((tr) => {
      const it = S.items.find((x) => x.id === tr.dataset.id);
      U.$('[data-t=category]', tr).addEventListener('change', (e) => { it.category = e.target.value || null; e.target.classList.toggle('need', !it.category); });
      U.$('[data-t=workspace]', tr).addEventListener('change', (e) => { it.workspace = e.target.value; });
      U.$('[data-t=exclude]', tr).addEventListener('click', () => { it.include = false; render(); });
    });
    U.$$('[data-restore]', host).forEach((b) => b.addEventListener('click', () => {
      const it = S.items.find((x) => x.id === b.dataset.restore);
      it.include = true; it.skip = false;
      if (!it.direction) { it.direction = 'debit'; it.type = 'expense'; }
      render();
    }));
  }

  function go(where) {
    if (where === 'overview') { S.step = 'overview'; return render(); }
    if (where === 'start') { buildQueue(); S.step = S.queue.length ? 'question' : 'review'; return render(); }
    if (where === 'review') { S.step = 'review'; return render(); }
    if (where === 'import') return commit();
    if (S.step === 'question') {
      const g = S.queue[S.q];
      if (where === 'next') {
        const it = g.items[0];
        if (!it.direction) return U.toast('Tell me if this is money out or money in first', 'error');
        if (!(it.amount > 0)) return U.toast('Enter the amount', 'error');
        if (!it.skip && !it.category) return U.toast('Pick what this was for (or press Skip)', 'error');
      }
      if (where === 'next' || where === 'skipq') {
        g.items.forEach((x) => (x.confident = true));
        if (S.q + 1 < S.queue.length) S.q++; else S.step = 'review';
        return render();
      }
      if (where === 'back') { if (S.q > 0) S.q--; else S.step = 'overview'; return render(); }
    }
    if (S.step === 'review' && where === 'back') { S.step = 'question'; S.q = Math.max(S.queue.length - 1, 0); return render(); }
  }

  // ---------- saving ----------
  function commit() {
    const st = Store.state;
    const inc = S.items.filter((i) => i.include && !i.skip && i.direction);
    if (!inc.length) return U.toast('Nothing to import', 'error');
    const fallback = { expense: 'Other', income: 'Other Income', investment: 'Mutual Funds', saving: 'Savings' };
    // new subscriptions requested in the questions (one per group)
    const newSubs = {};
    inc.filter((i) => i.linkTo?.startsWith('new:')).forEach((i) => {
      const key = U.normPayee(i.payee) + i.linkTo;
      const cycle = i.linkTo.slice(4);
      const s = (newSubs[key] ||= { id: U.uid(), name: i.payee || 'Subscription', amount: i.amount, cycle, category: i.category || 'Subscriptions', method: i.method || 'Card', workspace: i.workspace, status: 'active', reminderDays: 3, createdAt: U.todayISO(), last: i.date });
      if (i.date >= s.last) { s.last = i.date; s.amount = i.amount; }
    });
    Object.values(newSubs).forEach((s) => { const { last, ...rest } = s; st.subscriptions.push({ ...rest, nextDate: Bills.advance(last, s.cycle) }); });
    const linkIdFor = (i) => {
      if (!i.linkTo) return null;
      if (i.linkTo.startsWith('new:')) return newSubs[U.normPayee(i.payee) + i.linkTo]?.id || null;
      return i.linkTo.split(':')[1];
    };
    const txns = inc.map((i) => ({
      date: i.date, amount: i.amount, type: i.type, category: i.category || fallback[i.type], payee: i.payee || NLP.cleanPayee(i.desc) || '(unknown)',
      workspace: i.workspace, method: i.method || 'Other', note: i.note || (i.desc ? `Bank: ${i.desc}`.slice(0, 140) : ''), tags: i.tags,
      reimbursable: i.direction === 'debit' && i.workspace === 'work' && i.reimbursable, linkId: linkIdFor(i), docIds: i.docId ? [i.docId] : [], source: i.source,
    }));
    // we link explicitly, so don't let auto-linking guess
    const hook = Store.hooks.beforeAdd;
    Store.hooks.beforeAdd = null;
    const added = Store.addTxns(txns);
    Store.hooks.beforeAdd = hook;

    // move existing subscriptions' renewal dates past the newest linked payment
    inc.filter((i) => i.linkTo?.startsWith('sub:')).forEach((i) => {
      const s = st.subscriptions.find((x) => x.id === i.linkTo.slice(4));
      if (s && Bills.daysUntil(s.nextDate) <= 10 && U.daysBetween(s.nextDate, i.date) >= -10) s.nextDate = Bills.advance(i.date > s.nextDate ? i.date : s.nextDate, s.cycle);
    });
    inc.filter((i) => i.linkTo?.startsWith('emi:')).forEach((i) => { const l = st.emis.find((x) => x.id === i.linkTo.slice(4)); if (l) Bills.syncLoanAsset(l); });
    // reimbursements settle pending claims
    let settled = 0;
    inc.filter((i) => i.claims?.length).forEach((i) => i.claims.forEach((id) => { const t = st.txns.find((x) => x.id === id); if (t && !t.reimbursed) { t.reimbursed = true; settled++; } }));
    // remember payee → category
    let learned = 0;
    S.groups.forEach((g) => {
      const it = g.items[0];
      if (!g.remember || it.skip || !it.include || !it.payee || !it.category || ['Other', 'Other Income'].includes(it.category)) return;
      if (st.rules.some((r) => U.normPayee(r.match) === U.normPayee(it.payee))) return;
      st.rules.push({ id: U.uid(), match: it.payee, category: it.category, workspace: it.workspace, auto: true });
      learned++;
    });
    // attach the source document(s)
    const byDoc = U.groupBy(added.map((t, k) => ({ id: t.id, doc: inc[k].docId })).filter((x) => x.doc), (x) => x.doc);
    Object.entries(byDoc).forEach(([doc, xs]) => Store.linkDoc(doc, xs.map((x) => x.id)));
    Store.commit();
    App.closeModal();
    const out = inc.filter((i) => i.direction === 'debit'), inn = inc.filter((i) => i.direction === 'credit');
    U.toast(`Imported ${added.length}: ${out.length} out (${U.money(sumOf(out))}), ${inn.length} in (${U.money(sumOf(inn))})${settled ? ` · ${settled} claims settled` : ''}${Object.keys(newSubs).length ? ` · ${Object.keys(newSubs).length} subscriptions added` : ''}${learned ? ` · ${learned} rules learned` : ''}`, 'success');
    S = null;
  }

  return { open, suggestClaims, _state: () => S, _go: go };
})();
