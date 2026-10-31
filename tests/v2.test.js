'use strict';
// ثبات v2: أدوار، عائلة، ملفات، دعوات، جهاز مشترك، نقاط، ترحيل — node --test tests/v2.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { startEnv } = require('./helpers.js');
let E;
before(async () => {
  // قاعدة v1 قديمة لاختبار الترحيل: عائلة بحساب مالك وجلسة قديمة
  const sha = x => crypto.createHash('sha256').update(x).digest('hex');
  const v1 = { families: [{ id: 'f1', name: 'عائلة قديمة', parentToken: 'PT-OLD', owners: ['google:old-owner'], sessions: [sha('old-session')], created: '2026-10-30',
    kids: [{ id: 'k1', token: 'KT-OLD', name: 'زياد', age: 14, start: 67, reward: 'نزهة', rewardDays: 7, time: '06:30', rewardSince: null, created: '2026-10-30',
      log: [{ id: 'l1', date: '2026-10-31', key: '067001', kind: 'new', score: 1, method: 'voice', status: 'ok', secs: 100 }] }] }] };
  E = await startEnv({ files: { 'db.json': v1 } });
});
after(() => E && E.stop());
const G = async (sub) => { const s = await E.signIn(sub); await E.call(s.session, 'POST', '/api/v2/role', { role: 'guardian' }); return s.session; };

test('ترحيل v1: الجلسة القديمة تعمل كحساب وصيّ وعائلة زياد ومحفوظاته باقية', async () => {
  const me = (await E.call('old-session', 'GET', '/api/v2/me')).j; assert.equal(me.account.role, 'guardian'); assert.equal(me.family.name, 'عائلة قديمة');
  const fam = (await E.call('old-session', 'GET', '/api/v2/family')).j; assert.equal(fam.kids[0].name, 'زياد'); assert.equal(fam.kids[0].memorized, 1);
  const again = await E.signIn('old-owner'); const me2 = (await E.call(again.session, 'GET', '/api/v2/me')).j; assert.equal(me2.family.name, 'عائلة قديمة');
});

