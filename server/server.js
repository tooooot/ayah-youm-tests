'use strict';
// ثبات (آية اليوم سابقاً) — خادم بلا اعتماديات. البيانات: ملف JSON واحد + نسخ يومي.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUPS = path.join(DATA_DIR, 'backups');
const PORT = +process.env.PORT || 3000;
const ORIGIN = process.env.ORIGIN || 'https://thabat.wardyat.net';

const Q = JSON.parse(fs.readFileSync(path.join(SITE, 'data', 'quran.json'), 'utf8'));
const SURAH = Object.fromEntries(Q.map(s => [s.n, s]));
const STARTS = Q.map(s => s.n);
const INT = [1, 3, 7, 30, 30]; // فواصل المراجعة بالأيام
const REVIEW_CAP = 3;

// ───────── التخزين ─────────
fs.mkdirSync(BACKUPS, { recursive: true });
let db = { families: [] };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { /* أول تشغيل */ }
let saving = Promise.resolve();
function save() {
  saving = saving.then(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }).catch(e => console.error('save failed', e));
  return saving;
}
function backup() {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    const f = path.join(BACKUPS, 'db-' + today() + '.json');
    fs.copyFileSync(DB_FILE, f);
    const all = fs.readdirSync(BACKUPS).filter(x => x.startsWith('db-')).sort();
    all.slice(0, Math.max(0, all.length - 30)).forEach(x => fs.unlinkSync(path.join(BACKUPS, x)));
  } catch (e) { console.error('backup failed', e); }
}

// ───────── أدوات ─────────
const rid = (n = 18) => crypto.randomBytes(n).toString('base64url');
function today() { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); } // توقيت الرياض
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
const pad = n => String(n).padStart(3, '0');

function queue(start) {
  const order = [];
  if (start >= 78) for (let n = start; n >= 78; n--) order.push(n); else order.push(start);
  const out = [];
  for (const n of order) SURAH[n].ayahs.forEach((a, i) => out.push({ n, i: i + 1, key: pad(n) + pad(i + 1) }));
  return out;
}
function unitOf(key) {
  const n = +key.slice(0, 3), i = +key.slice(3);
  const s = SURAH[n]; if (!s || !s.ayahs[i - 1]) return null;
  const a = s.ayahs[i - 1];
  return { key, n, i, name: s.name, t: a.t, c: a.c };
}
const thresholdFor = age => age <= 7 ? 0.7 : age <= 10 ? 0.8 : 0.9;
const repeatsFor = age => age <= 7 ? 12 : age <= 10 ? 10 : 8; // مرات حلقة الاستماع والترديد

function kidState(kid) {
  const t = today();
  const mem = new Map();
  for (const s of kid.log) {
    if (s.status === 'rejected') continue;
    if (s.kind === 'new') { if (!mem.has(s.key)) mem.set(s.key, { stage: 0, last: s.date, first: s.date }); }
    else if (mem.has(s.key)) {
      const m = mem.get(s.key);
      m.stage = s.fail ? 0 : Math.min(m.stage + 1, 4);
      m.last = s.date;
    }
  }
  const newDays = new Set(kid.log.filter(s => s.kind === 'new' && s.status !== 'rejected').map(s => s.date));
  const newToday = newDays.has(t);
  const reviewedToday = kid.log.filter(s => s.kind === 'review' && s.date === t).length;
  const due = [...mem].map(([key, m]) => ({ key, due: addDays(m.last, INT[m.stage]) }))
    .filter(x => x.due <= t && mem.get(x.key).last !== t)
    .sort((a, b) => a.due < b.due ? -1 : 1);
  const reviews = due.slice(0, Math.max(0, REVIEW_CAP - reviewedToday)).map(x => unitOf(x.key));
  const next = queue(kid.start).find(u => !mem.has(u.key));
  const streakFrom = (floor) => {
    let d = newDays.has(t) ? t : addDays(t, -1), c = 0;
    while (newDays.has(d) && (!floor || d > floor)) { c++; d = addDays(d, -1); }
    return c;
  };
  const last14 = [];
  for (let i = 13; i >= 0; i--) last14.push(newDays.has(addDays(t, -i)));
  const weekNew = [...Array(7).keys()].filter(i => newDays.has(addDays(t, -i))).length;
  const pending = kid.log.filter(s => s.status === 'pending').map(s => ({ sid: s.id, date: s.date, label: label(s.key) }));
  return {
    id: kid.id, name: kid.name, age: kid.age, start: kid.start, startName: SURAH[kid.start].name,
    reward: kid.reward, rewardDays: kid.rewardDays, time: kid.time,
    streak: streakFrom(null), rewardProg: Math.min(streakFrom(kid.rewardSince || null), kid.rewardDays),
    newToday, memorized: mem.size, reviewsDue: due.length, last14, weekNew, pending,
    next: next ? unitOf(next.key) : null, finished: !next,
    todayCount: kid.log.filter(x => x.kind === 'new' && x.date === t && x.status !== 'rejected').length,
    todayUnit: (() => { const l = kid.log.filter(x => x.kind === 'new' && x.date === t && x.status !== 'rejected').pop(); return l ? unitOf(l.key) : null; })(),
    avgNewSecs: (() => { const a = kid.log.filter(x => x.kind === 'new' && x.secs > 0).slice(-7).map(x => x.secs); return a.length ? Math.round(a.reduce((u, v) => u + v, 0) / a.length) : null; })(),
    avgReviewSecs: (() => { const a = kid.log.filter(x => x.kind === 'review' && x.secs > 0).slice(-7).map(x => x.secs); return a.length ? Math.round(a.reduce((u, v) => u + v, 0) / a.length) : null; })(),
    reviews, threshold: thresholdFor(kid.age), repeats: repeatsFor(kid.age),
    current: next ? label(next.key) : null,
  };
}
function label(key) { const u = unitOf(key); return u ? `${u.name} ${u.i}` : key; }

