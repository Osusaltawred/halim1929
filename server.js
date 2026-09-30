'use strict';
// إخفاء تحذير SQLite التجريبي فقط
const _emit = process.emitWarning;
process.emitWarning = (w, ...a) => (String(w && w.message ? w.message : w).includes('SQLite') ? undefined : _emit.call(process, w, ...a));

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cfg = require('./lib/config');
const auth = require('./lib/auth');
const { MIME } = require('./lib/schema');
require('./lib/db');
const { seed } = require('./lib/seed');
const pub = require('./lib/api-public');
const admin = require('./lib/api-admin');

const CSP = [
  "default-src 'self'",
  `img-src 'self' data: blob:${cfg.MEDIA_BASE_URL ? ' ' + cfg.MEDIA_BASE_URL : ''}`,
  `media-src 'self' blob:${cfg.MEDIA_BASE_URL ? ' ' + cfg.MEDIA_BASE_URL : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "script-src 'self'",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

function baseHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': CSP,
    ...extra,
  };
}

function sendJson(req, res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  const headers = baseHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  if (body.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const gz = zlib.gzipSync(body);
    res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': gz.length });
    return res.end(gz);
  }
  res.writeHead(status, { ...headers, 'Content-Length': body.length });
  res.end(body);
}

function readBody(req, limit = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('الطلب كبير جدًا'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- الملفات ----------
const gzCache = new Map();
const TEXTUAL = /^(text\/|application\/(json|manifest\+json)|image\/svg)/;

function serveFile(req, res, file, opts = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file).slice(1).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = baseHeaders({
    'Content-Type': type, 'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': st.mtime.toUTCString(),
    'Cache-Control': opts.cache || 'no-cache',
  });
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    if (start < 0) start = 0;
    if (start >= st.size || end < start) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${st.size}` });
      res.end();
      return true;
    }
    end = Math.min(end, st.size - 1);
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end(), true;
    fs.createReadStream(file, { start, end }).pipe(res);
    return true;
  }

  if (TEXTUAL.test(type) && st.size < 2 * 1024 * 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    let hit = gzCache.get(file);
    if (!hit || hit.etag !== etag) {
      hit = { etag, buf: zlib.gzipSync(fs.readFileSync(file)) };
      gzCache.set(file, hit);
    }
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': hit.buf.length });
    res.end(req.method === 'HEAD' ? undefined : hit.buf);
    return true;
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}

const inside = (root, p) => {
  const full = path.resolve(root, '.' + path.sep + p);
  return full === root || full.startsWith(root + path.sep) ? full : null;
};

// ---------- التوجيه ----------
function match(routes, method, pathname) {
  for (const [m, pattern, fn] of routes) {
    if (m && m !== method) continue;
    if (typeof pattern === 'string') { if (pattern === pathname) return { fn, m: [] }; }
    else { const r = pattern.exec(pathname); if (r) return { fn, m: r }; }
  }
  return null;
}

const publicRoutes = pub.routes.map(([p, fn]) => ['GET', p, fn]);

async function handleApi(req, res, url, pathname) {
  const ctx = {
    req, res, url, q: url.searchParams, handled: false, m: [],
    text: () => readBody(req),
    json: async () => {
      const t = await readBody(req);
      try { return t ? JSON.parse(t) : {}; } catch { throw Object.assign(new Error('JSON غير صالح'), { status: 400 }); }
    },
  };
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (auth.throttled(ip)) return sendJson(req, res, 429, { error: 'محاولات كثيرة. حاول بعد عشر دقائق.' });
    const { password } = await ctx.json();
    if (!auth.verifyPassword(password || '')) {
      auth.noteFailure(ip);
      return sendJson(req, res, 401, { error: 'كلمة المرور غير صحيحة' });
    }
    res.setHeader('Set-Cookie', auth.cookieHeader(req, auth.makeToken()));
    return sendJson(req, res, 200, { ok: true });
  }
  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', auth.cookieHeader(req, null));
    return sendJson(req, res, 200, { ok: true });
  }
  if (pathname === '/api/admin/me') return sendJson(req, res, 200, { authed: auth.isAuthed(req) });

  if (pathname.startsWith('/api/admin/')) {
    if (!auth.isAuthed(req)) return sendJson(req, res, 401, { error: 'سجّل الدخول أولًا' });
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'halim') return sendJson(req, res, 403, { error: 'طلب مرفوض' });
    const hit = match(admin.routes, req.method, pathname);
    if (!hit) return sendJson(req, res, 404, { error: 'غير موجود' });
    ctx.m = hit.m;
    const out = await hit.fn(ctx);
    if (!ctx.handled) sendJson(req, res, 200, out === undefined ? { ok: true } : out);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(req, res, 405, { error: 'غير مسموح' });
  const hit = match(publicRoutes, 'GET', pathname);
  if (!hit) return sendJson(req, res, 404, { error: 'غير موجود' });
  ctx.m = hit.m;
  return sendJson(req, res, 200, await hit.fn(ctx.m, ctx.q));
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end('bad request'); }

  if (pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (pathname.startsWith('/api/')) return handleApi(req, res, url, pathname);

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }

  if (pathname.startsWith('/media/')) {
    const rel = pathname.slice('/media/'.length);
    const kind = rel.split('/')[0];
    const full = cfg.MEDIA_KINDS.includes(kind) ? inside(cfg.MEDIA_DIR, rel) : null;
    if (full && !path.basename(full).startsWith('.') && serveFile(req, res, full, { cache: 'public, max-age=604800' })) return;
    res.writeHead(404, baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    return res.end('الملف غير موجود');
  }

  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (rel === 'admin' || rel === 'admin/') rel = 'admin.html';
  const full = inside(cfg.PUBLIC_DIR, rel);
  if (full && serveFile(req, res, full)) return;
  // مسارات الواجهة (SPA) بدون امتداد ترجع للصفحة الرئيسية
  if (!path.extname(rel) && serveFile(req, res, path.join(cfg.PUBLIC_DIR, 'index.html'))) return;
  res.writeHead(404, baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
  res.end('الصفحة غير موجودة');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    const status = e.status || 500;
    if (status >= 500) console.error('[خطأ]', req.method, req.url, e);
    if (res.headersSent) return res.destroy();
    sendJson(req, res, status, { error: status >= 500 ? 'حدث خطأ في الخادم' : e.message });
  });
});
server.requestTimeout = 0; // الرفع الكبير يحتاج وقتًا
server.headersTimeout = 30000;

const seeded = seed();
const boot = auth.init();
server.listen(cfg.PORT, cfg.HOST, () => {
  console.log('────────────────────────────────────────────');
  console.log(` أرشيف عبد الحليم حافظ يعمل على المنفذ ${cfg.PORT}`);
  console.log(` مجلد البيانات: ${cfg.DATA_DIR}`);
  if (seeded) console.log(' تم إنشاء البيانات الأولية (مرة واحدة فقط).');
  if (boot.source === 'generated') {
    console.log('');
    console.log(` كلمة مرور لوحة الإدارة (تظهر الآن مرة واحدة): ${boot.password}`);
    console.log(' يمكنك تغييرها من لوحة الإدارة > الإعدادات، أو ضبط ADMIN_PASSWORD.');
  }
  console.log(` لوحة الإدارة: http://localhost:${cfg.PORT}/admin`);
  console.log('────────────────────────────────────────────');
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
