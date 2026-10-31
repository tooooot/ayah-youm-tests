'use strict';
// الدخول بمزوّد هوية مزيّف، نقل العائلة القديمة، حساب المراجعين، والروابط العميقة — node --test tests/auth.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { startEnv } = require('./helpers.js');
let E;
before(async () => {
  const salt = 'abcd1234';
  E = await startEnv({ files: { 'reviewer.json': { user: 'rev@test.net', salt, hash: crypto.scryptSync('rev-pass-123', salt, 32).toString('hex') } } });
});
after(() => E && E.stop());

test('دخول بهوية ثم عودة بالهوية نفسها: الحساب نفسه وجلسة جديدة', async () => {
  const r1 = await E.signIn('returning'); const me1 = (await E.call(r1.session, 'GET', '/api/v2/me')).j;
  const r2 = await E.signIn('returning'); const me2 = (await E.call(r2.session, 'GET', '/api/v2/me')).j;
  assert.notEqual(r1.session, r2.session); assert.equal(me1.account.id, me2.account.id);
  const { cb } = await E.login('google', { sub: 'ticket-once' }); const t = E.ticket(cb);
  assert.equal((await E.redeem(t)).r.status, 200); assert.equal((await E.redeem(t)).r.status, 400, 'التذكرة تُستعمل مرة واحدة');
});

test('هوية جديدة تفتح حساباً بلا دور (لا رفض «غير مرتبط»)', async () => {
  const s = await E.signIn('brand-new');
  assert.equal(s.role, null);
  const me = await E.call(s.session, 'GET', '/api/v2/me'); assert.equal(me.j.onboarding, 'family');
});

test('تدفق التطبيق يعيد صفحة تفتح المخطط thabat://', async () => {
  const { cb } = await E.login('google', { app: true, sub: 'appuser' });
  assert.equal(cb.status, 200); assert.match(await cb.text(), /thabat:\/\/auth\?t=/);
});

test('رفض: nonce خاطئ، رمز خاطئ، state مجهول', async () => {
  assert.equal((await E.login('google', { code: 'badnonce', sub: 'n1' })).cb.status, 400);
  assert.equal((await E.login('google', { code: 'bad', sub: 'n2' })).cb.status, 400);
  assert.equal((await fetch(E.base + '/auth/callback/google?code=ok&state=nope', { redirect: 'manual' })).status, 400);
});

test('Apple: client_secret بتوقيع ES256 صحيح والدخول عبر form_post', async () => {
  const { cb } = await E.login('apple', { sub: 'apl' }); assert.equal(cb.status, 302);
  const [h, b, s] = E.getSecret().split('.'); const head = JSON.parse(Buffer.from(h, 'base64url')), body = JSON.parse(Buffer.from(b, 'base64url'));
  assert.equal(head.alg, 'ES256'); assert.equal(head.kid, 'KEY1234567'); assert.equal(body.iss, 'TEAM123456'); assert.equal(body.sub, 'net.test.svc');
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + b), { key: E.ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('الروابط العميقة والصفحات المطلوبة للمتجرين', async () => {
  const a = (await E.j('/.well-known/apple-app-site-association')).j;
  assert.deepEqual(a.applinks.details[0].appIDs, ['TEAMPUB123.net.wardyat.thabat']); assert.deepEqual(a.applinks.details[0].components, [{ '/': '/i/*' }], 'روابط الدعوة فقط');
  const l = (await E.j('/.well-known/assetlinks.json')).j; assert.equal(l[0].target.package_name, 'net.wardyat.thabat'); assert.deepEqual(l[0].target.sha256_cert_fingerprints, ['AA:BB']);
  for (const p of ['/app', '/privacy', '/delete', '/auth/done', '/i/abc', '/manifest.webmanifest']) assert.equal((await fetch(E.base + p)).status, 200, p);
  for (const p of ['/p/abc', '/k/abc', '/api/parent/x', '/api/kid/x', '/admin/new-family']) assert.notEqual((await fetch(E.base + p)).status, 200, 'أُزيل المسار القديم ' + p);
  const cfg = (await E.j('/api/auth/config')).j; assert.ok(cfg.google && cfg.apple && cfg.signup);
});

test('حساب المراجعين: دخول وصيّ وابن، رفض الخطأ، حدّ المحاولات', async () => {
  const post = body => E.call('', 'POST', '/api/auth/reviewer', body);
  assert.equal((await E.j('/api/auth/config')).j.reviewer, true);
  const g = await post({ user: 'REV@test.net', pass: 'rev-pass-123' }); assert.equal(g.r.status, 200); assert.equal(g.j.role, 'guardian');
  const fam = (await E.call(g.j.session, 'GET', '/api/v2/family')).j; assert.equal(fam.kids.length, 1); assert.equal(fam.kids[0].name, 'ولدي');
  const st = await post({ user: 'rev@test.net', pass: 'rev-pass-123', role: 'student' }); assert.equal(st.j.role, 'student');
  const me = (await E.call(st.j.session, 'GET', '/api/v2/me')).j; assert.equal(me.profiles.length, 1); assert.equal(me.onboarding, null);
  for (let i = 0; i < 5; i++) assert.equal((await post({ user: 'rev@test.net', pass: 'wrong' + i })).r.status, 401);
  assert.equal((await post({ user: 'rev@test.net', pass: 'rev-pass-123' })).r.status, 429);
});
