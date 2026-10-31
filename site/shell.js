'use strict';
// ثبات — هيكل التطبيق: فتح حساب/دخول ← دور ← (أب: عائلة، أولاد، دعوات | ابن: يومي) بشريط سفلي ثابت. التوجيه بـ #/…
const root = $('#root');
const ls = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }, del: k => { try { localStorage.removeItem(k); } catch (_) {} } };
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) {} } };
let ME = null, FAM = null, KS = null, CFG = { google: false, apple: false, reviewer: false }, QURAN = null;

// ───── أدوات واجهة ─────
const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10', users: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M16 3.2a3.5 3.5 0 010 6.6',
  habits: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', user: 'M20 21v-1a5 5 0 00-5-5H9a5 5 0 00-5 5v1M12 11a4 4 0 100-8 4 4 0 000 8z',
  today: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  back: 'M9 6l6 6-6 6', gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14 3h-4l-.6 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1c.6.5 1.3.9 2 1.2L10 21h4l.6-2.7c.7-.3 1.4-.7 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
};
const svg = n => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[n]); s.append(p); return s; };
const initial = n => (String(n || '؟').trim()[0] || '؟');
const toast = t => { const d = el('div', { class: 'toast' }, t); document.body.append(d); setTimeout(() => d.remove(), 2200); };
const errMsg = e => (e && e.message) || 'حدث خطأ، حاول مرة أخرى';
const skeleton = (n = 3) => el('div', {}, Array.from({ length: n }, () => el('div', { class: 'sk' })));
const empty = (ico, title, text, cta) => el('div', { class: 'empty' }, el('div', { class: 'big' }, ico), el('h2', {}, title), el('p', {}, text), cta || '');
const errorBox = (retry) => el('div', { class: 'empty' }, el('div', { class: 'big' }, '⚠️'), el('h2', {}, 'تعذّر التحميل'), el('p', {}, 'تحقّق من الاتصال ثم أعد المحاولة.'), el('button', { class: 'btn sm', onclick: retry }, 'إعادة المحاولة'));
const go = h => { location.hash = '#/' + h; };
const here = () => location.hash.replace(/^#\/?/, '');
function mount(nodes, { plain = false } = {}) { root.replaceChildren(el('div', { class: 'screen' + (plain ? ' plain' : '') }, nodes)); window.scrollTo(0, 0); }
function mountRaw(...nodes) { root.replaceChildren(...nodes); window.scrollTo(0, 0); }
function header(title, { back, actions } = {}) {
  const b = back ? el('button', { class: 'ib', 'aria-label': 'رجوع', onclick: () => (typeof back === 'string' ? go(back) : history.back()) }, svg('back')) : null;
  return el('div', { class: 'hdr' }, b, el('h1', {}, title), actions || '');
}
function tabbar(tabs, active) {
  return el('div', { class: 'tabbar' }, el('nav', {}, tabs.map(([id, label, ico]) => el('button', { class: 'tab' + (id === active ? ' on' : ''), onclick: () => go(id) }, svg(ico), label))));
}
function sheet(content) {
  const bg = el('div', { class: 'sheet-bg', onclick: e => { if (e.target === bg) bg.remove(); } }, el('div', { class: 'sheet' }, content));
  document.body.append(bg); return () => bg.remove();
}
const confirmTyped = async (msg, word = 'حذف') => confirm(msg) && prompt('للتأكيد اكتب كلمة: ' + word) === word;

// ───── دخول وفتح حساب ─────
const startAuth = (prov, mode) => { ls.set('ayah_mode', mode); nativeBrowser('/auth/start/' + prov + (window.NATIVE ? '?app=1' : '')); };
function authSheet(mode) {
  let close;
  const inv = ls.get('ayah_invite');
  const box = el('div', {}, el('h2', {}, mode === 'signup' ? 'فتح حساب جديد' : 'تسجيل الدخول'),
    el('p', { class: 'mute' }, inv ? 'ادخل بحسابك ليرتبط بملفك.' : 'اختر الحساب الذي ستدخل به دائماً.'),
    CFG.google ? el('button', { class: 'btn google', onclick: () => startAuth('google', mode) }, 'المتابعة بـ Google') : null,
    CFG.apple ? el('button', { class: 'btn apple', onclick: () => startAuth('apple', mode) }, 'المتابعة بـ Apple') : null,
    !CFG.google && !CFG.apple ? el('p', { class: 'note' }, 'الدخول بالحساب سيُفعَّل قريباً.') : null,
    CFG.reviewer ? reviewerBox() : null);
  close = sheet(box); return close;
}
function reviewerBox() {   // دخول مراجعي المتاجر (حساب موحّد لكل تطبيقاتنا)
  const u = el('input', { placeholder: 'اسم المستخدم', autocomplete: 'username', dir: 'ltr' }), p = el('input', { type: 'password', placeholder: 'كلمة المرور', autocomplete: 'current-password', dir: 'ltr' }), m = el('div', { class: 'mute' });
  let role = 'guardian';
  const seg = el('div', { class: 'seg' }, [['guardian', 'أب/أم'], ['student', 'ابن']].map(([r, t]) => el('button', { class: r === role ? 'on' : '', onclick: e => { role = r; [...seg.children].forEach(c => c.classList.toggle('on', c === e.target)); } }, t)));
  const f = el('div', { hidden: true }, seg, u, p, el('button', { class: 'btn ghost', onclick: async () => {
    try { const r = await api('auth/reviewer', 'POST', { user: u.value, pass: p.value, role }); ls.set('ayah_session', r.session); location.href = '/app'; } catch (e) { m.textContent = errMsg(e); }
  } }, 'دخول'), m);
  return el('div', { style: 'text-align:center;margin-top:14px' }, el('button', { class: 'link', onclick: () => { f.hidden = !f.hidden; } }, 'دخول المراجعين (للمتاجر)'), f);
}
function welcome() {
  const inv = ls.get('ayah_invite');
  mountRaw(el('div', { class: 'welcome' },
    el('img', { class: 'logo', src: '/icon-192.png', alt: '' }), el('h1', { style: 'font-size:2rem' }, 'ثبات'),
    el('p', {}, inv ? 'دُعيتَ للانضمام إلى ملفك. افتح حساباً أو ادخل لتبدأ.' : 'عادات يومية صغيرة تثبت: آية، وكلمة، وقراءة.'),
    el('button', { class: 'btn gold', onclick: () => authSheet('signup') }, 'فتح حساب'),
    el('button', { class: 'btn ghost', onclick: () => authSheet('login') }, 'تسجيل الدخول'),
    el('p', { style: 'font-size:.82rem;margin-top:18px' }, el('a', { href: '/privacy', style: 'color:#cfe3da' }, 'سياسة الخصوصية'))));
}

// ───── الدور والإعداد الأول ─────
function noAccountNotice() {   // دخول بهوية ليس لها حساب بعد: نوجّهه لفتح حساب لا نرفضه
  mount([header('لا يوجد حساب بهذه الهوية'), el('div', { class: 'card' }, el('p', {}, 'هذه أول مرة تدخل بها. هل تريد فتح حساب جديد؟'),
    el('button', { class: 'btn', onclick: () => { ls.del('ayah_mode'); roleScreen(); } }, 'نعم، افتح حساباً'),
    el('button', { class: 'btn ghost', onclick: logout }, 'رجوع'))], { plain: true });
}
function roleScreen() {
  const pick = async role => { try { await api('v2/role', 'POST', { role }); await refreshMe(); route(); } catch (e) { toast(errMsg(e)); } };
  mount([el('div', { class: 'steps' }, el('i', { class: 'on' }), el('i'), el('i')), el('h1', {}, 'من أنت؟'), el('p', { class: 'mute' }, 'نُجهّز التطبيق بحسب دورك.'),
    el('div', { class: 'card tap cardrole', onclick: () => pick('guardian') }, el('div', { class: 'ico' }, '👨‍👩‍👧'), el('div', {}, el('h2', {}, 'أنا أب / أم'), el('div', { class: 'mute' }, 'أضيف أولادي وأتابع تقدمهم وأضع المكافأة'))),
    el('div', { class: 'card tap cardrole', onclick: () => pick('student') }, el('div', { class: 'ico' }, '🧒'), el('div', {}, el('h2', {}, 'أنا ابن'), el('div', { class: 'mute' }, 'أدخل بدعوة من أبي وأتعلم كل يوم'))),
    el('button', { class: 'link', onclick: logout }, 'تسجيل الخروج')], { plain: true });
}
function familySetup() {
  const name = el('input', { value: 'عائلتي', maxlength: 40, 'aria-label': 'اسم العائلة' });
  mount([el('div', { class: 'steps' }, el('i', { class: 'on' }), el('i', { class: 'on' }), el('i')), el('h1', {}, 'سمِّ عائلتك'), el('p', { class: 'mute' }, 'مثل: آل أحمد. يظهر لأولادك في التطبيق.'),
    el('div', { class: 'card' }, name, el('button', { class: 'btn', onclick: async () => { try { await api('v2/family', 'POST', { name: name.value }); await refreshMe(); route(); } catch (e) { toast(errMsg(e)); } } }, 'متابعة')),
    el('button', { class: 'link', onclick: logout }, 'تسجيل الخروج')], { plain: true });
}
function waitInvite() {
  mount([el('div', { class: 'steps' }, el('i', { class: 'on' }), el('i'), el('i')), empty('✉️', 'ننتظر دعوة أبيك', 'اطلب من أبيك أن يرسل لك رابط الدعوة من التطبيق، ثم افتحه من هذا الجهاز وسيرتبط حسابك بملفك تلقائياً.',
    el('button', { class: 'btn ghost', onclick: logout }, 'تسجيل الخروج'))], { plain: true });
}
async function handleInvite(token) {   // الابن فتح رابط دعوة
  let info; try { info = await api('v2/invites/' + token); } catch (e) { ls.del('ayah_invite'); mount([empty('🔗', 'الدعوة غير صالحة', 'قد تكون أُلغيت أو استُخدمت. اطلب من أبيك دعوة جديدة.', el('button', { class: 'btn', onclick: () => { location.href = '/app'; } }, 'متابعة'))], { plain: true }); return; }
  if (!ls.get('ayah_session')) { welcome(); return; }
  if (ME && ME.account.role === 'guardian') { ls.del('ayah_invite'); mount([empty('👨‍👩‍👧', 'هذا حساب أب/أم', 'افتح الدعوة من حساب الابن أو من جهازه.', el('button', { class: 'btn', onclick: () => { location.href = '/app'; } }, 'رجوع'))], { plain: true }); return; }
  mount([el('div', { class: 'hero' }, el('div', { style: 'font-size:2.4rem' }, '🌱'), el('h1', {}, `أهلاً ${info.kid}`), el('p', { class: 'mute' }, `دعتك عائلة «${info.family}» لتبدأ عاداتك اليومية.`)),
    el('button', { class: 'btn gold', onclick: async () => {
      try { await api('v2/invites/' + token + '/claim', 'POST', {}); ls.del('ayah_invite'); await refreshMe(); route(); } catch (e) { toast(errMsg(e)); }
    } }, 'ابدأ'), el('button', { class: 'link', onclick: () => { ls.del('ayah_invite'); logout(); } }, 'ليس أنا')], { plain: true });
}
async function refreshMe() { ME = await api('v2/me'); return ME; }
async function logout() { try { await api('v2/logout', 'POST', {}); } catch (_) {} ['ayah_session', 'ayah_parent', 'ayah_kid', 'ayah_mode'].forEach(ls.del); location.href = '/app'; }

// ───── الأب ─────
const GTABS = [['home', 'الرئيسية', 'home'], ['kids', 'الأولاد', 'users'], ['habits', 'العادات', 'habits'], ['progress', 'التقدّم', 'chart'], ['profile', 'البروفايل', 'user']];
async function loadFam(force) { if (!FAM || force) FAM = await api('v2/family'); return FAM; }
function guardianShell(tab, title, build, { back, actions } = {}) {
  mount([header(title, { back, actions }), skeleton(3)]);
  loadFam(true).then(f => { const body = build(f); root.replaceChildren(el('div', { class: 'screen' }, header(title, { back, actions }), body), tabbar(GTABS, tab)); })
    .catch(e => { if (e.status === 401) return welcome(); root.replaceChildren(el('div', { class: 'screen' }, header(title), errorBox(() => guardianShell(tab, title, build, { back, actions }))), tabbar(GTABS, tab)); });
}
const statusChip = k => k.newToday ? el('span', { class: 'chip ok' }, '✅ أنجز اليوم') : el('span', { class: 'chip warn' }, 'لم يبدأ');
function kidCard(k, onclick) {
  const pts = k.points || {};
  return el('div', { class: 'card tap', onclick },
    el('div', { class: 'row' }, el('div', { class: 'avatar' }, initial(k.name)), el('div', { class: 'grow' }, el('h2', {}, k.name), el('div', { class: 'mute' }, `${k.age} سنة`)), statusChip(k)),
    el('div', { class: 'stats' }, [[k.streak, 'أيام متواصلة'], [k.memorized, 'آية محفوظة'], [k.reviewsDue, 'مراجعات'], pts.mode !== 'none' && pts.maxPoints ? [Math.round(pts.points), 'نقطة'] : [k.weekNew + '/7', 'هذا الأسبوع']].map(([v, l]) => el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, l)))));
}
function pendingBox(k) {
  if (!k.pending.length) return null;
  return el('div', { class: 'card' }, el('h2', {}, `بانتظار تأكيدك — ${k.name}`), ...k.pending.map(p => el('div', { class: 'row sb', style: 'padding:6px 0' }, el('span', {}, `${p.label} · ${p.date}`),
    el('span', {}, el('button', { class: 'btn sm', onclick: () => confirmSession(k, p, true) }, 'صحيح'), ' ', el('button', { class: 'btn sm ghost', onclick: () => confirmSession(k, p, false) }, 'يعيد')))));
}
async function confirmSession(k, p, ok) { try { await api(`v2/kids/${k.id}/confirm`, 'POST', { sid: p.sid, ok }); toast(ok ? 'تم التأكيد' : 'طُلبت الإعادة'); guardianRoute(); } catch (e) { toast(errMsg(e)); } }
function homeTab() {
  guardianShell('home', FAM ? `أهلاً · ${FAM.family.name}` : 'الرئيسية', f => {
    if (!f.kids.length) return empty('🌱', 'أضف ولدك الأول', 'ثلاث خطوات سريعة وتبدأ العادات.', el('button', { class: 'btn', onclick: () => go('kid/new') }, 'إضافة ولد'));
    const done = f.kids.filter(k => k.newToday).length;
    return el('div', {}, el('div', { class: 'hero' }, el('div', { class: 'mute' }, 'اليوم'), el('h1', { style: 'color:#fff' }, `${done} من ${f.kids.length}`), el('div', { class: 'mute' }, 'أنجزوا عاداتهم')),
      ...f.kids.map(pendingBox).filter(Boolean), ...f.kids.map(k => kidCard(k, () => go('kid/' + k.id))));
  });
}
function kidsTab() {
  guardianShell('kids', 'الأولاد', f => el('div', {}, f.kids.length ? f.kids.map(k => el('div', { class: 'card tap', onclick: () => go('kid/' + k.id) },
    el('div', { class: 'row' }, el('div', { class: 'avatar' }, initial(k.name)), el('div', { class: 'grow' }, el('h2', {}, k.name), el('div', { class: 'mute' }, `${k.age} سنة · ${(k.habits || []).length} عادة`)), inviteChip(k)))) : empty('👧', 'لا يوجد أولاد بعد', 'أضف ولدك الأول لتبدأ.'),
    el('button', { class: 'btn', onclick: () => go('kid/new') }, 'إضافة ولد')));
}
const inviteChip = k => { const s = k.invite && k.invite.status; return el('span', { class: 'chip ' + (s === 'claimed' ? 'ok' : s === 'invited' ? 'warn' : 'gray') }, s === 'claimed' ? 'مرتبط' : s === 'invited' ? 'لم يقبل الدعوة' : 'بلا دعوة'); };
function habitsTab() {
  guardianShell('habits', 'العادات', f => el('div', {},
    el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'avatar' }, '📖'), el('div', { class: 'grow' }, el('h2', {}, 'آية اليوم'), el('div', { class: 'mute' }, 'استماع وترديد وتسميع في صفحة المصحف، ومراجعة متباعدة'))),
      f.kids.length ? el('div', { style: 'margin-top:8px' }, f.kids.map(k => el('div', { class: 'sw' }, el('span', {}, k.name), el('span', { class: 'chip ' + ((k.habits || []).includes('ayah') ? 'ok' : 'gray') }, (k.habits || []).includes('ayah') ? 'مُسندة' : 'غير مُسندة')))) : el('p', { class: 'mute' }, 'أضف ولداً أولاً.')),
    el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'avatar' }, '🔤'), el('div', { class: 'grow' }, el('h2', {}, 'كلمة اليوم'), el('div', { class: 'mute' }, 'حفظ كلمة إنجليزية يومياً بمراجعة متباعدة')), el('span', { class: 'chip gray' }, 'قريباً'))),
    el('p', { class: 'mute' }, 'تُسنَد العادات لكل ولد من صفحته. وتُضاف عادات جديدة لاحقاً: جدول الضرب والقراءة.')));
}
function progressTab() {
  guardianShell('progress', 'التقدّم', f => f.kids.length ? el('div', {}, f.kids.map(k => {
    const p = k.points || {};
    return el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'avatar' }, initial(k.name)), el('div', { class: 'grow' }, el('h2', {}, k.name), el('div', { class: 'mute' }, k.finished ? 'أتمّ خطته' : `الآية التالية: ${k.current}`))),
      el('div', { class: 'dots' }, k.last14.map(on => el('i', { class: 'dot' + (on ? ' on' : '') }))),
      el('div', { class: 'stats' }, [[k.streak, 'متواصلة'], [k.memorized, 'محفوظ'], [k.weekNew + '/7', 'الأسبوع']].map(([v, l]) => el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, l)))),
      k.avgNewSecs ? el('p', { class: 'mute' }, `متوسط درس الآية الجديدة: ${(k.avgNewSecs / 60).toFixed(1)} دقيقة (آخر 7 دروس)`) : '',
      p.mode !== 'none' && p.maxPoints ? el('div', {}, el('div', { class: 'row sb' }, el('span', { class: 'mute' }, 'نقاط الدورة'), el('b', {}, `${Math.round(p.points)} / ${p.maxPoints}`)), el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, Math.round(100 * p.points / p.maxPoints))}%` })),
        el('div', { class: 'mute' }, `يستحق حتى الآن: ${p.earned} من ${p.amount} ريال`)) : el('p', { class: 'mute' }, 'لم تُحدَّد مكافأة بعد (من صفحة الولد).'));
  })) : empty('📊', 'لا يوجد تقدّم بعد', 'أضف ولداً ليبدأ التقدّم بالظهور.'));
}
function profileTab() {
  guardianShell('profile', 'البروفايل', f => {
    const name = el('input', { value: f.family.name, maxlength: 40, 'aria-label': 'اسم العائلة' });
    return el('div', {}, el('div', { class: 'hero' }, el('div', { class: 'avatar', style: 'margin:0 auto 8px;background:#ffffff26;color:#fff;width:64px;height:64px;font-size:1.8rem' }, initial(f.family.name)), el('h1', { style: 'color:#fff' }, f.family.name),
      el('div', { class: 'mute' }, `${f.kids.length} أولاد · ${f.guardians} ${f.guardians > 1 ? 'أوصياء' : 'وصيّ'}`)),
      el('div', { class: 'card' }, el('label', {}, 'اسم العائلة'), name, el('button', { class: 'btn ghost', onclick: async () => { try { await api('v2/family', 'PUT', { name: name.value }); FAM = null; toast('تم الحفظ'); profileTab(); } catch (e) { toast(errMsg(e)); } } }, 'حفظ الاسم')),
      el('div', { class: 'card' }, el('h2', {}, 'الأولاد'), f.kids.length ? f.kids.map(k => el('div', { class: 'sw tap', onclick: () => go('kid/' + k.id) }, el('span', {}, k.name), inviteChip(k))) : el('p', { class: 'mute' }, 'لا يوجد أولاد بعد.'), el('button', { class: 'btn ghost', onclick: () => go('kid/new') }, 'إضافة ولد')),
      el('button', { class: 'btn ghost', onclick: () => go('settings') }, '⚙️ الإعدادات'));
  });
}
function settingsScreen() {
  const guard = ME.account.role === 'guardian';
  const body = el('div', {},
    el('div', { class: 'card' }, el('h2', {}, 'الحساب'), el('p', { class: 'mute' }, guard ? 'حساب أب/أم' : 'حساب ابن')),
    window.NATIVE && !guard ? reminderCard() : null,
    el('div', { class: 'card' }, el('a', { class: 'btn ghost', href: '/privacy' }, 'سياسة الخصوصية'),
      el('button', { class: 'btn ghost', onclick: logout }, 'تسجيل الخروج'),
      el('button', { class: 'btn danger', onclick: async () => {
        if (!(await confirmTyped(guard ? 'سيُحذف حسابك وعائلتك وكل أولادك وسجلاتهم نهائياً ولا يمكن التراجع. متابعة؟' : 'سيُفك ارتباط حسابك بملفك ويُحذف حسابك. متابعة؟'))) return;
        try { await api('v2/account', 'DELETE', { confirm: 'حذف' }); ['ayah_session', 'ayah_parent', 'ayah_kid'].forEach(ls.del); location.href = '/app'; } catch (e) { toast(errMsg(e)); }
      } }, guard ? 'حذف حسابي وكل بيانات العائلة' : 'حذف حسابي')));
  if (guard) { mount([header('الإعدادات', { back: 'profile' }), body]); root.append(tabbar(GTABS, 'profile')); } else { mount([header('الإعدادات', { back: 'me' }), body]); root.append(tabbar(STABS, 'me')); }
}
function reminderCard() {
  const saved = ls.get('ayah_rem'), t = el('input', { type: 'time', value: saved || '06:30' }), m = el('div', { class: 'mute' }, saved ? `التذكير اليومي: ${saved}` : '');
  return el('div', { class: 'card' }, el('h2', {}, '⏰ تذكير يومي'), t, el('button', { class: 'btn ghost', onclick: async () => { m.textContent = (await setDailyReminder(t.value)) ? `✓ سأذكّرك كل يوم ${t.value}` : 'اسمح بالإشعارات من إعدادات الجوال'; } }, saved ? 'تغيير الوقت' : 'فعّل التذكير'), m);
}

// ───── إضافة ولد وصفحة تعديله ─────
const AGES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
async function surahNames() { if (!QURAN) QURAN = (await (await fetch('/data/quran.json')).json()).map(s => ({ n: s.n, name: s.name })); return QURAN; }
const ageTemplate = a => ({ start: a >= 10 ? 67 : 114, label: a >= 10 ? 'تبدأ بسورة الملك' : 'تبدأ بسورة الناس' });
async function kidForm(k) {   // k=null: إضافة
  const names = await surahNames();
  const st = { name: k ? k.name : '', age: k ? k.age : 9, start: k ? k.start : 114, habits: new Set(k ? k.habits : ['ayah']) };
  const name = el('input', { value: st.name, placeholder: 'اسم الولد', maxlength: 30, 'aria-label': 'اسم الولد' });
  const start = el('select', {}, names.map(s => el('option', { value: s.n, selected: s.n === st.start }, `${s.name} (${s.n})`)));
  const ageSel = el('select', {}, AGES.map(a => el('option', { value: a, selected: a === st.age }, `${a} سنة`)));
  if (!k) ageSel.addEventListener('change', () => { start.value = ageTemplate(+ageSel.value).start; });
  const tog = (id, label, on, disabled) => { const b = el('button', { class: 'toggle' + (on ? ' on' : ''), disabled: disabled || null, 'aria-label': label, onclick: () => { st.habits.has(id) ? st.habits.delete(id) : st.habits.add(id); b.classList.toggle('on', st.habits.has(id)); } }); return el('div', { class: 'sw' }, el('span', {}, label), b); };
  const form = el('div', { class: 'card' }, el('label', {}, 'الاسم'), name, el('label', {}, 'العمر'), ageSel, el('label', {}, 'الخطة تبدأ من سورة (آية واحدة يومياً)'), start,
    el('h2', { style: 'margin-top:10px' }, 'العادات'), tog('ayah', 'آية اليوم', true, false), el('div', { class: 'sw' }, el('span', {}, 'كلمة اليوم (قريباً)'), el('span', { class: 'chip gray' }, 'قريباً')),
    el('button', { class: 'btn', onclick: async function () {
      if (!name.value.trim()) return toast('اكتب اسم الولد');
      const body = { name: name.value, age: +ageSel.value, start: +start.value, habits: [...st.habits] };
      try {
        const r = k ? await api('v2/kids/' + k.id, 'PUT', body) : await api('v2/kids', 'POST', body);
        FAM = null; if (k) { toast('تم الحفظ'); go('kid/' + k.id); } else { await refreshMe(); inviteScreen(r, true); }
      } catch (e) { toast(errMsg(e)); }
    } }, k ? 'حفظ' : 'إضافة وإرسال الدعوة'));
  return form;
}
async function shareInvite(kid, url) {
  const text = `ادخل إلى ثبات من هذا الرابط لتبدأ عاداتك اليومية يا ${kid}`;
  try { if (navigator.share) { await navigator.share({ title: 'ثبات', text, url }); return; } await navigator.clipboard.writeText(url); toast('نُسخ الرابط'); } catch (e) { if (e && e.name !== 'AbortError') prompt('انسخ الرابط:', url); }
}
function inviteScreen(kid, first) {
  const url = kid.invite.url;
  mount([first ? el('div', { class: 'steps' }, el('i', { class: 'on' }), el('i', { class: 'on' }), el('i', { class: 'on' })) : '', el('h1', {}, `أرسل الدعوة إلى ${kid.name}`),
    el('p', { class: 'mute' }, 'يفتح ولدك الرابط من جواله، فيفتح حساباً بحسابه ويرتبط بملفه تلقائياً.'),
    el('div', { class: 'card' }, el('div', { class: 'note', style: 'direction:ltr;word-break:break-all' }, url),
      el('button', { class: 'btn', onclick: () => shareInvite(kid.name, url) }, 'مشاركة الرابط'),
      el('button', { class: 'btn ghost', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('نُسخ الرابط'); } catch (_) { prompt('انسخ الرابط:', url); } } }, 'نسخ')),
    el('button', { class: 'btn ghost', onclick: () => go('home') }, first ? 'تم، إلى الرئيسية' : 'رجوع')], { plain: true });
}
// حساب المكافأة محلياً للمعاينة (نفس قاعدة الخادم)
const P = {
  pad: n => String(n).padStart(2, '0'),
  dim: (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(),
  active(plan, today) {
    const [y, m, d] = today.split('-').map(Number), cd = plan.cycleDay; let sy = y, sm = m; if (d < cd) { sm--; if (sm < 1) { sm = 12; sy--; } }
    const start = new Date(Date.UTC(sy, sm - 1, cd)), end = new Date(Date.UTC(sy, sm, cd - 1)); let non = 0;
    for (let t = new Date(start); t <= end; t.setUTCDate(t.getUTCDate() + 1)) if (!(plan.restWeekday >= 0 && t.getUTCDay() === plan.restWeekday)) non++;
    return Math.max(1, non - Math.min(plan.extraRestDays, Math.max(0, non - 1)));
  },
};
function kidDetail(id) {
  guardianShell('kids', 'ملف الولد', f => {
    const k = f.kids.find(x => x.id === id); if (!k) return empty('🔍', 'غير موجود', 'ربما حُذف هذا الملف.', el('button', { class: 'btn', onclick: () => go('kids') }, 'رجوع'));
    const wrap = el('div', {});
    const plan = { ...k.plan };
    const calc = el('p', { class: 'note' });
    const showCalc = () => {
      if (plan.mode === 'none' || !(+plan.amount > 0)) { calc.textContent = 'اختر مصروفاً أو مبلغاً مقطوعاً لتظهر قيمة اليوم الكامل.'; return; }
      const today = new Date().toISOString().slice(0, 10), act = P.active(plan, today), maxP = act * 100;
      calc.textContent = `${act} يوماً فعّالاً في الدورة (بعد الراحة): اليوم الكامل = ${(plan.amount / act).toFixed(2)} ريال، والنقطة = ${(plan.amount / maxP).toFixed(3)} ريال. الالتزام الكامل يبلغ ${plan.amount} ريال آخر الدورة.`;
    };
    const seg = (opts, cur, on) => { const d = el('div', { class: 'seg' }, opts.map(([v, t]) => el('button', { class: String(v) === String(cur) ? 'on' : '', onclick: e => { [...d.children].forEach(c => c.classList.toggle('on', c === e.target)); on(v); showCalc(); } }, t))); return d; };
    const amount = el('input', { type: 'number', min: 0, step: 1, value: plan.amount || '', placeholder: 'المبلغ بالريال', inputmode: 'decimal', 'aria-label': 'المبلغ' });
    amount.addEventListener('input', () => { plan.amount = +amount.value || 0; showCalc(); });
    const cyc = el('select', {}, Array.from({ length: 28 }, (_, i) => i + 1).map(d => el('option', { value: d, selected: d === plan.cycleDay }, d === 1 ? 'أول الشهر' : `يوم ${d}`)));
    cyc.addEventListener('change', () => { plan.cycleDay = +cyc.value; showCalc(); });
    const extra = el('select', {}, [0, 1, 2, 3, 4, 5].map(d => el('option', { value: d, selected: d === plan.extraRestDays }, `${d} أيام إجازة`)));
    extra.addEventListener('change', () => { plan.extraRestDays = +extra.value; showCalc(); });
    const rest = seg([[5, 'الجمعة'], [4, 'الخميس'], [-1, 'بلا']], plan.restWeekday, v => { plan.restWeekday = +v; });
    const showM = el('button', { class: 'toggle' + (plan.showMoney ? ' on' : ''), 'aria-label': 'إظهار المبلغ للولد', onclick: () => { plan.showMoney = !plan.showMoney; showM.classList.toggle('on', plan.showMoney); } });
    const modeSeg = seg([['none', 'بدون'], ['allowance', 'المصروف'], ['bonus', 'مبلغ إضافي']], plan.mode, v => { plan.mode = v; amountBox.hidden = v === 'none'; });
    const amountBox = el('div', { hidden: plan.mode === 'none' }, el('label', {}, plan.mode === 'bonus' ? 'المبلغ الإضافي الشهري' : 'مصروف الولد الشهري'), amount, el('label', {}, 'يوم صرف المصروف (بداية الدورة)'), cyc, el('label', {}, 'يوم الراحة الأسبوعي'), rest, el('label', {}, 'إجازات الشهر'), extra,
      el('div', { class: 'sw' }, el('span', {}, 'إظهار المبلغ للولد'), showM), calc);
    showCalc();
    const pCard = el('div', { class: 'card' }, el('h2', {}, 'المكافأة والنقاط'), el('p', { class: 'mute' }, 'كل يوم كامل = 100 نقطة. تُحسب قيمة النقطة ليبلغ المبلغ سقفه آخر الشهر إن التزم. التطبيق لا يدفع؛ أنت تسلّم المكافأة.'), modeSeg, amountBox,
      el('button', { class: 'btn', onclick: async () => { try { await api('v2/kids/' + k.id, 'PUT', { plan }); FAM = null; toast('تم حفظ المكافأة'); kidDetail(id); } catch (e) { toast(errMsg(e)); } } }, 'حفظ المكافأة'));
    const inv = el('div', { class: 'card' }, el('div', { class: 'row sb' }, el('h2', {}, 'الدعوة'), inviteChip(k)),
      el('p', { class: 'mute' }, k.invite && k.invite.status === 'claimed' ? 'ربط ولدك حسابه بملفه.' : 'أرسل الرابط ليفتح ولدك حسابه ويرتبط بملفه.'),
      k.invite && k.invite.url ? el('button', { class: 'btn', onclick: () => shareInvite(k.name, k.invite.url) }, 'مشاركة رابط الدعوة') : '',
      el('button', { class: 'btn ghost', onclick: async () => { if (k.invite && k.invite.status === 'claimed' && !confirm('تجديد الدعوة يفصل حساب ولدك الحالي عن ملفه. متابعة؟')) return; try { const r = await api(`v2/kids/${k.id}/invite`, 'POST', {}); FAM = null; inviteScreen({ name: k.name, invite: r }, false); } catch (e) { toast(errMsg(e)); } } }, 'تجديد الدعوة'));
    const edit = el('div', { class: 'card' }, el('h2', {}, 'البيانات والعادات'), el('div', { id: 'kf' }, skeleton(1)));
    kidForm(k).then(form => { edit.replaceChildren(el('h2', {}, 'البيانات والعادات'), ...form.childNodes); }).catch(() => { edit.replaceChildren(errorBox(() => kidDetail(id))); });
    wrap.append(el('div', { class: 'row', style: 'margin-bottom:10px' }, el('div', { class: 'avatar' }, initial(k.name)), el('div', { class: 'grow' }, el('h1', { style: 'margin:0' }, k.name), statusChip(k))),
      ...(pendingBox(k) ? [pendingBox(k)] : []), inv, pCard, edit,
      el('button', { class: 'btn danger', onclick: async () => { if (await confirmTyped(`حذف ${k.name} وكل سجله نهائياً؟`)) { try { await api('v2/kids/' + k.id, 'DELETE'); FAM = null; go('kids'); } catch (e) { toast(errMsg(e)); } } } }, 'حذف الولد'));
    return wrap;
  }, { back: 'kids' });
}
function newKid() { mount([header('ولد جديد', { back: 'kids' }), skeleton(1)]); kidForm(null).then(form => { mount([header('ولد جديد', { back: 'kids' }), form], { plain: true }); }).catch(() => mount([header('ولد جديد', { back: 'kids' }), errorBox(newKid)])); }
function firstKid() { mount([el('div', { class: 'steps' }, el('i', { class: 'on' }), el('i', { class: 'on' }), el('i', { class: 'on' })), el('h1', {}, 'أضف ولدك الأول'), skeleton(1)], { plain: true }); kidForm(null).then(form => mount([el('div', { class: 'steps' }, el('i', { class: 'on' }), el('i', { class: 'on' }), el('i', { class: 'on' })), el('h1', {}, 'أضف ولدك الأول'), form], { plain: true })); }

// ───── الابن ─────
const STABS = [['today', 'اليوم', 'today'], ['achv', 'إنجازي', 'star'], ['me', 'البروفايل', 'user']];
const curKid = () => { const id = ss.get('ayah_pick'); return ME.profiles.find(p => p.kidId === id) || (ME.profiles.length === 1 ? ME.profiles[0] : null); };
function picker() {
  mount([el('h1', {}, 'من يتعلم الآن؟'), el('p', { class: 'mute' }, 'اختر اسمك ليُسجَّل تقدّمك في ملفك.'), el('div', { class: 'pick' }, ME.profiles.map(p => el('div', { class: 'card tap', onclick: () => { ss.set('ayah_pick', p.kidId); if (here() === 'today') route(); else go('today'); } }, el('div', { class: 'avatar' }, initial(p.name)), el('h2', {}, p.name)))),
    el('button', { class: 'link', onclick: () => go('settings') }, 'الإعدادات')], { plain: true });
}
async function kidState() { const p = curKid(); KS = await api(`v2/kids/${p.kidId}/state`); return KS; }
function studentShell(tab, title, build) {
  const p = curKid(); if (!p) return picker();
  const act = ME.profiles.length > 1 ? el('button', { class: 'chip', onclick: () => { sessionStorage.removeItem('ayah_pick'); picker(); } }, 'تبديل ↔') : '';
  mount([header(title, { actions: act }), skeleton(3)]);
  kidState().then(s => root.replaceChildren(el('div', { class: 'screen' }, header(title, { actions: act }), build(s, p)), tabbar(STABS, tab)))
    .catch(e => { if (e.status === 401) return welcome(); root.replaceChildren(el('div', { class: 'screen' }, header(title), errorBox(() => studentShell(tab, title, build))), tabbar(STABS, tab)); });
}
const lessonUrl = (id, kind, key, extra) => `/lesson/${id}?kind=${kind}${key ? '&key=' + key : ''}${extra ? '&extra=1' : ''}`;
function todayTab() {
  studentShell('today', 'اليوم', (s, p) => {
    const pts = s.points || {}, cards = [];
    cards.push(el('div', { class: 'hero' }, el('div', { class: 'mute' }, `السلام عليكم يا ${s.name}`), el('div', { style: 'font-size:2.6rem;font-weight:800;line-height:1.1' }, s.streak), el('div', {}, s.streak === 1 ? 'يوم متواصل' : 'أيام متواصلة'),
      pts.mode !== 'none' && pts.maxPoints ? el('div', { class: 'mute', style: 'margin-top:6px' }, `نقاط اليوم: ${Math.round(pts.pointsToday)} / 100`) : ''));
    if (!s.finished) {
      if (s.newToday) cards.push(el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'avatar' }, '✅'), el('div', { class: 'grow' }, el('h2', {}, 'أحسنت! أتممت آية اليوم'), el('div', { class: 'mute' }, s.pending.length ? 'بانتظار تأكيد أبيك' : 'ثبّتها بالتدريب إن أردت'))),
        s.todayUnit ? el('button', { class: 'btn ghost', onclick: () => { location.href = lessonUrl(p.kidId, 'practice'); } }, `🔁 درّب ${s.todayUnit.name} ${s.todayUnit.i}`) : '',
        s.next && s.todayCount < 4 ? el('button', { class: 'btn gold', onclick: () => { location.href = lessonUrl(p.kidId, 'new', null, true); } }, `➕ آية إضافية: ${s.next.name} ${s.next.i}`) : ''));
      else cards.push(el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'avatar' }, '📖'), el('div', { class: 'grow' }, el('div', { class: 'mute' }, 'آية اليوم'), el('h2', {}, `سورة ${s.next.name} — الآية ${s.next.i}`))),
        el('button', { class: 'btn gold', onclick: () => { location.href = lessonUrl(p.kidId, 'new'); } }, 'ابدأ الآن')));
    } else cards.push(empty('🌟', 'ما شاء الله! أتممت خطتك', 'اطلب من أبيك خطة جديدة.'));
    if (s.reviews.length) cards.push(el('div', { class: 'card' }, el('h2', {}, 'مراجعة اليوم'), s.reviews.map(u => el('button', { class: 'btn ghost', onclick: () => { location.href = lessonUrl(p.kidId, 'review', u.key); } }, `راجع: ${u.name} ${u.i}`))));
    return el('div', {}, cards);
  });
}
function achvTab() {
  studentShell('achv', 'إنجازي', s => {
    const pts = s.points || {};
    return el('div', {}, el('div', { class: 'card' }, el('div', { class: 'stats' }, [[s.memorized, 'آية محفوظة'], [s.streak, 'أيام متواصلة'], [s.weekNew + '/7', 'هذا الأسبوع']].map(([v, l]) => el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, l)))), el('div', { class: 'dots' }, s.last14.map(on => el('i', { class: 'dot' + (on ? ' on' : '') })))),
      pts.mode !== 'none' && pts.maxPoints ? el('div', { class: 'card' }, el('h2', {}, 'نقاط هذا الشهر'), el('div', { class: 'pts' }, el('b', {}, Math.round(pts.points)), el('span', { class: 'mute' }, `من ${pts.maxPoints}`)), el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, Math.round(100 * pts.points / pts.maxPoints))}%` })),
        pts.showMoney ? el('p', { class: 'mute' }, `مكافأتك حتى الآن: ${pts.earned} من ${pts.amount} ريال`) : el('p', { class: 'mute' }, 'استمر كل يوم لتصل إلى أعلى نقاطك.')) : el('div', { class: 'card' }, el('p', { class: 'mute' }, 'كل يوم تنجز فيه عاداتك تقرّبك من هدفك.')));
  });
}
function meTab() {
  studentShell('me', 'البروفايل', (s, p) => el('div', {}, el('div', { class: 'hero' }, el('div', { class: 'avatar', style: 'margin:0 auto 8px;background:#ffffff26;color:#fff;width:64px;height:64px;font-size:1.8rem' }, initial(s.name)), el('h1', { style: 'color:#fff' }, s.name), el('div', { class: 'mute' }, `عائلة ${p.family}`)),
    ME.profiles.length > 1 ? el('button', { class: 'btn ghost', onclick: () => { sessionStorage.removeItem('ayah_pick'); picker(); } }, 'تبديل الولد') : '',
    window.NATIVE ? reminderCard() : '', el('button', { class: 'btn ghost', onclick: () => go('settings') }, '⚙️ الإعدادات')));
}

