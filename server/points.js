'use strict';
// نقاط ثبات ومكافأة الشهر: اليوم الكامل = 100 نقطة تُقسَم على عادات الولد بأوزانها؛ سقف الدورة = 100 × الأيام الفعّالة؛
// قيمة النقطة = المبلغ ÷ السقف. أيام الراحة (يوم أسبوعي + أيام إجازة) لا تدخل السقف. التغيير يسري من اليوم (لقطة يومية).
const pad = n => String(n).padStart(2, '0');
const parse = d => new Date(d + 'T00:00:00Z');
const fmt = dt => dt.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return fmt(x); };
const MODES = ['none', 'allowance', 'bonus'];

function cleanPlan(b = {}) {
  const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  const w = {};
  for (const [k, v] of Object.entries(b.weights || {})) if (/^[a-z]{2,20}$/.test(k)) w[k] = num(v, 0, 10, 1);
  return {
    mode: MODES.includes(b.mode) ? b.mode : 'none',
    amount: Math.round(num(b.amount, 0, 100000, 0) * 100) / 100,
    cycleDay: Math.round(num(b.cycleDay, 1, 28, 1)),
    restWeekday: b.restWeekday === null || b.restWeekday === -1 ? -1 : Math.round(num(b.restWeekday, 0, 6, 5)),   // 0=الأحد … 5=الجمعة؛ -1 بلا يوم راحة
    extraRestDays: Math.round(num(b.extraRestDays, 0, 10, 2)),
    showMoney: !!b.showMoney,
    weights: w,
  };
}
function cycleOf(date, cycleDay = 1) {
  const [y, m, d] = date.split('-').map(Number), cd = Math.max(1, Math.min(28, cycleDay));
  let sy = y, sm = m; if (d < cd) { sm--; if (sm < 1) { sm = 12; sy--; } }
  let ey = sy, em = sm + 1; if (em > 12) { em = 1; ey++; }
  return { start: `${sy}-${pad(sm)}-${pad(cd)}`, end: addDays(`${ey}-${pad(em)}-${pad(cd)}`, -1) };
}
function daysOf(c) { const out = []; for (let d = c.start; d <= c.end; d = addDays(d, 1)) out.push(d); return out; }
const isRestWeekday = (d, plan) => plan.restWeekday >= 0 && parse(d).getUTCDay() === plan.restWeekday;
function activeDays(cycle, plan) {
  const days = daysOf(cycle), nonRest = days.filter(d => !isRestWeekday(d, plan)).length;
  return Math.max(1, nonRest - Math.min(plan.extraRestDays, Math.max(0, nonRest - 1)));
}
function weightsOf(habits, plan) {
  const raw = habits.map(h => (plan.weights && plan.weights[h] != null ? plan.weights[h] : 1));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(habits.map((h, i) => [h, raw[i] / sum]));
}
// doneFn(date, habit) → true فقط للمؤكَّد
function dayScore(date, habits, plan, doneFn) {
  const w = weightsOf(habits, plan);
  return Math.round(habits.reduce((s, h) => s + (doneFn(date, h) ? w[h] * 100 : 0), 0) * 100) / 100;
}
function snapToday(kid, today, plan) {
  const cyc = cycleOf(today, plan.cycleDay), maxPts = 100 * activeDays(cyc, plan);
  const v = plan.mode === 'none' || !maxPts ? 0 : plan.amount / maxPts;
  kid.snaps = kid.snaps || {};
  if (kid.snaps[today] === undefined) { kid.snaps[today] = v; return true; }
  if (kid.snapsCycleStart !== cyc.start) { kid.snapsCycleStart = cyc.start; }
  return false;
}
function summary(kid, today, habits, doneFn) {
  const plan = cleanPlan(kid.plan || {}), cyc = cycleOf(today, plan.cycleDay), act = activeDays(cyc, plan), maxPts = 100 * act;
  const vNow = plan.mode === 'none' || !maxPts ? 0 : plan.amount / maxPts, snaps = kid.snaps || {};
  let pts = 0, money = 0; const byDay = [];
  for (const d of daysOf(cyc)) {
    if (d > today) break;
    const s = dayScore(d, habits, plan, doneFn); pts += s; money += s * (snaps[d] !== undefined ? snaps[d] : vNow);
    byDay.push({ date: d, pts: s, rest: isRestWeekday(d, plan) });
  }
  const cap = plan.mode === 'none' ? 0 : plan.amount;
  return {
    mode: plan.mode, amount: plan.amount, cycleStart: cyc.start, cycleEnd: cyc.end, activeDays: act, maxPoints: maxPts,
    pointsToday: dayScore(today, habits, plan, doneFn), points: Math.min(Math.round(pts * 100) / 100, maxPts),
    pointValue: Math.round(vNow * 10000) / 10000, fullDayValue: Math.round(vNow * 100 * 100) / 100,
    earned: Math.min(Math.round(money * 100) / 100, cap), byDay, showMoney: plan.showMoney,
  };
}
// اقتراح تغيير مستوى الحفظ من سجل الجلسات (للأب فقط، والقرار له): ترقية بعد أسبوعين من الإتقان، وتخفيف عند فشل ثلاث مراجعات متتالية
function suggestLevel(k, lvl, t) {
  const since = k.levelSince || k.created || t, daysSince = Math.round((Date.parse(t) - Date.parse(since)) / 864e5);
  if (k.sugHidden && k.sugHidden >= t) return null;
  const rev = k.log.filter(s => s.kind === 'review' && s.status !== 'rejected' && s.date >= since);
  if (lvl > 1 && rev.length >= 3 && rev.slice(-3).every(s => s.fail)) return { dir: 'down', to: lvl - 1, why: 'فشل في آخر 3 مراجعات متتالية' };
  if (lvl < 4 && daysSince >= 14) {
    const from = addDays(t, -13), nw = k.log.filter(s => s.kind === 'new' && s.status === 'ok' && s.date >= from && s.date >= since);
    const days = new Set(nw.map(s => s.date)).size, avg = nw.length ? nw.reduce((a, s) => a + s.score, 0) / nw.length : 0;
    const r14 = rev.filter(s => s.date >= from), okRev = r14.length ? r14.filter(s => !s.fail).length / r14.length : 0;
    if (days >= 10 && avg >= .9 && r14.length >= 5 && okRev >= .85) return { dir: 'up', to: lvl + 1, why: `أتمّ ${days} أياماً من 14، بإتقان ${Math.round(avg * 100)}% ومراجعات ${Math.round(okRev * 100)}%` };
  }
  return null;
}

module.exports = { suggestLevel, cleanPlan, cycleOf, daysOf, activeDays, weightsOf, dayScore, snapToday, summary, addDays, isRestWeekday };
