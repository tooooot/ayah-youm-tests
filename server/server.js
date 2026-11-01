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
// مستويات الحفظ (يختارها الأب): آيات جديدة يومياً وحد المراجعات اليومية
const LEVELS = { 1: { perDay: 1, rev: 3, name: 'مبتدئ' }, 2: { perDay: 2, rev: 5, name: 'ثابت' }, 3: { perDay: 3, rev: 7, name: 'نشيط' }, 4: { perDay: 4, rev: 10, name: 'مجتهد' } };
const levelOf = k => (LEVELS[k.level] ? +k.level : 1);

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
    const d = new Date(Date.now() + 3 * 3600e3).toISOString();   // توقيت الرياض
    const f = path.join(BACKUPS, 'db-' + d.slice(0, 10) + '-' + d.slice(11, 13) + d.slice(14, 16) + '.json');
    fs.copyFileSync(DB_FILE, f);
    const all = fs.readdirSync(BACKUPS).filter(x => x.startsWith('db-')).sort();
    all.slice(0, Math.max(0, all.length - 60)).forEach(x => fs.unlinkSync(path.join(BACKUPS, x)));
  } catch (e) { console.error('backup failed', e); }
}
// لقطة قبل أي حذف (حساب/عائلة/ولد): تُحفظ 30 يوماً ثم تُمحى، وتُذكر في سياسة الخصوصية
function snapshot(reason) {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DB_FILE, path.join(BACKUPS, `pre-delete-${reason}-${ts}.json`));
    for (const x of fs.readdirSync(BACKUPS).filter(n => n.startsWith('pre-delete-'))) {
      const p = path.join(BACKUPS, x); if (Date.now() - fs.statSync(p).mtimeMs > 30 * 86400e3) fs.unlinkSync(p);
    }
  } catch (e) { console.error('snapshot failed', e); }
}

// ───────── نسخ التسجيل المؤقتة: الاحتفاظ الطويل على جهاز الولد؛ هنا فقط ما ينتظر تأكيد الأب (يُحذف بعد قراره أو بعد 72 ساعة) ─────────
const RELAY_DIR = path.join(DATA_DIR, 'relay'); fs.mkdirSync(RELAY_DIR, { recursive: true });
const RELAY_TTL = +process.env.RELAY_TTL_MS || 72 * 3600e3;
db.relays = db.relays || [];
const relayOf = id => db.relays.find(r => r.id === id);
function dropRelay(id) {
  const r = relayOf(id); if (!r) return;
  try { fs.unlinkSync(path.join(RELAY_DIR, r.id + '.bin')); } catch (_) {}
  db.relays = db.relays.filter(x => x !== r);
  for (const f of db.families) for (const k of f.kids) for (const s of k.log) { if (s.rec === id) delete s.rec; if (s.recs) { s.recs = s.recs.filter(x => x !== id); if (!s.recs.length) delete s.recs; } }
}
const dropKidRelays = k => { k.log.forEach(s => { [s.rec, ...(s.recs || [])].filter(Boolean).forEach(dropRelay); }); db.relays.filter(r => r.kidId === k.id).map(r => r.id).forEach(dropRelay); };   // وكل نسخة مرفوعة باسم الولد ولو لم تُربط بجلسة
function purgeRelays() { const now = Date.now(), old = db.relays.filter(r => now - r.t > RELAY_TTL).map(r => r.id); old.forEach(dropRelay); if (old.length) save(); }

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
  const lv = LEVELS[levelOf(kid)], todayNew = kid.log.filter(s => s.kind === 'new' && s.date === t && s.status !== 'rejected').length;
  const newToday = todayNew >= lv.perDay;   // أتمّ هدف اليوم من الآيات الجديدة
  const reviewedToday = kid.log.filter(s => s.kind === 'review' && s.date === t).length;
  const due = [...mem].map(([key, m]) => ({ key, due: addDays(m.last, INT[m.stage]) }))
    .filter(x => x.due <= t && mem.get(x.key).last !== t)
    .sort((a, b) => a.due < b.due ? -1 : 1);
  const reviews = due.slice(0, Math.max(0, lv.rev - reviewedToday)).map(x => unitOf(x.key));
  const next = queue(kid.start).find(u => !mem.has(u.key));
  const streakFrom = (floor) => {
    let d = newDays.has(t) ? t : addDays(t, -1), c = 0;
    while (newDays.has(d) && (!floor || d > floor)) { c++; d = addDays(d, -1); }
    return c;
  };
  const last14 = [];
  for (let i = 13; i >= 0; i--) last14.push(newDays.has(addDays(t, -i)));
  const weekNew = [...Array(7).keys()].filter(i => newDays.has(addDays(t, -i))).length;
  const pending = kid.log.filter(s => s.status === 'pending').map(s => { let d = {}; try { d = JSON.parse(s.diag || '{}'); } catch (_) {} return { sid: s.id, date: s.date, label: label(s.key), why: d.sr === false ? 'unsupported' : (d.err || 'declined'), hasRec: !!(s.rec && relayOf(s.rec)), nRec: (s.recs && s.recs.length) || (s.rec && relayOf(s.rec) ? 1 : 0) }; });
  return {
    id: kid.id, name: kid.name, age: kid.age, start: kid.start, startName: SURAH[kid.start].name,
    reward: kid.reward, rewardDays: kid.rewardDays, time: kid.time,
    streak: streakFrom(null), rewardProg: Math.min(streakFrom(kid.rewardSince || null), kid.rewardDays),
    level: levelOf(kid), levelName: lv.name, target: lv.perDay, newToday, memorized: mem.size, reviewsDue: due.length, last14, weekNew, pending,
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
      const okRel = x => x && relayOf(String(x)) && relayOf(String(x)).kidId === k.id;
      const recs = Array.isArray(body.recs) ? body.recs.slice(0, 12).filter(okRel).map(String) : [];   // تسميع على مقاطع: تسجيل لكل مقطع
      const rec = recs[0] || (okRel(body.rec) ? String(body.rec) : '');
      const diag = body.diag && typeof body.diag === 'object' ? JSON.stringify(body.diag).slice(0, 300) : '';   // لماذا لم يسمع التطبيق (تشخيص)
      if (body.kind === 'new') {
        // آية جديدة ثانية في اليوم مسموحة بطلب صريح (extra) وبحد 4 آيات جديدة يومياً
        const newCount = k.log.filter(x => x.kind === 'new' && x.date === t && x.status !== 'rejected').length;
        if ((st.newToday && !body.extra) || newCount >= 4 || !st.next || st.next.key !== body.key) return { err: [409, 'ليست آية اليوم'] };
        let status;
        if (body.method === 'voice') { if (score < st.threshold) return { err: [400, 'low'] }; status = 'ok'; }
        else if (body.method === 'pending') status = 'pending';
        else return { err: [400, 'طريقة غير صحيحة'] };
        k.log.push({ id: rid(6), date: t, key: body.key, kind: 'new', score, method: body.method, status, secs, ...(diag ? { diag } : {}), ...(rec && status === 'pending' ? { rec, ...(recs.length > 1 ? { recs } : {}) } : {}) });
      } else if (body.kind === 'review') {
        if (!st.reviews.some(u => u.key === body.key)) return { err: [409, 'ليست مراجعة اليوم'] };
        const fail = body.method === 'voice' && score < st.threshold;
        k.log.push({ id: rid(6), date: t, key: body.key, kind: 'review', score, method: body.method === 'voice' ? 'voice' : 'self', status: 'ok', fail, secs });
      } else return { err: [400, 'نوع غير صحيح'] };
  await save();
  return { ok: true };
}

