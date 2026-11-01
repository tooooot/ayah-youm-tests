'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../server/points.js');
const none = () => false;

test('حدود الدورة بحسب يوم الصرف', () => {
  assert.deepEqual(P.cycleOf('2026-11-15', 1), { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(P.cycleOf('2026-11-15', 27), { start: '2026-10-27', end: '2026-11-26' });
  assert.deepEqual(P.cycleOf('2026-11-27', 27), { start: '2026-11-27', end: '2026-12-26' });
  assert.deepEqual(P.cycleOf('2027-01-05', 27), { start: '2026-12-27', end: '2027-01-26' });
});
test('الأيام الفعّالة: نوفمبر 2026 فيه 4 جمعات ويومان إجازة', () => {
  const plan = P.cleanPlan({ mode: 'allowance', amount: 300, restWeekday: 5, extraRestDays: 2 });
  const c = P.cycleOf('2026-11-10', 1);
  assert.equal(P.daysOf(c).filter(d => P.isRestWeekday(d, plan)).length, 4);
  assert.equal(P.activeDays(c, plan), 30 - 4 - 2);
  const s = P.summary({ plan }, '2026-11-10', ['ayah'], none);
  assert.equal(s.maxPoints, 2400); assert.equal(s.pointValue, 0.125); assert.equal(s.fullDayValue, 12.5);
});
test('الالتزام التام يبلغ السقف تماماً ولا يتجاوزه', () => {
  const plan = P.cleanPlan({ mode: 'bonus', amount: 120, restWeekday: -1, extraRestDays: 0 });
  const kid = { plan }; const all = () => true;
  P.snapToday(kid, '2026-11-01', plan);
  const s = P.summary(kid, '2026-11-30', ['ayah'], all);   // لا لقطات لباقي الأيام ⇒ القيمة الحالية
  assert.equal(s.points, 3000); assert.equal(s.earned, 120);
});
test('أوزان العادات تُطبَّع: إضافة عادة لا تغيّر سقف اليوم', () => {
  const plan = P.cleanPlan({ mode: 'allowance', amount: 100, weights: { ayah: 3, word: 1 } });
  const w = P.weightsOf(['ayah', 'word'], plan); assert.equal(w.ayah, 0.75); assert.equal(w.word, 0.25);
  assert.equal(P.dayScore('2026-11-02', ['ayah', 'word'], plan, (d, h) => h === 'ayah'), 75);
  assert.equal(P.dayScore('2026-11-02', ['ayah', 'word'], plan, () => true), 100);
  assert.equal(P.dayScore('2026-11-02', ['ayah'], P.cleanPlan({}), () => true), 100);
});
test('تغيير المبلغ في منتصف الدورة لا يعدّل ما كُسب (لقطة يومية)', () => {
  const kid = { plan: P.cleanPlan({ mode: 'allowance', amount: 300, restWeekday: -1, extraRestDays: 0, cycleDay: 1 }) };
  const done = d => d <= '2026-11-10';
  for (let d = 1; d <= 10; d++) P.snapToday(kid, `2026-11-${String(d).padStart(2, '0')}`, kid.plan);
  const before = P.summary(kid, '2026-11-10', ['ayah'], done).earned;      // 10 أيام × 10 ريال
  assert.equal(before, 100);
  kid.plan = P.cleanPlan({ mode: 'allowance', amount: 600, restWeekday: -1, extraRestDays: 0 });
  assert.equal(P.summary(kid, '2026-11-10', ['ayah'], done).earned, 100, 'ما كُسب لا يتغير');
  P.snapToday(kid, '2026-11-11', kid.plan);
  assert.equal(P.summary(kid, '2026-11-11', ['ayah'], d => d <= '2026-11-11').earned, 120, 'اليوم الجديد بالقيمة الجديدة 20');
});
test('بلا مكافأة: النقاط تُحسب والمبلغ صفر', () => {
  const s = P.summary({}, '2026-11-10', ['ayah'], d => d === '2026-11-10');
  assert.equal(s.pointsToday, 100); assert.equal(s.earned, 0); assert.equal(s.mode, 'none');
});

test('دمج نتائج التعرّف: لا تكرار حين تكون كل نتيجة تراكمية (أندرويد)', () => {
  const { joinResults } = require('../site/common.js');
  const R = (...xs) => xs.map(x => [{ transcript: x }]);
  assert.equal(joinResults(R('بسم', 'بسم الله', 'بسم الله الرحمن')), 'بسم الله الرحمن');
  assert.equal(joinResults(R('كلمة', 'كلمة', 'كلمة', 'كلمة', 'كلمة')), 'كلمة');
  assert.equal(joinResults(R('قل أعوذ', 'برب الناس')), 'قل أعوذ برب الناس', 'نتائج نهائية منفصلة تُضمّ');
  assert.equal(joinResults(R('قل', 'قل أعوذ', 'قل أعوذ برب'), 0), 'قل أعوذ برب');
  assert.equal(joinResults([]), ''); assert.equal(joinResults(null), '');
  assert.equal(joinResults([[{ transcript: 'أ ب' }, { transcript: 'أ ج' }], [{ transcript: 'أ ب ج' }, { transcript: 'أ ج د' }]], 1), 'أ ج د');
});

test('اقتراح المستوى: ترقية بعد أسبوعين من الإتقان وتخفيف بعد ثلاث مراجعات فاشلة وإخفاء', () => {
  const T = '2026-11-01', d = n => P.addDays(T, -n), log = [];
  for (let i = 13; i >= 0; i--) { log.push({ date: d(i), kind: 'new', score: .95, status: 'ok' }); if (i < 10) log.push({ date: d(i), kind: 'review', score: .9, status: 'ok', fail: false }); }
  const k = { log, levelSince: d(20) };
  const up = P.suggestLevel(k, 3, T); assert.equal(up.dir, 'up'); assert.equal(up.to, 4);
  assert.equal(P.suggestLevel(k, 4, T), null, 'لا ترقية فوق الأعلى');
  assert.equal(P.suggestLevel({ ...k, levelSince: d(5) }, 3, T), null, 'لم يمضِ أسبوعان على المستوى');
  assert.equal(P.suggestLevel({ log: log.filter(s => !(s.kind === 'new' && [3, 4, 5, 6, 7].some(n => s.date === d(n)))), levelSince: d(20) }, 3, T), null, 'أيام ناقصة');
  const bad = { ...k, log: [...log, ...[0, 1, 2].map(() => ({ date: T, kind: 'review', score: .2, status: 'ok', fail: true }))] };
  const dn = P.suggestLevel(bad, 3, T); assert.equal(dn.dir, 'down'); assert.equal(dn.to, 2);
  assert.equal(P.suggestLevel(bad, 1, T), null, 'لا تخفيف تحت الأدنى');
  assert.equal(P.suggestLevel({ ...bad, sugHidden: P.addDays(T, 3) }, 3, T), null, 'مخفي أسبوعاً');
});