// ───────── HTTP ─────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const SEC = { 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SEC, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, no) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 20000) { no(new Error('big')); req.destroy(); } });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(e); } });
  });
}
function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'not found' });
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const h = { 'Content-Type': type, 'Cache-Control': cache, 'Accept-Ranges': 'bytes', ...SEC };
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      let a = m[1] === '' ? st.size - +m[2] : +m[1], b = m[2] === '' || m[1] === '' ? st.size - 1 : +m[2];
      b = Math.min(b, st.size - 1);
      if (isNaN(a) || a > b) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...h, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 });
      return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { ...h, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

const famByParent = t => db.families.find(f => f.parentToken === t);
// صفحة الأب: إن فُعِّل REQUIRE_LOGIN فالعائلة المرتبطة بحساب لا يكفي رابطها؛ يلزم جلسة صادرة من دخول Google/Apple
const REQUIRE_LOGIN = process.env.REQUIRE_LOGIN === '1';
const shaOf = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const parentOk = (f, req) => { if (!REQUIRE_LOGIN || !(f.guardians && f.guardians.length)) return true; const a = V2 && V2.acctOf(req); return !!a && a.role === 'guardian' && a.familyId === f.id; };
function kidByToken(t) {
  for (const f of db.families) { const k = f.kids.find(k => k.token === t); if (k) return { f, k }; }
  return null;
}
const cleanKid = b => {
  const age = Math.max(4, Math.min(18, +b.age || 8));
  const start = STARTS.includes(+b.start) ? +b.start : (age >= 10 ? 67 : 114);
  return {
    name: String(b.name || '').trim().slice(0, 30), age, start,
    reward: String(b.reward || '').trim().slice(0, 80),
    rewardDays: Math.max(3, Math.min(60, +b.rewardDays || 7)),
    time: /^\d{2}:\d{2}$/.test(b.time || '') ? b.time : '06:30',
    habits: Array.isArray(b.habits) && b.habits.length ? b.habits.filter(h => ['ayah', 'word'].includes(h)) : ['ayah'],
    plan: require('./points').cleanPlan(b.plan || {}),
  };
};

// تسجيل نتيجة درس: يُرجع {err:[code,msg]} أو {ok:true}
async function submitResult(k, body) {
      const st = kidState(k), t = today();
      const score = Math.max(0, Math.min(1, +body.score || 0));
      const secs = Math.max(0, Math.min(3600, Math.round(+body.secs || 0)));   // مدة الدرس الفعلية (ثوانٍ)
      if (body.kind === 'new') {
        // آية جديدة ثانية في اليوم مسموحة بطلب صريح (extra) وبحد 4 آيات جديدة يومياً
        const newCount = k.log.filter(x => x.kind === 'new' && x.date === t && x.status !== 'rejected').length;
        if ((st.newToday && !body.extra) || newCount >= 4 || !st.next || st.next.key !== body.key) return { err: [409, 'ليست آية اليوم'] };
        let status;
        if (body.method === 'voice') { if (score < st.threshold) return { err: [400, 'low'] }; status = 'ok'; }
        else if (body.method === 'pending') status = 'pending';
        else return { err: [400, 'طريقة غير صحيحة'] };
        k.log.push({ id: rid(6), date: t, key: body.key, kind: 'new', score, method: body.method, status, secs });
      } else if (body.kind === 'review') {
        if (!st.reviews.some(u => u.key === body.key)) return { err: [409, 'ليست مراجعة اليوم'] };
        const fail = body.method === 'voice' && score < st.threshold;
        k.log.push({ id: rid(6), date: t, key: body.key, kind: 'review', score, method: body.method === 'voice' ? 'voice' : 'self', status: 'ok', fail, secs });
      } else return { err: [400, 'نوع غير صحيح'] };
  await save();
  return { ok: true };
}

async function api(req, res, url) {
  const p = url.pathname.split('/').filter(Boolean); // api, parent|kid, token, ...
  const body = req.method === 'GET' ? {} : await readBody(req);

  if (p[1] === 'parent') {
    const f = famByParent(p[2]);
    if (!f) return send(res, 404, { error: 'رابط غير صحيح' });
    if (!parentOk(f, req)) return send(res, 401, { error: 'سجّل الدخول بحسابك', login: true });
    const rest = p.slice(3);
    if (req.method === 'GET' && rest.length === 0)
      return send(res, 200, { family: f.name, kids: f.kids.map(k => ({ ...kidState(k), token: k.token })), origin: ORIGIN, linked: (f.guardians || []).length });
    if (req.method === 'DELETE' && rest[0] === 'account') {   // حذف الحساب وكل بيانات العائلة نهائياً (شرط المتجرين)
      if (body.confirm !== 'حذف') return send(res, 400, { error: 'اكتب «حذف» للتأكيد' });
      for (const gid of f.guardians || []) { db.accounts = (db.accounts || []).filter(x => x.id !== gid); db.sessions = (db.sessions || []).filter(x => x.aid !== gid); }
      db.families = db.families.filter(x => x !== f); await save(); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && rest[0] === 'kids' && rest.length === 1) {
      const c = cleanKid(body); if (!c.name) return send(res, 400, { error: 'الاسم مطلوب' });
      if (f.kids.length >= 8) return send(res, 400, { error: 'حد الأولاد 8' });
      f.kids.push({ id: rid(6), token: rid(), ...c, rewardSince: null, log: [], created: today() });
      await save(); return send(res, 200, { ok: true });
    }
    const k = f.kids.find(x => x.id === rest[1]);
    if (rest[0] === 'kids' && k) {
      if (req.method === 'PUT') { Object.assign(k, cleanKid({ ...k, ...body })); await save(); return send(res, 200, { ok: true }); }
      if (req.method === 'DELETE') { f.kids = f.kids.filter(x => x !== k); await save(); return send(res, 200, { ok: true }); }
      if (req.method === 'POST' && rest[2] === 'reward-given') { k.rewardSince = today(); await save(); return send(res, 200, { ok: true }); }
      if (req.method === 'GET' && rest[2] === 'ics') {
        const [hh, mm] = k.time.split(':').map(Number);
        const d = new Date(Date.UTC(2026, 0, 1, hh - 3, mm));
        const z = d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//thabat//AR', 'BEGIN:VEVENT',
          `UID:${k.id}@ayah-youm`, `DTSTAMP:${z}`, `DTSTART:${z}`, 'RRULE:FREQ=DAILY', 'DURATION:PT10M',
          `SUMMARY:ثبات - ${k.name}`, `DESCRIPTION:${ORIGIN}/k/${k.token}`, `URL:${ORIGIN}/k/${k.token}`,
          'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:ثبات - ${k.name}`, 'TRIGGER:PT0S', 'END:VALARM',
          'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        return send(res, 200, ics, 'text/calendar; charset=utf-8', { 'Content-Disposition': 'attachment; filename="ayah.ics"' });
      }
    }
    if (req.method === 'POST' && rest[0] === 'confirm') {
      for (const kk of f.kids) {
        const s = kk.log.find(x => x.id === body.sid && x.status === 'pending');
        if (s) { s.status = body.ok ? 'ok' : 'rejected'; await save(); return send(res, 200, { ok: true }); }
      }
      return send(res, 404, { error: 'غير موجود' });
    }
    return send(res, 404, { error: 'غير موجود' });
  }

  if (p[1] === 'kid') {
    const hit = kidByToken(p[2]);
    if (!hit) return send(res, 404, { error: 'رابط غير صحيح' });
    const { k } = hit;
    if (req.method === 'GET') return send(res, 200, kidState(k));
    if (req.method === 'POST' && p[3] === 'result') {
      const r = await submitResult(k, body); if (r.err) return send(res, r.err[0], { error: r.err[1] });
      return send(res, 200, kidState(k));
    }
  }
  return send(res, 404, { error: 'غير موجود' });
}

var V2 = require('./v2').mount({ db, save, rid, today, ORIGIN, send, readBody, kidState, cleanKid, submitResult });
if (V2.migrate()) { try { fs.copyFileSync(DB_FILE, path.join(DATA_DIR, 'db.pre-v2.json')); } catch (_) {} save(); }
const authHandler = require('./auth').mount({ db, save, rid, today, ORIGIN, send, readBody, famByParent, shaOf, REQUIRE_LOGIN, V2 });
const TEAM = process.env.APPLE_TEAM_PUB || '823299AJGN', BUNDLE = 'net.wardyat.thabat';
const PAGES = { '/app': 'app.html', '/auth/done': 'auth-done.html', '/privacy': 'privacy.html', '/delete': 'delete.html' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (p === '/healthz') return send(res, 200, { ok: true });
    if (p === '/admin/new-family' && req.method === 'POST') {
      const ra = req.socket.remoteAddress;
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ra) || req.headers['x-forwarded-for']) return send(res, 403, { error: 'no' });
      const b = await readBody(req);
      const f = { id: rid(6), name: String(b.name || 'العائلة').slice(0, 40), parentToken: rid(), kids: [], created: today() };
      db.families.push(f); await save();
      return send(res, 200, `${ORIGIN}/p/${f.parentToken}\n`, 'text/plain; charset=utf-8');
    }
    // الروابط العميقة: iOS Universal Links وAndroid App Links (بصمة التوقيع من البيئة)
    if (p === '/.well-known/apple-app-site-association')
      return send(res, 200, { applinks: { details: [{ appIDs: [`${TEAM}.${BUNDLE}`], components: [{ '/': '/k/*' }, { '/': '/p/*' }] }] } });
    if (p === '/.well-known/assetlinks.json') {
      const fp = (process.env.ANDROID_SHA256 || '').split(',').map(x => x.trim()).filter(Boolean);
      return send(res, 200, [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: BUNDLE, sha256_cert_fingerprints: fp } }]);
    }
    if (PAGES[p]) return serveFile(req, res, path.join(SITE, PAGES[p]), 'no-store');
    if (await V2.handle(req, res, url, p) !== false) return;
    if (await authHandler(req, res, url, p) !== false) return;
    if (p.startsWith('/api/')) return await api(req, res, url);
    let m;
    if ((m = /^\/(p|k)\/([\w-]+)$/.exec(p))) return serveFile(req, res, path.join(SITE, m[1] === 'p' ? 'parent.html' : 'kid.html'), 'no-store');
    if ((m = /^\/manifest\/(p|k)\/([\w-]+)\.json$/.exec(p))) {
      const kid = m[1] === 'k' ? kidByToken(m[2]) : null, fam = m[1] === 'p' ? famByParent(m[2]) : null;
      if (!kid && !fam) return send(res, 404, { error: 'no' });
      return send(res, 200, {
        name: kid ? 'ثبات — ' + kid.k.name : 'ثبات — متابعة', short_name: kid ? kid.k.name : 'متابعة',
        start_url: `/${m[1]}/${m[2]}`, display: 'standalone', orientation: 'portrait', lang: 'ar', dir: 'rtl',
        background_color: '#0f3d33', theme_color: '#0f3d33',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
      }, 'application/manifest+json');
    }
    const rel = p === '/' ? '/index.html' : p;
    const file = path.normalize(path.join(SITE, rel));
    if (!file.startsWith(SITE + path.sep)) return send(res, 403, { error: 'no' });
    const cache = /^\/(audio|audio-fast|audio-sud|fonts)\//.test(rel) ? 'public, max-age=31536000, immutable' : 'no-cache';
    return serveFile(req, res, file, cache);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 400, { error: 'طلب غير صحيح' });
  }
});

backup(); setInterval(backup, 6 * 3600e3);

if (require.main === module) {
  if (process.argv[2] === 'new-family') {
    // أمر إداري: يمرّ عبر الخادم العامل (نقطة محلية) كي لا يكتب على الملف من وراء ذاكرته
    const body = JSON.stringify({ name: process.argv[3] || 'العائلة' });
    const r = http.request({ host: '127.0.0.1', port: PORT, path: '/admin/new-family', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      resp => { let b = ''; resp.on('data', c => b += c); resp.on('end', () => { console.log(b); process.exit(0); }); });
    r.on('error', e => { console.error(e.message); process.exit(1); });
    r.end(body);
  } else server.listen(PORT, () => console.log('ayah-youm on', PORT));
}
module.exports = { kidState, queue };
