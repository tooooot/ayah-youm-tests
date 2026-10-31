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

test('نقل عائلة قديمة (رابط الأب) إلى حساب ثم الدخول به لاحقاً', async () => {
  const pt = await E.newFamily();
  const { cb } = await E.login('google', { link: pt, sub: 'legacy' }); assert.equal(cb.status, 302);
  const t = E.ticket(cb); const r = (await E.redeem(t)).j;
  assert.equal(r.parent, pt); assert.equal(r.role, 'guardian'); assert.ok(r.session);
  assert.equal((await E.redeem(t)).r.status, 400, 'التذكرة تُستعمل مرة واحدة');
  const again = await E.signIn('legacy'); assert.equal(again.parent, pt); assert.notEqual(again.session, r.session);
  assert.equal((await E.j('/api/parent/' + pt)).j.linked, 1);
});

test('هوية جديدة تفتح حساباً بلا دور (لا رفض «غير مرتبط»)', async () => {
  const s = await E.signIn('brand-new');
  assert.equal(s.role, null);
  const me = await E.call(s.session, 'GET', '/api/v2/me'); assert.equal(me.j.onboarding, 'role');
});

test('عائلة مرتبطة بحساب لا تُنقل لحساب آخر', async () => {
  const pt1 = await E.newFamily(), pt2 = await E.newFamily();
  assert.equal((await E.login('google', { link: pt1, sub: 'shared' })).cb.status, 302);
  assert.equal((await E.login('google', { link: pt2, sub: 'shared' })).cb.status, 409);
});

test('تدفق التطبيق يعيد صفحة تفتح المخطط thabat://', async () => {
  const pt = await E.newFamily();
  const { cb } = await E.login('google', { link: pt, app: true, sub: 'appuser' });
  assert.equal(cb.status, 200); assert.match(await cb.text(), /thabat:\/\/auth\?t=/);
});

test('رفض: nonce خاطئ، رمز خاطئ، state مجهول', async () => {
  assert.equal((await E.login('google', { code: 'badnonce', sub: 'n1' })).cb.status, 400);
  assert.equal((await E.login('google', { code: 'bad', sub: 'n2' })).cb.status, 400);
  assert.equal((await fetch(E.base + '/auth/callback/google?code=ok&state=nope', { redirect: 'manual' })).status, 400);
});

test('Apple: client_secret بتوقيع ES256 صحيح والدخول عبر form_post', async () => {
  const pt = await E.newFamily();
  const { cb } = await E.login('apple', { link: pt, sub: 'apl' }); assert.equal(cb.status, 302);
  const [h, b, s] = E.getSecret().split('.'); const head = JSON.parse(Buffer.from(h, 'base64url')), body = JSON.parse(Buffer.from(b, 'base64url'));
  assert.equal(head.alg, 'ES256'); assert.equal(head.kid, 'KEY1234567'); assert.equal(body.iss, 'TEAM123456'); assert.equal(body.sub, 'net.test.svc');
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + b), { key: E.ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('حذف الحساب (القديم) يمسح العائلة ويشترط التأكيد', async () => {
  const pt = await E.newFamily();
  assert.equal((await E.call('', 'DELETE', '/api/parent/' + pt + '/account', { confirm: 'لا' })).r.status, 400);
  assert.equal((await E.call('', 'DELETE', '/api/parent/' + pt + '/account', { confirm: 'حذف' })).r.status, 200);
  assert.equal((await E.j('/api/parent/' + pt)).r.status, 404);
});

test('الروابط العميقة والصفحات المطلوبة للمتجرين', async () => {
  const a = (await E.j('/.well-known/apple-app-site-association')).j;
  assert.deepEqual(a.applinks.details[0].appIDs, ['TEAMPUB123.net.wardyat.thabat']);
  const l = (await E.j('/.well-known/assetlinks.json')).j; assert.equal(l[0].target.package_name, 'net.wardyat.thabat'); assert.deepEqual(l[0].target.sha256_cert_fingerprints, ['AA:BB']);
  for (const p of ['/app', '/privacy', '/delete', '/auth/done']) assert.equal((await fetch(E.base + p)).status, 200, p);
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
