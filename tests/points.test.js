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