test('رحلة الأب: دور ← عائلة ← ولد بدعوة', async () => {
  const s = await E.signIn('dad1');
  assert.equal((await E.call(s.session, 'GET', '/api/v2/me')).j.onboarding, 'role');
  assert.equal((await E.call(s.session, 'POST', '/api/v2/family', { name: 'س' })).r.status, 403, 'بلا دور لا عائلة');
  await E.call(s.session, 'POST', '/api/v2/role', { role: 'guardian' });
  assert.equal((await E.call(s.session, 'POST', '/api/v2/role', { role: 'student' })).r.status, 409);
  assert.equal((await E.call(s.session, 'GET', '/api/v2/me')).j.onboarding, 'family');
  const f = await E.call(s.session, 'POST', '/api/v2/family', { name: 'آل أحمد' }); assert.equal(f.j.onboarding, 'kid');
  assert.equal((await E.call(s.session, 'POST', '/api/v2/family', { name: 'ثانية' })).r.status, 409);
  const k = await E.call(s.session, 'POST', '/api/v2/kids', { name: 'سارة', age: 9, habits: ['ayah', 'word', 'x'] });
  assert.equal(k.r.status, 200); assert.deepEqual(k.j.habits, ['ayah', 'word']); assert.equal(k.j.invite.status, 'invited'); assert.match(k.j.invite.url, /\/i\//);
  assert.equal((await E.call(s.session, 'GET', '/api/v2/me')).j.onboarding, null);
});

test('الابن يقبل الدعوة بحسابه ويرى ملفه فقط', async () => {
  const dad = await G('dad2'); await E.call(dad, 'POST', '/api/v2/family', { name: 'آل خالد' });
  const a = (await E.call(dad, 'POST', '/api/v2/kids', { name: 'أحمد', age: 10 })).j, b = (await E.call(dad, 'POST', '/api/v2/kids', { name: 'ليلى', age: 8 })).j;
  const tokA = a.invite.url.split('/i/')[1];
  assert.deepEqual((await E.j('/api/v2/invites/' + tokA)).j, { kid: 'أحمد', family: 'آل خالد', claimed: false });
  const kid = (await E.signIn('kid-ahmad')).session;
  assert.equal((await E.call(kid, 'GET', '/api/v2/me')).j.onboarding, 'role');
  const c = await E.call(kid, 'POST', '/api/v2/invites/' + tokA + '/claim'); assert.equal(c.r.status, 200);
  const me = (await E.call(kid, 'GET', '/api/v2/me')).j; assert.equal(me.account.role, 'student'); assert.equal(me.profiles[0].name, 'أحمد'); assert.equal(me.onboarding, null);
  assert.equal((await E.call(kid, 'GET', '/api/v2/kids/' + a.id + '/state')).r.status, 200);
  assert.equal((await E.call(kid, 'GET', '/api/v2/kids/' + b.id + '/state')).r.status, 404, 'لا يرى أخته');
  assert.equal((await E.call(kid, 'POST', '/api/v2/kids', { name: 'x' })).r.status, 403);
  assert.equal((await E.call(kid, 'GET', '/api/v2/family')).r.status, 403);
  assert.equal((await E.call(kid, 'PUT', '/api/v2/kids/' + a.id, { name: 'غيّرت' })).r.status, 403);
  const other = (await E.signIn('kid-other')).session; assert.equal((await E.call(other, 'POST', '/api/v2/invites/' + tokA + '/claim')).r.status, 409, 'دعوة لحساب واحد');
  assert.equal((await E.call(dad, 'POST', '/api/v2/invites/' + tokA + '/claim')).r.status, 403, 'الوصيّ لا يقبل دعوة ابن');
  assert.equal((await E.j('/api/v2/invites/nope')).r.status, 404);
});

test('جهاز مشترك: ولدان على حساب واحد وتقدّم كل منهما منفصل', async () => {
  const dad = await G('dad3'); await E.call(dad, 'POST', '/api/v2/family', { name: 'عائلة الجهاز' });
  const a = (await E.call(dad, 'POST', '/api/v2/kids', { name: 'ياسر', age: 11, start: 67 })).j, b = (await E.call(dad, 'POST', '/api/v2/kids', { name: 'هند', age: 9, start: 114 })).j;
  const dev = (await E.signIn('shared-tablet')).session;
  for (const k of [a, b]) assert.equal((await E.call(dev, 'POST', '/api/v2/invites/' + k.invite.url.split('/i/')[1] + '/claim')).r.status, 200);
  assert.equal((await E.call(dev, 'GET', '/api/v2/me')).j.profiles.length, 2);
  const sa = (await E.call(dev, 'GET', '/api/v2/kids/' + a.id + '/state')).j, sb = (await E.call(dev, 'GET', '/api/v2/kids/' + b.id + '/state')).j;
  const r = await E.call(dev, 'POST', '/api/v2/kids/' + a.id + '/result', { kind: 'new', key: sa.next.key, method: 'voice', score: 1, secs: 90 }); assert.equal(r.r.status, 200);
  assert.equal(r.j.memorized, 1);
  assert.equal((await E.call(dev, 'GET', '/api/v2/kids/' + b.id + '/state')).j.memorized, 0, 'هند لم تتأثر');
  assert.equal(sb.next.n, 114);
  // تسجيل على ولد خطأً ثم نقله
  const wrong = await E.call(dev, 'POST', '/api/v2/kids/' + b.id + '/result', { kind: 'new', key: sb.next.key, method: 'pending', score: 0, secs: 60 });
  assert.equal(wrong.j.pending.length, 1);
  const sid = wrong.j.pending[0].sid;
  assert.equal((await E.call(dev, 'POST', '/api/v2/kids/' + b.id + '/sessions/' + sid + '/move', { toKid: a.id })).r.status, 403, 'النقل للوصيّ فقط');
});

test('تأكيد الأب للتسميع: لا نقاط قبل التأكيد، ونقل الجلسة بين الأولاد', async () => {
  const dad = await G('dad4'); await E.call(dad, 'POST', '/api/v2/family', { name: 'تأكيد' });
  const a = (await E.call(dad, 'POST', '/api/v2/kids', { name: 'ب', age: 12, start: 114, plan: { mode: 'allowance', amount: 300, restWeekday: -1, extraRestDays: 0 } })).j;
  const b = (await E.call(dad, 'POST', '/api/v2/kids', { name: 'ج', age: 12, start: 114 })).j;
  const dev = (await E.signIn('dev4')).session; await E.call(dev, 'POST', '/api/v2/invites/' + a.invite.url.split('/i/')[1] + '/claim');
  const st = (await E.call(dev, 'GET', '/api/v2/kids/' + a.id + '/state')).j;
  const r = await E.call(dev, 'POST', '/api/v2/kids/' + a.id + '/result', { kind: 'new', key: st.next.key, method: 'pending', score: 0, secs: 50 });
  assert.equal(r.j.points.pointsToday, 0, 'غير مؤكد بلا نقاط');
  const sid = r.j.pending[0].sid;
  const mv = await E.call(dad, 'POST', '/api/v2/kids/' + a.id + '/sessions/' + sid + '/move', { toKid: b.id }); assert.equal(mv.r.status, 200);
  assert.equal((await E.call(dad, 'GET', '/api/v2/kids/' + a.id + '/state')).j.pending.length, 0);
  const bs = (await E.call(dad, 'GET', '/api/v2/kids/' + b.id + '/state')).j; assert.equal(bs.pending.length, 1);
  const cf = await E.call(dad, 'POST', '/api/v2/kids/' + b.id + '/confirm', { sid: bs.pending[0].sid, ok: true }); assert.equal(cf.r.status, 200);
  assert.equal(cf.j.points.pointsToday, 100);
});

test('النقاط والمكافأة عبر الواجهة: تحديد الخطة وقيمة اليوم الكامل', async () => {
  const dad = await G('dad5'); await E.call(dad, 'POST', '/api/v2/family', { name: 'نقاط' });
  const k = (await E.call(dad, 'POST', '/api/v2/kids', { name: 'ن', age: 12 })).j;
  assert.equal(k.points.mode, 'none'); assert.equal(k.points.fullDayValue, 0);
  const u = await E.call(dad, 'PUT', '/api/v2/kids/' + k.id, { plan: { mode: 'allowance', amount: 300, restWeekday: 5, extraRestDays: 2, cycleDay: 1, showMoney: true } });
  assert.equal(u.j.points.mode, 'allowance'); assert.equal(u.j.points.amount, 300); assert.ok(u.j.points.fullDayValue > 9 && u.j.points.fullDayValue < 16);
  assert.equal(u.j.points.maxPoints, u.j.points.activeDays * 100);
  assert.equal((await E.call(dad, 'PUT', '/api/v2/kids/' + k.id, { plan: { mode: 'غلط', amount: -5 } })).j.points.amount, 0);
});

test('تجديد الدعوة يلغي ارتباط الحساب القديم', async () => {
  const dad = await G('dad6'); await E.call(dad, 'POST', '/api/v2/family', { name: 'دعوة' });
  const k = (await E.call(dad, 'POST', '/api/v2/kids', { name: 'ك', age: 10 })).j; const tok = k.invite.url.split('/i/')[1];
  const kid = (await E.signIn('kid6')).session; await E.call(kid, 'POST', '/api/v2/invites/' + tok + '/claim');
  assert.equal((await E.call(dad, 'GET', '/api/v2/family')).j.kids[0].invite.status, 'claimed');
  const re = await E.call(dad, 'POST', '/api/v2/kids/' + k.id + '/invite'); assert.notEqual(re.j.url.split('/i/')[1], tok);
  assert.equal((await E.call(kid, 'GET', '/api/v2/kids/' + k.id + '/state')).r.status, 404, 'الحساب القديم فقد الوصول');
  assert.equal((await E.j('/api/v2/invites/' + tok)).r.status, 404, 'الرابط القديم ميت');
});

test('رمز وضع الأولاد (4 أرقام) للقفل المحلي', async () => {
  const dad = await G('dad7'); await E.call(dad, 'POST', '/api/v2/family', { name: 'رمز' });
  assert.equal((await E.call(dad, 'PUT', '/api/v2/family/pin', { pin: '12' })).r.status, 400);
  assert.equal((await E.call(dad, 'PUT', '/api/v2/family/pin', { pin: '4821' })).r.status, 200);
  assert.equal((await E.call(dad, 'POST', '/api/v2/family/pin/verify', { pin: '4821' })).j.ok, true);
  assert.equal((await E.call(dad, 'POST', '/api/v2/family/pin/verify', { pin: '0000' })).j.ok, false);
  assert.equal((await E.call(dad, 'GET', '/api/v2/family')).j.family.hasPin, true);
});

test('حذف الحساب: الوصيّ يحذف العائلة، والابن يفك ارتباطه فقط', async () => {
  const dad = await G('dad8'); await E.call(dad, 'POST', '/api/v2/family', { name: 'حذف' });
  const k = (await E.call(dad, 'POST', '/api/v2/kids', { name: 'ح', age: 10 })).j;
  const kid = (await E.signIn('kid8')).session; await E.call(kid, 'POST', '/api/v2/invites/' + k.invite.url.split('/i/')[1] + '/claim');
  assert.equal((await E.call(kid, 'DELETE', '/api/v2/account', { confirm: 'لا' })).r.status, 400);
  assert.equal((await E.call(kid, 'DELETE', '/api/v2/account', { confirm: 'حذف' })).r.status, 200);
  assert.equal((await E.call(kid, 'GET', '/api/v2/me')).r.status, 401, 'الجلسة انتهت');
  assert.equal((await E.call(dad, 'GET', '/api/v2/family')).j.kids[0].invite.status, 'invited', 'الدعوة عادت متاحة');
  assert.equal((await E.call(dad, 'DELETE', '/api/v2/account', { confirm: 'حذف' })).r.status, 200);
  assert.equal((await E.call(dad, 'GET', '/api/v2/me')).r.status, 401);
  const bk = require('fs').readdirSync(require('path').join(E.dir, 'backups')).filter(n => n.startsWith('pre-delete-'));
  assert.ok(bk.length >= 2, 'لقطة احتياطية قبل كل حذف (تُمحى بعد 30 يوماً)');
});

test('بلا جلسة: كل نداءات v2 ترفض ما عدا معاينة الدعوة', async () => {
  for (const [m, p] of [['GET', '/api/v2/me'], ['GET', '/api/v2/family'], ['POST', '/api/v2/kids']]) assert.equal((await E.call('', m, p, m === 'POST' ? {} : undefined)).r.status, 401);
});
