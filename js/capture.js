// "Add" flows: speak/type, manual form, upload (CSV, receipt image, PDF), link/paste.
// Every flow produces drafts that the user reviews before they are saved.
const Capture = (() => {
  const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const TYPES = [['expense', 'Expense'], ['income', 'Income'], ['investment', 'Investment'], ['saving', 'Saving']];

  let drafts = [];
  let draftCtx = {};
  let recog = null;

  const catOptions = (type, sel) => Store.catsOf(type).map((c) => `<option ${c.name === sel ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('');
  const opts = (list, sel) => list.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');

  function open(tab = 'quick', prefill) {
    drafts = [];
    draftCtx = {};
    App.modal(`
      <div class="modal-head">
        <h2>Add money movement</h2>
        <button class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      <div class="tabs" role="tablist">
        ${[['quick', '🎙️ Speak or type'], ['form', '📝 Form'], ['upload', '📎 Upload'], ['link', '🔗 Link / paste']].map(([k, l]) => `<button role="tab" class="tab${k === tab ? ' active' : ''}" data-tab="${k}">${l}</button>`).join('')}
      </div>
      <div id="cap-body" class="cap-body"></div>
      <div id="cap-drafts"></div>`, { wide: true, onClose: stopVoice });
    U.$$('.modal .tab').forEach((b) => b.addEventListener('click', () => {
      U.$$('.modal .tab').forEach((x) => x.classList.toggle('active', x === b));
      stopVoice();
      renderTab(b.dataset.tab);
    }));
    renderTab(tab, prefill);
  }

  function renderTab(tab, prefill) {
    const body = U.$('#cap-body');
    if (tab === 'quick') return quickTab(body, prefill);
    if (tab === 'form') return formTab(body, prefill);
    if (tab === 'upload') return uploadTab(body);
    if (tab === 'link') return linkTab(body);
  }

  // ---------- speak / type ----------
  function quickTab(body, prefill) {
    const canVoice = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    body.innerHTML = `
      <p class="muted">Say or type it the way you'd tell a friend. Several at once is fine.</p>
      <div class="quick-wrap">
        <textarea id="quick-text" rows="3" placeholder="e.g. Spent 450 on groceries at DMart yesterday via UPI, and 1200 for client lunch at Taj for work">${U.esc(prefill || '')}</textarea>
        <button id="mic" class="mic${canVoice ? '' : ' disabled'}" title="${canVoice ? 'Hold a thought, tap to speak' : 'Voice needs Chrome or Edge'}" aria-label="Voice input">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>
        </button>
      </div>
      <div id="voice-status" class="voice-status" aria-live="polite"></div>
      <div class="chips examples">
        ${['Paid 250 to Uber today', 'Got salary 85000 on 1st', 'SIP 5000 in mutual funds', 'Netflix 649 by card', 'Client dinner 3200 at Olive for work reimbursable', 'Saved 10000 for emergency fund'].map((e) => `<button class="chip" data-ex="${U.esc(e)}">${U.esc(e)}</button>`).join('')}
      </div>
      <div class="row-end"><button id="quick-parse" class="btn primary">Understand it →</button></div>`;
    const ta = U.$('#quick-text');
    ta.focus();
    U.$$('[data-ex]', body).forEach((c) => c.addEventListener('click', () => { ta.value = ta.value ? `${ta.value}, ${c.dataset.ex}` : c.dataset.ex; ta.focus(); }));
    U.$('#quick-parse').addEventListener('click', () => doParse(ta.value, 'text'));
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) { e.preventDefault(); doParse(ta.value, 'text'); } });
    U.$('#mic').addEventListener('click', () => (recog ? stopVoice() : startVoice(ta)));
    if (prefill) doParse(prefill, 'text');
  }

  function doParse(text, source) {
    const parsed = NLP.parse(text);
    if (!parsed.length) return U.toast('I could not find an amount in that. Try "spent 300 on lunch".', 'error');
    showDrafts(parsed.map((d) => ({ ...d, source })), { source });
  }

  function startVoice(ta) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return U.toast('Voice input needs Chrome or Edge. You can still type.', 'error');
    if (location.protocol === 'file:') U.toast('Tip: run "npm start" and open http://localhost:5173 so the mic permission is remembered.', 'info');
    recog = new SR();
    recog.lang = Store.state.settings.voiceLang || 'en-IN';
    recog.interimResults = true;
    recog.continuous = true;
    const before = ta.value ? ta.value + ', ' : '';
    let finalText = '';
    const mic = U.$('#mic'), status = U.$('#voice-status');
    mic.classList.add('live');
    status.innerHTML = '<span class="pulse"></span> Listening… tap the mic again when you are done.';
    recog.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      ta.value = before + finalText + interim;
    };
    recog.onerror = (e) => {
      status.textContent = e.error === 'not-allowed' ? 'Microphone permission was blocked. Allow it in the address bar and try again.' : `Voice error: ${e.error}`;
    };
    recog.onend = () => {
      mic?.classList.remove('live');
      if (status && status.querySelector('.pulse')) status.textContent = '';
      recog = null;
      if (finalText.trim()) doParse(ta.value, 'voice');
    };
    recog.start();
  }
  function stopVoice() { if (recog) { try { recog.stop(); } catch {} } }

  // ---------- manual form ----------
  function formTab(body, t = {}) {
    t = typeof t === 'object' && t ? t : {};
    body.innerHTML = txnForm(t);
    bindTxnForm(body, (data) => {
      Store.addTxn({ ...data, source: 'manual' });
      U.toast('Saved', 'success');
      App.closeModal();
    });
  }

  function txnForm(t = {}) {
    const type = t.type || 'expense';
    return `
      <form class="grid-form" id="txn-form" autocomplete="off">
        <div class="seg full" role="radiogroup" aria-label="Type">${TYPES.map(([v, l]) => `<label><input type="radio" name="type" value="${v}" ${v === type ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        <label>Amount<input name="amount" type="number" step="0.01" min="0" required value="${t.amount ?? ''}" placeholder="0" inputmode="decimal"></label>
        <label>Date<input name="date" type="date" required value="${t.date || U.todayISO()}"></label>
        <label>${type === 'income' ? 'From' : 'Paid to'}<input name="payee" list="payee-list" value="${U.esc(t.payee || '')}" placeholder="Person, shop or company"></label>
        <label>Category<select name="category">${catOptions(type, t.category)}</select></label>
        <label>Workspace<select name="workspace">${opts([['personal', '🙂 Personal'], ['work', '💼 Work']], t.workspace || 'personal')}</select></label>
        <label>Payment method<select name="method">${Store.METHODS.map((m) => `<option ${m === (t.method || 'UPI') ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="full">Note<input name="note" value="${U.esc(t.note || '')}" placeholder="Optional"></label>
        <label>Tags<input name="tags" value="${U.esc((t.tags || []).join(', '))}" placeholder="trip-goa, gifts"></label>
        <div class="checks">
          <label class="check"><input type="checkbox" name="reimbursable" ${t.reimbursable ? 'checked' : ''}> Reimbursable</label>
          <label class="check"><input type="checkbox" name="reimbursed" ${t.reimbursed ? 'checked' : ''}> Reimbursed</label>
        </div>
        <datalist id="payee-list">${[...new Set(Store.state.txns.map((x) => x.payee).filter(Boolean))].slice(0, 300).map((p) => `<option value="${U.esc(p)}">`).join('')}</datalist>
        <div class="row-end full">${t.id ? '<button type="button" class="btn danger ghost" data-delete>Delete</button><span class="spacer"></span>' : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${t.id ? 'Save changes' : 'Add'}</button></div>
      </form>`;
  }

  function bindTxnForm(root, onSubmit) {
    const f = U.$('#txn-form', root);
    f.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', () => {
      f.category.innerHTML = catOptions(r.value);
    }));
    f.payee.addEventListener('change', () => {
      const s = Store.suggestFor(f.payee.value);
      const type = f.querySelector('input[name=type]:checked').value;
      if (s?.category && Store.cat(s.category)?.type === type) f.category.value = s.category;
      if (s?.workspace) f.workspace.value = s.workspace;
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      onSubmit({
        type: fd.get('type'), amount: Number(fd.get('amount')), date: fd.get('date'), payee: fd.get('payee'), category: fd.get('category'),
        workspace: fd.get('workspace'), method: fd.get('method'), note: fd.get('note'), tags: fd.get('tags'),
        reimbursable: !!fd.get('reimbursable'), reimbursed: !!fd.get('reimbursed'),
      });
    });
    setTimeout(() => f.amount.focus(), 30);
  }

  function edit(id) {
    const t = Store.state.txns.find((x) => x.id === id);
    if (!t) return;
    App.modal(`<div class="modal-head"><h2>Edit transaction</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      ${txnForm(t)}
      ${t.docIds.length ? `<div class="linked-docs"><h4>Attached documents</h4>${t.docIds.map((d) => { const doc = Store.state.docs.find((x) => x.id === d); return doc ? `<button class="chip" data-doc="${d}">📎 ${U.esc(doc.name)}</button>` : ''; }).join('')}</div>` : ''}
      ${t.raw ? '' : ''}<p class="muted small">Added via ${U.esc(t.source)}.</p>`);
    bindTxnForm(U.$('.modal'), (data) => { Store.updateTxn(id, data); U.toast('Updated', 'success'); App.closeModal(); });
    U.$('[data-delete]')?.addEventListener('click', () => { Store.deleteTxns([id]); App.closeModal(); App.undoToast([t]); });
    U.$$('[data-doc]').forEach((b) => b.addEventListener('click', () => Views.openDoc(b.dataset.doc)));
  }

  // ---------- upload ----------
  function uploadTab(body) {
    body.innerHTML = `
      <label class="dropzone" id="drop">
        <input type="file" id="file-in" multiple accept=".csv,.txt,.tsv,.pdf,.json,image/*" hidden>
        <div class="dz-icon">📎</div>
        <div><b>Drop files here</b> or click to browse</div>
        <div class="muted small">Bank statement CSV · receipt / bill photo · invoice or statement PDF · SpendWise backup (.json)</div>
      </label>
      <div id="upload-status" class="upload-status" aria-live="polite"></div>`;
    const input = U.$('#file-in'), drop = U.$('#drop');
    input.addEventListener('change', () => handleFiles([...input.files]));
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); handleFiles([...e.dataTransfer.files]); });
  }

  async function handleFiles(files) {
    const status = U.$('#upload-status');
    const all = [];
    let docIds = [];
    for (const f of files) {
      const line = document.createElement('div');
      line.className = 'up-line';
      line.innerHTML = `<span class="spinner"></span> ${U.esc(f.name)} — reading…`;
      status.appendChild(line);
      const set = (msg, ok = true) => (line.innerHTML = `<span>${ok ? '✓' : '⚠'}</span> ${U.esc(f.name)} — ${msg}`);
      try {
        if (/\.json$/i.test(f.name)) {
          if (confirm('Restore this backup? It replaces all current data.')) { Store.importJSON(await U.readFileAs(f, 'text')); set('backup restored'); U.toast('Backup restored', 'success'); }
          else set('skipped', false);
          continue;
        }
        if (/\.(csv|tsv|txt)$/i.test(f.name) || f.type === 'text/csv') {
          const text = await U.readFileAs(f, 'text');
          const rows = /\.txt$/i.test(f.name) && !/[,\t;]/.test(text.split('\n')[0]) ? NLP.parseStatementLines(text) : parseCSV(text);
          const doc = await Store.addDoc({ name: f.name, kind: 'file', mime: f.type || 'text/csv', size: f.size, extractedText: text.slice(0, 50000) }, f.size < 8e6 ? await U.readFileAs(f) : null);
          docIds.push(doc.id);
          all.push(...rows.map((r) => ({ ...r, source: 'csv', _docId: doc.id })));
          const out = rows.filter((r) => r.direction === 'debit').length, inn = rows.filter((r) => r.direction === 'credit').length;
          set(`${rows.length} transactions — ${out} debits, ${inn} credits${rows.length - out - inn ? `, ${rows.length - out - inn} unclear` : ''}`, rows.length > 0);
          continue;
        }
        const dataUrl = await U.readFileAs(f);
        const doc = await Store.addDoc({ name: f.name, kind: 'file', mime: f.type, size: f.size }, f.size < 8e6 ? dataUrl : null);
        docIds.push(doc.id);
        if (f.type.startsWith('image/')) {
          line.innerHTML = `<span class="spinner"></span> ${U.esc(f.name)} — reading text from image (first run downloads the OCR engine)…`;
          const text = await ocr(dataUrl, (p) => (line.innerHTML = `<span class="spinner"></span> ${U.esc(f.name)} — OCR ${Math.round(p * 100)}%`));
          doc.extractedText = text.slice(0, 20000);
          const lines = NLP.parseStatementLines(text);
          if (lines.length >= 3) { all.push(...lines.map((l) => ({ ...l, source: 'receipt', _docId: doc.id }))); set(`statement photo with ${lines.length} transactions`); }
          else {
            const d = NLP.parseReceipt(text);
            all.push({ ...d, direction: d.type === 'income' ? 'credit' : 'debit', desc: text.split('\n').filter((x) => x.trim()).slice(0, 2).join(' · ').slice(0, 80), source: 'receipt', _docId: doc.id });
            set(d.amount ? `found total ${U.money(d.amount)}${d.payee ? ` at ${d.payee}` : ''}` : 'saved; could not find a total — fill it in next', !!d.amount);
          }
        } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          const text = await pdfText(await U.readFileAs(f, 'buffer'));
          doc.extractedText = text.slice(0, 50000);
          const lines = NLP.parseStatementLines(text);
          if (lines.length >= 3) { all.push(...lines.map((l) => ({ ...l, source: 'pdf', _docId: doc.id }))); set(`statement with ${lines.length} transactions`); }
          else { const d = NLP.parseReceipt(text); all.push({ ...d, direction: d.type === 'income' ? 'credit' : 'debit', source: 'pdf', _docId: doc.id }); set(d.amount ? `invoice total ${U.money(d.amount)}` : 'saved; no total found', !!d.amount); }
        } else set('saved to Documents');
        Store.commit(true);
      } catch (e) {
        console.error(e);
        set(e.message || 'could not read this file', false);
      }
    }
    if (all.length) {
      const names = files.map((f) => f.name);
      setTimeout(() => Review.open(all, { source: 'upload', docName: names.length === 1 ? names[0] : `${names.length} files` }), 600);
    } else if (docIds.length) U.toast('Saved to Documents', 'success');
  }

  async function ocr(dataUrl, onProgress) {
    await U.loadScript(TESSERACT);
    const { data } = await Tesseract.recognize(dataUrl, 'eng', { logger: (m) => m.status === 'recognizing text' && onProgress(m.progress) });
    return data.text || '';
  }

  async function pdfText(buffer) {
    await U.loadScript(PDFJS);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const out = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 40); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const rows = {};
      content.items.forEach((it) => { const y = Math.round(it.transform[5] / 3); (rows[y] ||= []).push(it); });
      Object.keys(rows).sort((a, b) => b - a).forEach((y) => out.push(rows[y].sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join(' ')));
    }
    return out.join('\n');
  }

  // CSV with header detection: date, description/narration, amount | debit+credit | type, category.
  function splitCSV(text) {
    const delim = [',', ';', '\t'].map((d) => [d, (text.split('\n')[0].match(new RegExp(d === '\t' ? '\t' : `\\${d}`, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur.trim()); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur.trim()); if (row.some(Boolean)) rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    row.push(cur.trim()); if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  function parseCSV(text) {
    const rows = splitCSV(text);
    const hi = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|debit|withdraw|credit|deposit|value/i.test(c)));
    if (hi < 0) return NLP.parseStatementLines(text);
    const h = rows[hi].map((c) => c.toLowerCase());
    const col = (re, not) => h.findIndex((c) => re.test(c) && !(not && not.test(c)));
    const iDate = col(/^(txn |transaction |value )?date|date$/), iDesc = col(/desc|narration|particular|details|remark|merchant|payee|name|memo/);
    // a "Dr/Cr" or "Type" column says the direction; it is not an amount column
    const notTypeCol = /dr\s*\/\s*cr|cr\s*\/\s*dr|type|balance/;
    const iAmt = col(/^amount|amount$|amt|value(?! date)/, /balance|dr\s*\/\s*cr|cr\s*\/\s*dr/), iDr = col(/debit|withdraw|\bdr\b|paid out/, notTypeCol), iCr = col(/credit|deposit|\bcr\b|paid in/, notTypeCol);
    const iType = col(/^type$|dr\/cr|cr\/dr|^txn type|transaction type/), iCat = col(/categor/), iWs = col(/workspace|account type/), iMethod = col(/method|mode/), iNote = col(/note|comment/), iBal = col(/balance/);
    const num = (s) => { const n = parseFloat(String(s || '').replace(/[^\d.\-]/g, '')); return isNaN(n) ? 0 : n; };
    const body = rows.slice(hi + 1);
    const signed = iAmt >= 0 && body.some((x) => num(x[iAmt]) < 0);
    const base = body.map((r) => {
      const date = NLP.parseDate(r[iDate] || '') || null;
      if (!date) return null;
      let amount = 0, direction = null, type = null;
      if (iDr >= 0 || iCr >= 0) {
        const dr = num(r[iDr]), cr = num(r[iCr]);
        if (cr > 0 && !dr) { amount = cr; direction = 'credit'; } else if (dr) { amount = Math.abs(dr); direction = 'debit'; }
      } else {
        const a = num(r[iAmt]);
        amount = Math.abs(a);
        const tcol = String(r[iType] || '').toLowerCase();
        if (/\bcr\b|credit|income|deposit/.test(tcol)) direction = 'credit';
        else if (/\bdr\b|debit|expense|withdraw/.test(tcol)) direction = 'debit';
        else if (/invest/.test(tcol)) { direction = 'debit'; type = 'investment'; }
        else if (/sav/.test(tcol)) { direction = 'debit'; type = 'saving'; }
        else if (signed) direction = a < 0 ? 'debit' : 'credit'; // signed amounts: + in, − out
      }
      if (!amount) return null;
      return { date, amount, direction, desc: r[iDesc] || '', balance: iBal >= 0 && r[iBal] !== '' ? num(r[iBal]) : null, _r: r, _type: type };
    }).filter(Boolean);
    return NLP.inferDirections(base).map((b) => {
      const row = NLP.statementRow(b);
      const r = b._r;
      if (b._type) row.type = b._type;
      const csvCat = iCat >= 0 && Store.cat(r[iCat]) ? r[iCat] : null;
      if (csvCat) { row.category = csvCat; row.type = Store.cat(csvCat).type; row.direction = row.type === 'income' ? 'credit' : 'debit'; row.learned = true; }
      if (iWs >= 0 && /work|business/i.test(r[iWs])) row.workspace = 'work';
      if (iMethod >= 0 && Store.METHODS.includes(r[iMethod])) row.method = r[iMethod];
      if (iNote >= 0 && r[iNote]) row.note = r[iNote];
      return row;
    });
  }

  // "UPI/DR/412345678/SWIGGY/YESB/swiggy@yesbank/Payment" → "Swiggy"
  function cleanDesc(desc) {
    const parts = desc.split(/[\/|\-*]/).map((s) => s.trim()).filter((s) => /[a-z]{3,}/i.test(s) && !/^(upi|neft|imps|rtgs|pos|ach|nach|dr|cr|payment|transfer|to|from|by|ref|txn|yesb|hdfc|icic|sbin|utib|kkbk|paytm|ybl|okaxis|oksbi|okhdfcbank|okicici)$/i.test(s) && !/@/.test(s));
    return U.titleCase((parts[0] || desc).replace(/\d{4,}/g, '').replace(/\b(neft|imps|rtgs|upi|ach|nach|pos|cr|dr|txn|ref|inb)\b/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 36));
  }

  // ---------- link / paste ----------
  function linkTab(body) {
    body.innerHTML = `
      <label class="stack">Link to a receipt, invoice, order page — or a UPI payment link
        <div class="inline"><input id="url-in" type="url" placeholder="https://… or upi://pay?pa=…&am=…"><button id="url-go" class="btn primary">Add</button></div>
      </label>
      <p class="muted small">Web links are saved to Documents. When SpendWise runs through <code>npm start</code>, it also reads the page and pulls out the total.</p>
      <hr>
      <label class="stack">Or paste text — bank SMS alerts, a statement, an email receipt
        <textarea id="paste-in" rows="5" placeholder="Rs.499.00 debited from A/c XX1234 on 22-09-26 to VPA netflix@icici UPI Ref 4321…"></textarea>
      </label>
      <div class="row-end"><button id="paste-go" class="btn">Find transactions</button></div>`;
    U.$('#url-go').addEventListener('click', () => handleUrl(U.$('#url-in').value.trim()));
    U.$('#url-in').addEventListener('keydown', (e) => e.key === 'Enter' && handleUrl(e.target.value.trim()));
    U.$('#paste-go').addEventListener('click', () => {
      const text = U.$('#paste-in').value;
      const lines = NLP.parseStatementLines(text);
      const found = lines.length ? lines : NLP.parse(text);
      if (!found.length) return U.toast('No amounts found in that text', 'error');
      Review.open(found.map((d) => ({ ...d, source: 'paste' })), { source: 'paste', docName: 'pasted text' });
    });
  }

  async function handleUrl(url) {
    if (!url) return;
    if (/^upi:/i.test(url)) {
      const d = NLP.parseUPI(url);
      if (!d) return U.toast('That UPI link could not be read', 'error');
      return Review.open([{ ...d, direction: 'debit', desc: url, source: 'url' }], { source: 'url', docName: 'UPI payment link' });
    }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let host = url;
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return U.toast('That does not look like a link', 'error'); }
    const doc = await Store.addDoc({ name: host, kind: 'url', url, mime: 'text/uri-list' });
    let draft = { amount: 0, payee: U.titleCase(host.split('.')[0]), date: U.todayISO(), type: 'expense', source: 'url', _docId: doc.id };
    if (location.protocol.startsWith('http')) {
      U.toast('Reading the page…');
      try {
        const r = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
        const j = await r.json();
        if (j.text) {
          doc.name = j.title?.slice(0, 80) || host;
          doc.extractedText = j.text.slice(0, 20000);
          Store.commit(true);
          const d = NLP.parseReceipt(j.text);
          draft = { ...d, payee: d.payee && d.payee.length < 30 ? d.payee : draft.payee, source: 'url', _docId: doc.id };
        }
        if (j.error) U.toast(j.error, 'error');
      } catch { /* server not running – keep the link only */ }
    }
    Review.open([{ direction: draft.type === 'income' ? 'credit' : 'debit', desc: doc.name, ...draft }], { source: 'url', docName: doc.name });
  }

  // ---------- drafts review ----------
  function showDrafts(list, ctx) {
    drafts = list.map((d) => {
      const type = d.type || 'expense';
      const fallback = type === 'expense' ? 'Other' : type === 'income' ? 'Other Income' : Store.catsOf(type)[0]?.name;
      const category = d.category && Store.cat(d.category)?.type === type ? d.category : fallback;
      return { date: U.todayISO(), method: 'UPI', workspace: 'personal', ...d, type, category, _id: U.uid() };
    });
    draftCtx = ctx;
    renderDrafts();
  }

  function renderDrafts() {
    const host = U.$('#cap-drafts');
    if (!host) return;
    if (!drafts.length) { host.innerHTML = ''; return; }
    const dupes = (d) => Store.state.txns.some((t) => t.date === d.date && Math.abs(t.amount - d.amount) < 0.01 && t.type === d.type);
    host.innerHTML = `
      <div class="drafts-head"><h3>Review ${drafts.length} ${drafts.length === 1 ? 'entry' : 'entries'}</h3><span class="muted small">Edit anything that looks off, then save.</span></div>
      <div class="drafts">
        ${drafts.map((d) => `
        <div class="draft${dupes(d) ? ' dupe' : ''}" data-id="${d._id}">
          <select data-f="type" aria-label="Type">${opts(TYPES, d.type)}</select>
          <input data-f="amount" type="number" step="0.01" value="${d.amount || ''}" aria-label="Amount" placeholder="Amount" class="${d.amount ? '' : 'need'}">
          <input data-f="date" type="date" value="${d.date}" aria-label="Date">
          <input data-f="payee" value="${U.esc(d.payee || '')}" placeholder="Paid to / from" aria-label="Payee">
          <select data-f="category" aria-label="Category">${catOptions(d.type, d.category)}</select>
          <select data-f="workspace" aria-label="Workspace">${opts([['personal', 'Personal'], ['work', 'Work']], d.workspace)}</select>
          <select data-f="method" aria-label="Method">${Store.METHODS.map((m) => `<option ${m === d.method ? 'selected' : ''}>${m}</option>`).join('')}</select>
          <label class="check small" title="Reimbursable"><input type="checkbox" data-f="reimbursable" ${d.reimbursable ? 'checked' : ''}> Claim</label>
          <button class="icon-btn" data-rm aria-label="Remove">✕</button>
          ${dupes(d) ? '<div class="dupe-note">⚠ Possible duplicate: same date, amount and type already exists.</div>' : ''}
          ${d.raw && drafts.length > 1 ? `<div class="raw">“${U.esc(d.raw)}”</div>` : ''}
        </div>`).join('')}
      </div>
      <div class="row-end">
        ${drafts.some(dupes) ? '<button class="btn ghost" id="drop-dupes">Skip duplicates</button>' : ''}
        <button class="btn" id="drafts-clear">Discard</button>
        <button class="btn primary" id="drafts-save">Save ${drafts.length}</button>
      </div>`;
    U.$$('.draft', host).forEach((row) => {
      const d = drafts.find((x) => x._id === row.dataset.id);
      U.$$('[data-f]', row).forEach((inp) => inp.addEventListener('change', () => {
        const f = inp.dataset.f;
        d[f] = inp.type === 'checkbox' ? inp.checked : f === 'amount' ? Number(inp.value) : inp.value;
        if (f === 'type') { d.category = Store.catsOf(d.type)[0]?.name; renderDrafts(); }
        if (f === 'payee') { const s = Store.suggestFor(d.payee); if (s?.category && Store.cat(s.category)?.type === d.type) { d.category = s.category; renderDrafts(); } }
      }));
      U.$('[data-rm]', row).addEventListener('click', () => { drafts = drafts.filter((x) => x !== d); renderDrafts(); });
    });
    U.$('#drop-dupes')?.addEventListener('click', () => { drafts = drafts.filter((d) => !dupes(d)); renderDrafts(); });
    U.$('#drafts-clear').addEventListener('click', () => { drafts = []; renderDrafts(); });
    U.$('#drafts-save').addEventListener('click', save);
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function save() {
    const bad = drafts.filter((d) => !(d.amount > 0));
    if (bad.length) return U.toast(`${bad.length} ${bad.length === 1 ? 'entry needs' : 'entries need'} an amount`, 'error');
    const added = Store.addTxns(drafts.map(({ _id, _docId, raw, ...d }) => ({ ...d, note: d.note || '', docIds: _docId ? [_docId] : [] })));
    const byDoc = U.groupBy(drafts.map((d, i) => ({ doc: d._docId, id: added[i].id })).filter((x) => x.doc), (x) => x.doc);
    Object.entries(byDoc).forEach(([doc, xs]) => Store.linkDoc(doc, xs.map((x) => x.id)));
    // remember payee → category choices as rules for next time
    drafts.forEach((d) => {
      if (d.payee && d.category && !['Other', 'Other Income'].includes(d.category) && !Store.state.rules.some((r) => U.normPayee(r.match) === U.normPayee(d.payee))) {
        Store.state.rules.push({ id: U.uid(), match: d.payee, category: d.category, workspace: d.workspace, auto: true });
      }
    });
    Store.commit();
    U.toast(`Saved ${added.length} ${added.length === 1 ? 'entry' : 'entries'}`, 'success');
    App.closeModal();
  }

  return { open, edit, parseCSV, cleanDesc, txnForm };
})();
