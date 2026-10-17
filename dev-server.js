// SpendWise local server — zero dependencies.
// Serves the app on http://localhost:5173 and offers /api/fetch?url=… so the
// browser can read receipt / invoice pages that would otherwise be blocked by CORS.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 5173;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

// Security: block requests to private/internal IP ranges (SSRF protection)
function isPrivateHost(hostname) {
  // Resolve common private ranges
  const priv = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[0-1])\./,
    /^192\.168\./,
    /^0\./,
    /^169\.254\./,          // link-local
    /^fc00:/i, /^fd/i,     // IPv6 ULA
    /^fe80:/i,             // IPv6 link-local
    /^::1$/,               // IPv6 loopback
    /^\[::1\]$/,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT
    /\.local$/i,
    /\.internal$/i,
  ];
  return priv.some((r) => r.test(hostname));
}

// Simple rate limiter: max 30 fetch requests per minute
const fetchLog = [];
const RATE_LIMIT = 30;
const RATE_WINDOW = 60000;
function isRateLimited() {
  const now = Date.now();
  while (fetchLog.length && fetchLog[0] < now - RATE_WINDOW) fetchLog.shift();
  if (fetchLog.length >= RATE_LIMIT) return true;
  fetchLog.push(now);
  return false;
}

// Security headers applied to all responses
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://*.supabase.co https://*.supabase.in https://cdn.jsdelivr.net",
    "frame-src https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '),
};

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8377;|&#x20b9;/gi, '₹')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function handleFetch(req, res, target) {
  // Rate limit check
  if (isRateLimited()) return json(res, 429, { error: 'Too many requests — try again in a minute' });

  let url;
  try { url = new URL(target); } catch { return json(res, 400, { error: 'Invalid URL' }); }
  if (!/^https?:$/.test(url.protocol)) return json(res, 400, { error: 'Only http(s) URLs are supported' });

  // SSRF protection: block private/internal addresses
  if (isPrivateHost(url.hostname)) return json(res, 403, { error: 'Requests to private/internal addresses are not allowed' });

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 SpendWise/1.0' } });
    clearTimeout(timer);
    const ctype = r.headers.get('content-type') || '';
    if (!/text|html|json|xml/.test(ctype)) return json(res, 200, { ok: r.ok, status: r.status, contentType: ctype, title: '', text: '' });
    const body = (await r.text()).slice(0, 2_000_000);
    const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    json(res, 200, { ok: r.ok, status: r.status, contentType: ctype, title: htmlToText(title), text: htmlToText(body).slice(0, 200_000) });
  } catch (e) {
    json(res, 502, { error: 'Could not fetch that URL: ' + e.message });
  }
}

function json(res, code, obj) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS };
  res.writeHead(code, headers);
  res.end(JSON.stringify(obj));
}

http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  // Only allow GET and HEAD methods
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...SECURITY_HEADERS, 'Allow': 'GET, HEAD' });
    return res.end();
  }

  if (u.pathname === '/api/fetch') return handleFetch(req, res, u.searchParams.get('url') || '');
  if (u.pathname === '/api/ping') return json(res, 200, { ok: true });

  // Decode first, then normalize — and verify the result stays inside ROOT
  let file;
  try {
    const decoded = decodeURIComponent(u.pathname);
    file = path.normalize(path.join(ROOT, decoded));
  } catch {
    res.writeHead(400, SECURITY_HEADERS);
    return res.end('Bad request');
  }

  // Path traversal protection: resolved path must be inside ROOT
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    res.writeHead(403, SECURITY_HEADERS);
    return res.end();
  }

  // Block serving hidden/sensitive files
  const rel = path.relative(ROOT, file);
  if (rel.split(path.sep).some((seg) => seg.startsWith('.'))) {
    res.writeHead(403, SECURITY_HEADERS);
    return res.end();
  }

  if (u.pathname === '/') file = path.join(ROOT, 'index.html');

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, SECURITY_HEADERS); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n  SpendWise is running →  http://localhost:${PORT}\n  (Ctrl+C to stop)\n`);
});
