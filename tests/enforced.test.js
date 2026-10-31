'use strict';
// وضع إلزام الدخول (REQUIRE_LOGIN=1 + ALLOW_SIGNUP=1): جلسات الأب — node --test tests/enforced.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http'), crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwkPub = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const b64u = x => Buffer.from(x).toString('base64url');
let SUB = 'u1', NONCE = '', AUD = '', ISS = '', lastSecret = '';
function idToken(over = {}) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const b = b64u(JSON.stringify({ iss: ISS, aud: AUD, sub: SUB, nonce: NONCE, exp: Math.floor(Date.now() / 1000) + 300, ...over }));
  return h + '.' + b + '.' + b64u(crypto.sign('sha256', Buffer.from(h + '.' + b), rsa.privateKey));
}
let prov, srv, base, dir, child;
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(s.address().port)));

before(async () => {
  prov = http.createServer((req, res) => {
    if (req.url === '/jwks') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ keys: [jwkPub] })); }
    if (req.url === '/token') {
      let b = ''; req.on('data', c => b += c); req.on('end', () => {
        const q = new URLSearchParams(b); lastSecret = q.get('client_secret');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(q.get('code') === 'bad' ? { error: 'invalid_grant' } : { id_token: idToken(q.get('code') === 'badnonce' ? { nonce: 'x' } : {}) }));
      });
      return;
    }
    res.statusCode = 404; res.end();
  });
  const pp = await listen(prov), P = 'http://127.0.0.1:' + pp;
  const sp = await new Promise(r => { const s = http.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
  base = 'http://127.0.0.1:' + sp; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayah-'));
  const p8 = ec.privateKey.export({ type: 'pkcs8', format: 'pem' });
  child = spawn('node', [path.join(ROOT, 'server/server.js')], { env: { ...process.env, PORT: sp, DATA_DIR: dir, ORIGIN: base,
    GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec', GOOGLE_TOKEN_URL: P + '/token', GOOGLE_JWKS_URL: P + '/jwks', GOOGLE_AUTH_URL: P + '/auth',
    APPLE_SERVICE_ID: 'net.test.svc', APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_KEY_P8: p8, APPLE_TOKEN_URL: P + '/token', APPLE_JWKS_URL: P + '/jwks', APPLE_AUTH_URL: P + '/auth',
    ANDROID_SHA256: 'AA:BB', APPLE_TEAM_PUB: 'TEAMPUB123', REQUIRE_LOGIN: '1', ALLOW_SIGNUP: '1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch (_) {} await new Promise(r => setTimeout(r, 200)); }
});
after(() => { child && child.kill(); prov && prov.close(); });

const j = async (p, o = {}) => { const r = await fetch(base + p, o); return { r, j: await r.json().catch(() => ({})) }; };
async function newFamily() { const t = (await (await fetch(base + '/admin/new-family', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).text()).trim(); return t.split('/p/')[1]; }
async function login(prov_, { link, app, code = 'ok', sub = SUB, sess } = {}) {
  SUB = sub; AUD = prov_ === 'google' ? 'gid' : 'net.test.svc'; ISS = prov_ === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com';
  const q = new URLSearchParams(); if (sess) q.set('s', sess); if (link) q.set('link', link); if (app) q.set('app', '1');
  const s = await fetch(base + `/auth/start/${prov_}?` + q, { redirect: 'manual' });
  assert.equal(s.status, 302); const loc = new URL(s.headers.get('location')); NONCE = loc.searchParams.get('nonce'); const state = loc.searchParams.get('state');
  assert.equal(loc.searchParams.get('client_id'), AUD);
  const cb = prov_ === 'apple'
    ? await fetch(base + '/auth/callback/apple', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, state }) })
    : await fetch(base + `/auth/callback/google?code=${code}&state=${state}`, { redirect: 'manual' });
  return { cb, state };
}
const redeem = t => j('/api/auth/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t }) });


const tok = cb => new URL(cb.headers.get('location')).searchParams.get('t');
const api = (pt, sess, o = {}) => j('/api/parent/' + pt, { ...o, headers: { 'content-type': 'application/json', ...(sess ? { 'x-session': sess } : {}) } });

test('التسجيل المفتوح: أول دخول ينشئ عائلة ويعطي جلسة؛ بلا جلسة 401', async () => {
  const { cb } = await login('google', { sub: 'newbie' });
  assert.equal(cb.status, 302);
  const r = (await redeem(tok(cb))).j; assert.ok(r.parent && r.session);
  const no = await api(r.parent, ''); assert.equal(no.r.status, 401); assert.equal(no.j.login, true);
  assert.equal((await api(r.parent, 'wrong')).r.status, 401);
  assert.equal((await api(r.parent, r.session)).r.status, 200);
});

test('عائلة قديمة بلا حساب تعمل بالرابط، وبعد الربط لا يكفي الرابط', async () => {
  const pt = await newFamily();
  assert.equal((await api(pt, '')).r.status, 200);
  const { cb } = await login('google', { link: pt, sub: 'legacy' }); assert.equal(cb.status, 302);
  assert.equal((await api(pt, '')).r.status, 401);
  const r = (await redeem(tok(cb))).j; assert.equal(r.parent, pt);
  assert.equal((await api(pt, r.session)).r.status, 200);
  // إضافة حساب آخر لعائلة مرتبطة تتطلب جلسة صحيحة
  assert.equal((await login('google', { link: pt, sub: 'second' })).cb.status, 401);
  const ok = await login('google', { link: pt, sub: 'second', sess: r.session }); assert.equal(ok.cb.status, 302);
  const again = (await redeem(tok((await login('google', { sub: 'second' })).cb))).j; assert.equal(again.parent, pt);
});

test('جلسات متعددة تبقى صالحة، والحذف بالجلسة فقط', async () => {
  const a = await login('google', { sub: 'multi' }); const s1 = (await redeem(tok(a.cb))).j;
  const b = await login('google', { sub: 'multi' }); const s2 = (await redeem(tok(b.cb))).j;
  assert.equal(s1.parent, s2.parent); assert.notEqual(s1.session, s2.session);
  assert.equal((await api(s1.parent, s1.session)).r.status, 200); assert.equal((await api(s1.parent, s2.session)).r.status, 200);
  const del = (sess) => j('/api/parent/' + s1.parent + '/account', { method: 'DELETE', headers: { 'content-type': 'application/json', ...(sess ? { 'x-session': sess } : {}) }, body: JSON.stringify({ confirm: 'حذف' }) });
  assert.equal((await del('')).r.status, 401);
  assert.equal((await del(s2.session)).r.status, 200);
  assert.equal((await api(s1.parent, s1.session)).r.status, 404);
});
