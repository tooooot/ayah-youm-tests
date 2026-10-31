'use strict';
// اختبار الحسابات والروابط العميقة بمزوّد هوية مزيّف (RSA محلي) — يعمل على GitHub: node --test tests/auth.test.js
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
    ANDROID_SHA256: 'AA:BB', APPLE_TEAM_PUB: 'TEAMPUB123' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch (_) {} await new Promise(r => setTimeout(r, 200)); }
});
after(() => { child && child.kill(); prov && prov.close(); });

const j = async (p, o = {}) => { const r = await fetch(base + p, o); return { r, j: await r.json().catch(() => ({})) }; };
async function newFamily() { const t = (await (await fetch(base + '/admin/new-family', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).text()).trim(); return t.split('/p/')[1]; }
async function login(prov_, { link, app, code = 'ok', sub = SUB } = {}) {
  SUB = sub; AUD = prov_ === 'google' ? 'gid' : 'net.test.svc'; ISS = prov_ === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com';
  const q = new URLSearchParams(); if (link) q.set('link', link); if (app) q.set('app', '1');
  const s = await fetch(base + `/auth/start/${prov_}?` + q, { redirect: 'manual' });
  assert.equal(s.status, 302); const loc = new URL(s.headers.get('location')); NONCE = loc.searchParams.get('nonce'); const state = loc.searchParams.get('state');
  assert.equal(loc.searchParams.get('client_id'), AUD);
  const cb = prov_ === 'apple'
    ? await fetch(base + '/auth/callback/apple', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, state }) })
    : await fetch(base + `/auth/callback/google?code=${code}&state=${state}`, { redirect: 'manual' });
  return { cb, state };
}
const redeem = t => j('/api/auth/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t }) });

test('ربط الحساب بالعائلة ثم الدخول به لاحقاً (Google)', async () => {
  const pt = await newFamily();
  const { cb } = await login('google', { link: pt });
  assert.equal(cb.status, 302);
  const t = new URL(cb.headers.get('location')).searchParams.get('t');
  assert.equal((await redeem(t)).j.parent, pt);
  assert.equal((await redeem(t)).r.status, 400, 'التذكرة تُستعمل مرة واحدة');
  const again = await login('google');
  assert.equal((await redeem(new URL(again.cb.headers.get('location')).searchParams.get('t'))).j.parent, pt);
  assert.equal((await j('/api/parent/' + pt)).j.linked, 1);
});

test('هوية غير مرتبطة ترفض (التسجيل مغلق)، وحساب مرتبط بعائلة لا يُربط بأخرى', async () => {
  const { cb } = await login('google', { sub: 'stranger' });
  assert.equal(cb.status, 403);
  const pt1 = await newFamily(), pt2 = await newFamily();
  assert.equal((await login('google', { link: pt1, sub: 'shared' })).cb.status, 302);
  assert.equal((await login('google', { link: pt2, sub: 'shared' })).cb.status, 409);
});

test('تدفق التطبيق يعيد صفحة تفتح المخطط ayahyoum://', async () => {
  const pt = await newFamily();
  const { cb } = await login('google', { link: pt, app: true, sub: 'appuser' });
  assert.equal(cb.status, 200); const h = await cb.text();
  assert.match(h, /ayahyoum:\/\/auth\?t=/);
});

test('رفض: nonce خاطئ، رمز خاطئ، state مستهلك أو مجهول', async () => {
  const pt = await newFamily();
  assert.equal((await login('google', { link: pt, code: 'badnonce', sub: 'n1' })).cb.status, 400);
  assert.equal((await login('google', { link: pt, code: 'bad', sub: 'n2' })).cb.status, 400);
  const r = await fetch(base + '/auth/callback/google?code=ok&state=nope', { redirect: 'manual' }); assert.equal(r.status, 400);
});

test('Apple: client_secret بتوقيع ES256 صحيح والدخول عبر form_post', async () => {
  const pt = await newFamily();
  const { cb } = await login('apple', { link: pt, sub: 'apl' });
  assert.equal(cb.status, 302);
  const [h, b, s] = lastSecret.split('.'); const head = JSON.parse(Buffer.from(h, 'base64url')), body = JSON.parse(Buffer.from(b, 'base64url'));
  assert.equal(head.alg, 'ES256'); assert.equal(head.kid, 'KEY1234567'); assert.equal(body.iss, 'TEAM123456'); assert.equal(body.sub, 'net.test.svc'); assert.equal(body.aud, 'https://appleid.apple.com');
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + b), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('حذف الحساب يمسح العائلة نهائياً ويشترط التأكيد', async () => {
  const pt = await newFamily();
  await j('/api/parent/' + pt + '/kids', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'اختبار', age: 9 }) });
  assert.equal((await j('/api/parent/' + pt + '/account', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'لا' }) })).r.status, 400);
  assert.equal((await j('/api/parent/' + pt + '/account', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'حذف' }) })).r.status, 200);
  assert.equal((await j('/api/parent/' + pt)).r.status, 404);
});

test('الروابط العميقة والصفحات المطلوبة للمتجرين', async () => {
  const a = (await j('/.well-known/apple-app-site-association')).j;
  assert.deepEqual(a.applinks.details[0].appIDs, ['TEAMPUB123.net.wardyat.ayahyoum']);
  assert.ok(JSON.stringify(a).includes('/k/*') && JSON.stringify(a).includes('/p/*'));
  const l = (await j('/.well-known/assetlinks.json')).j;
  assert.equal(l[0].target.package_name, 'net.wardyat.ayahyoum'); assert.deepEqual(l[0].target.sha256_cert_fingerprints, ['AA:BB']);
  for (const p of ['/app', '/privacy', '/delete', '/auth/done']) assert.equal((await fetch(base + p)).status, 200, p);
  const cfg = (await j('/api/auth/config')).j; assert.ok(cfg.google && cfg.apple && !cfg.signup);
});
