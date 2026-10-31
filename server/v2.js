'use strict';
// واجهة ثبات v2: حسابات (Google/Apple) وأدوار وعائلة وملفات أولاد ودعوات وجلسات ونقاط. كل نداء يحتاج ترويسة X-Session.
const crypto = require('crypto');
const P = require('./points.js');

const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const HABITS = ['ayah', 'word'];

function mount(ctx) {
  const { db, save, rid, today, ORIGIN, send, readBody, kidState, cleanKid, submitResult, snapshot } = ctx;
  db.accounts = db.accounts || []; db.sessions = db.sessions || [];

  // ───── ترحيل v1 → v2 (عائلات owners/sessions القديمة إلى حسابات) ─────
  function migrate() {
    if (db.v >= 2) return false;
    for (const f of db.families) {
      f.guardians = f.guardians || [];
      for (const ident of f.owners || []) {
        let a = db.accounts.find(x => x.ident === ident);
        if (!a) { a = { id: rid(6), ident, role: 'guardian', familyId: f.id, profiles: [], created: today() }; db.accounts.push(a); }
        if (!f.guardians.includes(a.id)) f.guardians.push(a.id);
      }
      const first = db.accounts.find(a => a.id === f.guardians[0]);
      if (first) for (const h of f.sessions || []) db.sessions.push({ h, aid: first.id, t: today() });
      delete f.sessions;
      for (const k of f.kids) { k.habits = k.habits || ['ayah']; k.plan = P.cleanPlan(k.plan || {}); }
    }
    db.v = 2; return true;
  }

  const acctById = id => db.accounts.find(a => a.id === id);
  function ensureAccount(ident) {
    let a = db.accounts.find(x => x.ident === ident);
    if (!a) { a = { id: rid(6), ident, role: null, familyId: null, profiles: [], created: today() }; db.accounts.push(a); }
    return a;
  }
  function newSession(a) {
    const raw = rid(24), mine = db.sessions.filter(s => s.aid === a.id);
    if (mine.length >= 10) db.sessions.splice(db.sessions.indexOf(mine[0]), 1);
    db.sessions.push({ h: sha(raw), aid: a.id, t: today() }); return raw;
  }
  const acctOf = req => { const h = req.headers['x-session']; if (!h) return null; const s = db.sessions.find(x => x.h === sha(h)); return s ? acctById(s.aid) : null; };
  const famOf = a => a && a.familyId ? db.families.find(f => f.id === a.familyId) : null;
  // الملف: الوصيّ يصل لكل أولاد عائلته؛ الابن لملفاته فقط
  function kidFor(a, kidId) {
    if (a.role === 'guardian') { const f = famOf(a); const k = f && f.kids.find(x => x.id === kidId); return k ? { f, k, as: 'guardian' } : null; }
    if (a.role === 'student' && a.profiles.some(p => p.kidId === kidId)) {
      for (const f of db.families) { const k = f.kids.find(x => x.id === kidId); if (k) return { f, k, as: 'student' }; }
    }
    return null;
  }
  const habitDone = k => (date, h) => {
    if (h === 'ayah') return k.log.some(s => s.kind === 'new' && s.date === date && s.status === 'ok');
    return (k.hlog || []).some(e => e.date === date && e.habit === h && e.confirmed);
  };
  const inviteStatus = k => !k.invite ? 'none' : k.invite.claimedBy ? 'claimed' : 'invited';
  async function kidView(k, withInvite) {
    const habits = (k.habits && k.habits.length ? k.habits : ['ayah']);
    if (P.snapToday(k, today(), P.cleanPlan(k.plan || {}))) await save();
    const plan = P.cleanPlan(k.plan || {}), done = habitDone(k), recent = [];
    for (let i = 6; i >= 0; i--) { const d = P.addDays(today(), -i); recent.push({ date: d, pts: P.dayScore(d, habits, plan, done) }); }   // آخر 7 أيام بغضّ النظر عن حدود الدورة
    const v = { ...kidState(k), habits, plan, points: P.summary(k, today(), habits, done), recent };
    if (withInvite) { v.invite = { status: inviteStatus(k), url: k.invite ? `${ORIGIN}/i/${k.invite.token}` : null }; }
    return v;
  }
  const famBrief = f => ({ id: f.id, name: f.name, hasPin: !!f.pinHash });
  const onboarding = a => {
    if (!a.role) return 'family';   // لا اختيار دور: من يدخل بلا دعوة يبدأ رحلة الأب/الأم
    if (a.role === 'guardian') { const f = famOf(a); return !f ? 'family' : f.kids.length ? null : 'kid'; }
    return a.profiles.length ? null : 'invite';
  };
  const cleanHabits = h => { const x = [...new Set((Array.isArray(h) ? h : ['ayah']).filter(y => HABITS.includes(y)))]; return x.length ? x : ['ayah']; };
  const newInvite = () => ({ token: rid(), created: today(), claimedBy: null, claimedAt: null });
  const unlink = k => { if (k.invite && k.invite.claimedBy) { const a = acctById(k.invite.claimedBy); if (a) a.profiles = a.profiles.filter(p => p.kidId !== k.id); } };
  const killSessionsOf = a => { db.sessions = db.sessions.filter(s => s.aid !== a.id); };

  async function handle(req, res, url, p) {
    if (!p.startsWith('/api/v2/')) return false;
    const seg = p.split('/').filter(Boolean).slice(2), m = req.method;   // api, v2, ...
    // عام: معاينة دعوة لصفحة الهبوط
    if (seg[0] === 'invites' && seg[1] && m === 'GET') {
      for (const f of db.families) { const k = f.kids.find(x => x.invite && x.invite.token === seg[1]); if (k) return send(res, 200, { kid: k.name, family: f.name, claimed: !!k.invite.claimedBy }); }
      return send(res, 404, { error: 'دعوة غير صحيحة أو أُلغيت' });
    }
    const a = acctOf(req); if (!a) return send(res, 401, { error: 'سجّل الدخول', login: true });
    const body = m === 'GET' || m === 'DELETE' && !(req.headers['content-length'] > 0) ? {} : await readBody(req);
    const bad = (c, e) => send(res, c, { error: e });

    if (seg[0] === 'logout' && m === 'POST') { const h = sha(req.headers['x-session']); db.sessions = db.sessions.filter(s => s.h !== h); await save(); return send(res, 200, { ok: true }); }
    if (seg[0] === 'me' && m === 'GET') {
      const f = famOf(a);
      const profiles = a.profiles.map(pf => { for (const fm of db.families) { const k = fm.kids.find(x => x.id === pf.kidId); if (k) return { kidId: k.id, name: k.name, family: fm.name }; } return null; }).filter(Boolean);
      return send(res, 200, { account: { id: a.id, role: a.role }, family: f ? famBrief(f) : null, profiles, onboarding: onboarding(a) });
    }
    if (seg[0] === 'role' && m === 'POST') {
      if (a.role) return bad(409, 'الدور محدد مسبقاً');
      if (!['guardian', 'student'].includes(body.role)) return bad(400, 'دور غير صحيح');
      a.role = body.role; await save(); return send(res, 200, { ok: true, onboarding: onboarding(a) });
    }
    if (seg[0] === 'invites' && seg[1] && seg[2] === 'claim' && m === 'POST') {
      if (a.role === 'guardian') return bad(403, 'هذا الحساب حساب أب/أم؛ افتح الدعوة بحساب الابن');
      for (const f of db.families) {
        const k = f.kids.find(x => x.invite && x.invite.token === seg[1]); if (!k) continue;
        if (k.invite.claimedBy && k.invite.claimedBy !== a.id) return bad(409, 'استُخدمت هذه الدعوة بحساب آخر');
        a.role = 'student'; k.invite.claimedBy = a.id; k.invite.claimedAt = today();
        if (!a.profiles.some(pf => pf.kidId === k.id)) a.profiles.push({ kidId: k.id });
        await save(); return send(res, 200, { ok: true, kidId: k.id, name: k.name });
      }
      return bad(404, 'دعوة غير صحيحة أو أُلغيت');
    }
    // ───── الوصيّ ─────
    if (seg[0] === 'family') {
      if (m === 'POST' && !seg[1] && !a.role) { a.role = 'guardian'; }   // إنشاء العائلة يجعل الحساب حساب أب/أم
      if (a.role !== 'guardian') return bad(403, 'للأب أو الأم فقط');
      if (m === 'POST' && !seg[1]) {
        if (famOf(a)) return bad(409, 'لديك عائلة');
        const f = { id: rid(6), name: String(body.name || 'عائلتي').trim().slice(0, 40) || 'عائلتي', parentToken: rid(), kids: [], created: today(), guardians: [a.id] };
        db.families.push(f); a.familyId = f.id; await save(); return send(res, 200, { family: famBrief(f), onboarding: onboarding(a) });
      }
      const f = famOf(a); if (!f) return bad(404, 'أنشئ عائلتك أولاً');
      if (m === 'GET' && !seg[1]) return send(res, 200, { family: famBrief(f), guardians: f.guardians.length, kids: await Promise.all(f.kids.map(k => kidView(k, true))) });
      if (m === 'PUT' && !seg[1]) { if (body.name) f.name = String(body.name).trim().slice(0, 40) || f.name; await save(); return send(res, 200, { family: famBrief(f) }); }
      if (seg[1] === 'pin' && m === 'PUT') { if (!/^\d{4}$/.test(String(body.pin || ''))) return bad(400, 'الرمز 4 أرقام'); f.pinHash = sha(f.id + ':' + body.pin); await save(); return send(res, 200, { ok: true }); }
      if (seg[1] === 'pin' && seg[2] === 'verify' && m === 'POST') return send(res, 200, { ok: !!f.pinHash && f.pinHash === sha(f.id + ':' + String(body.pin || '')) });
    }
    if (seg[0] === 'kids' && !seg[1] && m === 'POST') {
      if (a.role !== 'guardian' || !famOf(a)) return bad(403, 'للأب أو الأم فقط');
      const f = famOf(a), c = cleanKid(body); if (!c.name) return bad(400, 'الاسم مطلوب'); if (f.kids.length >= 8) return bad(400, 'حد الأولاد 8');
      const k = { id: rid(6), token: rid(), ...c, rewardSince: null, log: [], created: today(), habits: cleanHabits(body.habits), plan: P.cleanPlan(body.plan || {}), invite: newInvite() };
      f.kids.push(k); await save(); return send(res, 200, await kidView(k, true));
    }
    if (seg[0] === 'kids' && seg[1]) {
      const hit = kidFor(a, seg[1]); if (!hit) return bad(404, 'غير موجود');
      const { f, k, as } = hit, guard = as === 'guardian', sub = seg[2];
      if (!sub && m === 'GET') return send(res, 200, await kidView(k, guard));
      if (sub === 'state' && m === 'GET') return send(res, 200, await kidView(k, guard));
      if (sub === 'result' && m === 'POST') { const r = await submitResult(k, body); return r.err ? bad(r.err[0], r.err[1]) : send(res, 200, await kidView(k, guard)); }
      if (sub === 'month' && m === 'GET') return send(res, 200, (await kidView(k, false)).points);
      if (!guard) return bad(403, 'للأب أو الأم فقط');
      if (!sub && m === 'PUT') {
        const c = cleanKid({ ...k, ...body }); Object.assign(k, c);
        if (body.habits) k.habits = cleanHabits(body.habits);
        if (body.plan) { k.plan = P.cleanPlan({ ...(k.plan || {}), ...body.plan }); P.snapToday(k, today(), k.plan); k.snaps[today()] = (() => { const cy = P.cycleOf(today(), k.plan.cycleDay), mx = 100 * P.activeDays(cy, k.plan); return k.plan.mode === 'none' || !mx ? 0 : k.plan.amount / mx; })(); }
        await save(); return send(res, 200, await kidView(k, true));
      }
      if (!sub && m === 'DELETE') { snapshot('kid'); unlink(k); f.kids = f.kids.filter(x => x !== k); await save(); return send(res, 200, { ok: true }); }
      if (sub === 'invite' && m === 'POST') { unlink(k); k.invite = newInvite(); await save(); return send(res, 200, { status: 'invited', url: `${ORIGIN}/i/${k.invite.token}` }); }
      if (sub === 'confirm' && m === 'POST') {
        const s = k.log.find(x => x.id === body.sid && x.status === 'pending'); if (!s) return bad(404, 'غير موجود');
        s.status = body.ok ? 'ok' : 'rejected'; await save(); return send(res, 200, await kidView(k, true));
      }
      if (sub === 'sessions' && seg[3] && seg[4] === 'move' && m === 'POST') {   // نقل جلسة إلى ولد آخر
        const to = f.kids.find(x => x.id === body.toKid); const i = k.log.findIndex(x => x.id === seg[3]);
        if (!to || to === k || i < 0) return bad(404, 'غير موجود');
        to.log.push(...k.log.splice(i, 1)); to.log.sort((x, y) => (x.date < y.date ? -1 : 1)); await save(); return send(res, 200, { ok: true });
      }
    }
    if (seg[0] === 'account' && m === 'DELETE') {
      if (body.confirm !== 'حذف') return bad(400, 'اكتب «حذف» للتأكيد');
      snapshot(a.role === 'guardian' ? 'family' : 'student');
      if (a.role === 'guardian') {
        const f = famOf(a);
        if (f) { for (const k of f.kids) unlink(k); for (const gid of f.guardians) { const g = acctById(gid); if (g) { killSessionsOf(g); db.accounts = db.accounts.filter(x => x !== g); } } db.families = db.families.filter(x => x !== f); }
        else { killSessionsOf(a); db.accounts = db.accounts.filter(x => x !== a); }
      } else {
        for (const pf of a.profiles) for (const f of db.families) { const k = f.kids.find(x => x.id === pf.kidId); if (k && k.invite && k.invite.claimedBy === a.id) { k.invite.claimedBy = null; k.invite.claimedAt = null; } }
        killSessionsOf(a); db.accounts = db.accounts.filter(x => x !== a);
      }
      await save(); return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'غير موجود' });
  }
  return { handle, migrate, ensureAccount, newSession, acctOf, acctById, famOf, sha };
}
module.exports = { mount, sha };