// ───── التوجيه ─────
function guardianRoute() {
  const h = here(), m = /^kid\/(.+)$/.exec(h);
  if (m && m[1] === 'new') return newKid();
  if (m) return kidDetail(m[1]);
  ({ home: homeTab, kids: kidsTab, habits: habitsTab, progress: progressTab, profile: profileTab, settings: settingsScreen }[h] || homeTab)();
}
function studentRoute() { ({ today: todayTab, achv: achvTab, me: meTab, settings: settingsScreen }[here()] || todayTab)(); }
function route() {
  if (!ME) return;
  const ob = ME.onboarding;
  if (ob === 'role') return ls.get('ayah_mode') === 'login' ? noAccountNotice() : roleScreen();
  if (ob === 'family') return familySetup();
  if (ob === 'kid' && here() !== 'kid/new') return firstKid();
  if (ob === 'invite') return waitInvite();
  ls.del('ayah_mode');
  if (ME.account.role === 'guardian') return guardianRoute();
  if (here() === 'settings') return settingsScreen();
  if (!curKid()) return picker();
  return studentRoute();
}
async function boot() {
  try { CFG = await api('auth/config'); } catch (_) {}
  const m = /^\/i\/([\w-]+)/.exec(location.pathname);
  if (m) { ls.set('ayah_invite', m[1]); history.replaceState(null, '', '/app'); }
  if (!ls.get('ayah_session')) return welcome();
  try { await refreshMe(); } catch (e) { if (e.status === 401) { ls.del('ayah_session'); return welcome(); } return mount([errorBox(boot)], { plain: true }); }
  const inv = ls.get('ayah_invite'); if (inv) return handleInvite(inv);
  route();
}
window.addEventListener('hashchange', () => { if (ME) route(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && ME && ME.account.role === 'guardian' && !/^(kid\/|settings)/.test(here())) { FAM = null; route(); } });
boot();
