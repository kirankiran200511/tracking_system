const { URL } = require('url');

function isPrivateHost(hostname) {
  const priv = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[0-1])\./,
    /^192\.168\./,
    /^0\./,
    /^169\.254\./,
    /^fc00:/i, /^fd/i,
    /^fe80:/i,
    /^::1$/,
    /^\[::1\]$/,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /\.local$/i,
    /\.internal$/i,
  ];
  return priv.some((r) => r.test(hostname));
}

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

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const target = (req.query && req.query.url) || (req.url && new URL(req.url, 'http://localhost').searchParams.get('url'));
  if (!target) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let url;
  try {
    url = new URL(target);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!/^https?:$/.test(url.protocol)) {
    return res.status(400).json({ error: 'Only http(s) URLs are supported' });
  }

  if (isPrivateHost(url.hostname)) {
    return res.status(403).json({ error: 'Requests to private/internal addresses are not allowed' });
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 SpendWise/1.0' },
    });
    clearTimeout(timer);
    const ctype = r.headers.get('content-type') || '';
    if (!/text|html|json|xml/.test(ctype)) {
      return res.status(200).json({ ok: r.ok, status: r.status, contentType: ctype, title: '', text: '' });
    }
    const body = (await r.text()).slice(0, 2_000_000);
    const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    return res.status(200).json({
      ok: r.ok,
      status: r.status,
      contentType: ctype,
      title: htmlToText(title),
      text: htmlToText(body).slice(0, 200_000),
    });
  } catch (e) {
    return res.status(502).json({ error: 'Could not fetch that URL: ' + e.message });
  }
};
