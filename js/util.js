// Shared helpers: dates, money formatting, DOM helpers.
const U = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const todayISO = () => iso(new Date());
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const monthKey = (s) => s.slice(0, 7);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let moneyFmt, compactFmt, numFmt;
  function setLocale(locale, currency) {
    try {
      moneyFmt = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
      compactFmt = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
      numFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    } catch {
      moneyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
      compactFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
      numFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
    }
  }
  setLocale('en-IN', 'INR');

  const money = (n) => moneyFmt.format(Math.round(n || 0));
  const moneyC = (n) => (Math.abs(n) >= 10000 ? compactFmt.format(n || 0) : money(n));
  const num = (n) => numFmt.format(n || 0);
  const pct = (n, digits = 0) => (isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—');

  function fmtDate(s, opts = {}) {
    if (!s) return '';
    const d = parseISO(s);
    if (opts.short) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  function fmtMonth(key) { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${String(y).slice(2)}`; }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const titleCase = (s) => String(s || '').replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const normPayee = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg, kind = 'info') {
    const host = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="toast-icon">${kind === 'error' ? '⚠' : kind === 'success' ? '✓' : 'ℹ'}</span><span>${esc(msg)}</span>`;
    host.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3600);
  }

  function download(name, content, type = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const readFileAs = (file, how = 'dataURL') => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    if (how === 'text') r.readAsText(file); else if (how === 'buffer') r.readAsArrayBuffer(file); else r.readAsDataURL(file);
  });

  const loadScript = (src) => new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src + ' (are you offline?)'));
    document.head.appendChild(s);
  });

  return { pad, iso, parseISO, addDays, todayISO, daysBetween, monthKey, MONTHS, DAYS, setLocale, money, moneyC, num, pct, fmtDate, fmtMonth,
    esc, uid, sum, groupBy, debounce, cap, titleCase, median, normPayee, $, $$, toast, download, readFileAs, loadScript };
})();
