'use strict';
// بيئة اختبار: مزوّد هوية مزيّف (RSA) + خادم ثبات بمجلد بيانات مؤقت
const assert = require('node:assert');
const http = require('http'), crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const b64u = x => Buffer.from(x).toString('base64url');

async function startEnv({ env = {}, files = {} } = {}) {
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwkPub = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const S = { sub: 'u1', nonce: '', aud: '', iss: '', lastSecret: '' };
  const idToken = (over = {}) => {
    const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
    const b = b64u(JSON.stringify({ iss: S.iss, aud: S.aud, sub: S.sub, nonce: S.nonce, exp: Math.floor(Date.now() / 1000) + 300, ...over }));
    return h + '.' + b + '.' + b64u(crypto.sign('sha256', Buffer.from(h + '.' + b), rsa.privateKey));
  };
  const prov = http.createServer((req, res) => {
    if (req.url === '/jwks') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ keys: [jwkPub] })); }
    if (req.url === '/token') {
      let b = ''; req.on('data', c => b += c); req.on('end', () => {
        const q = new URLSearchParams(b); S.lastSecret = q.get('client_secret'); res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(q.get('code') === 'bad' ? { error: 'invalid_grant' } : { id_token: idToken(q.get('code') === 'badnonce' ? { nonce: 'x' } : {}) }));
      }); return;
    }
    res.statusCode = 404; res.end();
  });
  const pp = await new Promise(r => prov.listen(0, '127.0.0.1', () => r(prov.address().port))), P = 'http://127.0.0.1:' + pp;
  const sp = await new Promise(r => { const s = http.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
  const base = 'http://127.0.0.1:' + sp, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayah-'));
  for (const [n, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), typeof v === 'string' ? v : JSON.stringify(v));
  const p8 = ec.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const child = spawn('node', [path.join(ROOT, 'server/server.js')], { env: { ...process.env, PORT: sp, DATA_DIR: dir, ORIGIN: base,
    GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec', GOOGLE_TOKEN_URL: P + '/token', GOOGLE_JWKS_URL: P + '/jwks', GOOGLE_AUTH_URL: P + '/auth',
    APPLE_SERVICE_ID: 'net.test.svc', APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_KEY_P8: p8, APPLE_TOKEN_URL: P + '/token', APPLE_JWKS_URL: P + '/jwks', APPLE_AUTH_URL: P + '/auth',
    ANDROID_SHA256: 'AA:BB', APPLE_TEAM_PUB: 'TEAMPUB123', ...env }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch (_) {} await new Promise(r => setTimeout(r, 200)); }

  const j = async (p, o = {}) => { const r = await fetch(base + p, o); return { r, j: await r.json().catch(() => ({})) }; };
  const jj = { 'content-type': 'application/json' };
  // طلب مع جلسة
  const call = (sess, method, p, body) => j(p, { method, headers: { ...jj, ...(sess ? { 'x-session': sess } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  async function login(prov_, { link, app, code = 'ok', sub = S.sub, sess } = {}) {
    S.sub = sub; S.aud = prov_ === 'google' ? 'gid' : 'net.test.svc'; S.iss = prov_ === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com';
    const q = new URLSearchParams(); if (sess) q.set('s', sess); if (link) q.set('link', link); if (app) q.set('app', '1');
    const s = await fetch(base + `/auth/start/${prov_}?` + q, { redirect: 'manual' });
    assert.equal(s.status, 302); const loc = new URL(s.headers.get('location')); S.nonce = loc.searchParams.get('nonce'); const state = loc.searchParams.get('state');
    assert.equal(loc.searchParams.get('client_id'), S.aud);
    const cb = prov_ === 'apple'
      ? await fetch(base + '/auth/callback/apple', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, state }) })
      : await fetch(base + `/auth/callback/google?code=${code}&state=${state}`, { redirect: 'manual' });
    return { cb, state };
  }
  const ticket = cb => new URL(cb.headers.get('location')).searchParams.get('t');
  const redeem = t => j('/api/auth/redeem', { method: 'POST', headers: jj, body: JSON.stringify({ t }) });
  // دخول كامل بهوية → جلسة
  const signIn = async (sub, opts = {}) => { const { cb } = await login('google', { sub, ...opts }); assert.equal(cb.status, 302, 'login ' + sub); const r = await redeem(ticket(cb)); assert.equal(r.r.status, 200); return r.j; };
  const newFamily = async () => (await (await fetch(base + '/admin/new-family', { method: 'POST', body: '{}', headers: jj })).text()).trim().split('/p/')[1];
  const stop = () => { child.kill(); prov.close(); };
  return { base, dir, S, j, call, login, ticket, redeem, signIn, newFamily, stop, ec, getSecret: () => S.lastSecret };
}
module.exports = { startEnv, ROOT };
