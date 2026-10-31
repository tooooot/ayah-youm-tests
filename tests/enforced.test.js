'use strict';
// واجهة الأب القديمة مع REQUIRE_LOGIN=1: العائلة المرتبطة لا يكفي رابطها — node --test tests/enforced.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startEnv } = require('./helpers.js');
let E;
before(async () => { E = await startEnv({ env: { REQUIRE_LOGIN: '1' } }); });
after(() => E && E.stop());
const api = (pt, sess) => E.call(sess, 'GET', '/api/parent/' + pt);

test('عائلة بلا حساب تعمل بالرابط، وبعد النقل لا يكفي الرابط', async () => {
  const pt = await E.newFamily();
  assert.equal((await api(pt, '')).r.status, 200);
  const r = await E.signIn('legacy', { link: pt }); assert.equal(r.parent, pt);
  const no = await api(pt, ''); assert.equal(no.r.status, 401); assert.equal(no.j.login, true);
  assert.equal((await api(pt, 'wrong')).r.status, 401);
  assert.equal((await api(pt, r.session)).r.status, 200);
});

test('جلسات متعددة صالحة، وحساب الابن لا يفتح صفحة الأب', async () => {
  const pt = await E.newFamily();
  const a = await E.signIn('multi', { link: pt }), b = await E.signIn('multi');
  assert.notEqual(a.session, b.session);
  assert.equal((await api(pt, a.session)).r.status, 200); assert.equal((await api(pt, b.session)).r.status, 200);
  const other = await E.signIn('someone-else'); assert.equal((await api(pt, other.session)).r.status, 401);
});

test('ربط حساب آخر بعائلة مرتبطة يتطلب جلسة صحيحة', async () => {
  const pt = await E.newFamily(); const a = await E.signIn('owner1', { link: pt });
  assert.equal((await E.login('google', { link: pt, sub: 'second' })).cb.status, 401);
  assert.equal((await E.login('google', { link: pt, sub: 'second', sess: a.session })).cb.status, 302);
});