var V2 = require('./v2').mount({ queue, unitOf, LEVELS, levelOf, db, save, rid, today, ORIGIN, send, readBody, kidState, cleanKid, submitResult, snapshot, relayOf, dropRelay, dropKidRelays, RELAY_DIR });
if (V2.migrate()) { try { fs.copyFileSync(DB_FILE, path.join(DATA_DIR, 'db.pre-v2.json')); } catch (_) {} save(); }
const authHandler = require('./auth').mount({ db, save, rid, today, ORIGIN, send, readBody, V2 });
const TEAM = process.env.APPLE_TEAM_PUB || '823299AJGN', BUNDLE = 'net.wardyat.thabat';
const PAGES = { '/app': 'app.html', '/auth/done': 'auth-done.html', '/privacy': 'privacy.html', '/delete': 'delete.html' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (p === '/healthz') return send(res, 200, { ok: true });
    // الروابط العميقة: iOS Universal Links وAndroid App Links (بصمة التوقيع من البيئة)
    if (p === '/.well-known/apple-app-site-association')
      return send(res, 200, { applinks: { details: [{ appIDs: [`${TEAM}.${BUNDLE}`], components: [{ '/': '/i/*' }] }] } });
    if (p === '/.well-known/assetlinks.json') {
      const fp = (process.env.ANDROID_SHA256 || '').split(',').map(x => x.trim()).filter(Boolean);
      return send(res, 200, [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: BUNDLE, sha256_cert_fingerprints: fp } }]);
    }
    if (PAGES[p]) return serveFile(req, res, path.join(SITE, PAGES[p]), 'no-store');
    if (await V2.handle(req, res, url, p) !== false) return;
    if (await authHandler(req, res, url, p) !== false) return;
    if (p.startsWith('/api/')) return send(res, 404, { error: 'غير موجود' });
    let m;
    if (/^\/i\/[\w-]+$/.test(p)) return serveFile(req, res, path.join(SITE, 'app.html'), 'no-store');   // دعوة ابن: التطبيق الجديد يعالجها
    if (p === '/manifest.webmanifest') return send(res, 200, { name: 'ثبات', short_name: 'ثبات', start_url: '/app', display: 'standalone', orientation: 'portrait', lang: 'ar', dir: 'rtl', background_color: '#0f3d33', theme_color: '#0f3d33', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, 'application/manifest+json');
    if (/^\/lesson\/[\w-]+$/.test(p)) return serveFile(req, res, path.join(SITE, 'kid.html'), 'no-store');   // شاشة الدرس بجلسة الحساب
    const rel = p === '/' ? '/index.html' : p;
    const file = path.normalize(path.join(SITE, rel));
    if (!file.startsWith(SITE + path.sep)) return send(res, 403, { error: 'no' });
    const cache = /^\/(audio|audio-fast|audio-sud|audio-ab|fonts)\//.test(rel) ? 'public, max-age=31536000, immutable' : 'no-cache';
    return serveFile(req, res, file, cache);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 400, { error: 'طلب غير صحيح' });
  }
});

backup(); setInterval(backup, 6 * 3600e3);
purgeRelays(); setInterval(purgeRelays, +process.env.RELAY_PURGE_MS || 3600e3);

if (require.main === module) server.listen(PORT, () => console.log('thabat on', PORT));
