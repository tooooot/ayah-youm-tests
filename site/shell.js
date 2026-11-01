'use strict';
// ثبات — التطبيق: تسجيل الدخول (Google/Apple) ← رحلة الأب (عائلة، أولاد، مكافأة، دعوات) ← الرئيسية بشريط سفلي.
// الابن: يفتح رابط الدعوة، يسجّل دخوله فيرتبط بملفه تلقائياً ويبدأ مباشرة. التوجيه بـ #/…
const root = $('#root');
const ls = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }, del: k => { try { localStorage.removeItem(k); } catch (_) {} } };
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) {} } };
let ME = null, FAM = null, KS = null, CFG = { google: false, apple: false, reviewer: false }, QURAN = null;

// ───── أيقونات وشعارات ─────
const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10', users: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M16 3.2a3.5 3.5 0 010 6.6',
  habits: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', user: 'M20 21v-1a5 5 0 00-5-5H9a5 5 0 00-5 5v1M12 11a4 4 0 100-8 4 4 0 000 8z',
  today: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  back: 'M9 6l6 6-6 6', plus: 'M12 5v14M5 12h14', check: 'M5 13l4 4L19 7', share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
  family: 'M3 21v-1a5 5 0 015-5h2M7 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM13 21v-1a4 4 0 014-4h1a3 3 0 013 3v2M17.5 12a3 3 0 100-6 3 3 0 000 6z', kid: 'M12 12a4 4 0 100-8 4 4 0 000 8zM5 21v-2a6 6 0 0112 0v2',
  gift: 'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7S10 3 7.5 3 5 6 7.5 7M12 7s2-4 4.5-4S19 6 16.5 7', mail: 'M3 6h18v12H3zM3 7l9 7 9-7', book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 21V5M9 7h6M9 11h6',
  seed: 'M12 21v-9M12 12C12 8 9 6 5 6c0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z',
};
const NS = 'http://www.w3.org/2000/svg';
const ic = (n, cls) => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); if (cls) s.setAttribute('class', cls); const p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONS[n]); s.append(p); return s; };
const raw = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const GOOGLE = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 019.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 000 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
const APPLE = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';

// ───── أدوات ─────
const initial = n => (String(n || '؟').trim()[0] || '؟');
const avatar = (name, i = 0, size) => el('div', { class: 'avatar av' + (i % 5), ...(size ? { style: `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.4)}px` } : {}) }, initial(name));
const toast = t => { const d = el('div', { class: 'toast' }, t); document.body.append(d); setTimeout(() => d.remove(), 2400); };
const errMsg = e => (e && e.message) || 'حدث خطأ، حاول مرة أخرى';
const skeleton = (n = 3) => el('div', {}, Array.from({ length: n }, () => el('div', { class: 'sk' })));
const empty = (icon, title, text, cta) => el('div', { class: 'empty' }, el('div', { class: 'illus' }, ic(icon)), el('h2', {}, title), el('p', {}, text), cta || '');
const errorBox = retry => el('div', { class: 'empty' }, el('div', { class: 'illus' }, ic('gear')), el('h2', {}, 'تعذّر التحميل'), el('p', {}, 'تحقّق من الاتصال ثم أعد المحاولة.'), el('button', { class: 'btn sm', onclick: retry }, 'إعادة المحاولة'));
const go = h => { location.hash = '#/' + h; };
const here = () => location.hash.replace(/^#\/?/, '');
function mount(nodes, plain) { root.replaceChildren(el('div', { class: 'screen' + (plain ? ' plain' : '') }, nodes)); window.scrollTo(0, 0); }
const mountRaw = (...n) => { root.replaceChildren(...n); window.scrollTo(0, 0); };
function header(title, { back, actions } = {}) {
  const b = back ? el('button', { class: 'ib', 'aria-label': 'رجوع', onclick: () => (typeof back === 'string' ? go(back) : back()) }, ic('back')) : null;
  return el('div', { class: 'hdr' }, b, el('h1', {}, title), actions || '');
}
const tabbar = (tabs, active) => el('div', { class: 'tabbar' }, el('nav', {}, tabs.map(([id, label, i]) => el('button', { class: 'tab' + (id === active ? ' on' : ''), onclick: () => go(id) }, ic(i), label))));
const confirmTyped = async (msg, word = 'حذف') => confirm(msg) && prompt('للتأكيد اكتب كلمة: ' + word) === word;
const ring = (done, total, label) => { const C = 2 * Math.PI * 40, off = total ? C * (1 - Math.min(1, done / total)) : C;
  return el('div', { class: 'ring' }, raw(`<svg viewBox="0 0 96 96"><circle class="bg" cx="48" cy="48" r="40"/><circle class="fg" cx="48" cy="48" r="40" stroke-dasharray="${C}" stroke-dashoffset="${off}"/></svg>`), el('b', {}, label)); };
async function refreshMe() { ME = await api('v2/me'); return ME; }
async function logout() { try { await api('v2/logout', 'POST', {}); } catch (_) {} ['ayah_session', 'ayah_invite', 'ayah_j'].forEach(ls.del); location.href = '/app'; }

// ───── تسجيل الدخول والدعوة ─────
const startAuth = prov => nativeBrowser('/auth/start/' + prov + (window.NATIVE ? '?app=1' : ''));
function reviewerBox() {   // دخول مراجعي المتاجر (حساب موحّد لكل تطبيقاتنا)
  const u = el('input', { placeholder: 'اسم المستخدم', autocomplete: 'username', dir: 'ltr' }), p = el('input', { type: 'password', placeholder: 'كلمة المرور', autocomplete: 'current-password', dir: 'ltr' }), m = el('div', { class: 'mute' });
  let role = 'guardian';
  const seg = el('div', { class: 'seg' }, [['guardian', 'أب/أم'], ['student', 'ابن']].map(([r, t]) => el('button', { class: r === role ? 'on' : '', onclick: e => { role = r; [...seg.children].forEach(c => c.classList.toggle('on', c === e.target)); } }, t)));
  const f = el('div', { hidden: true }, seg, u, p, el('button', { class: 'btn ghost', onclick: async () => { try { const r = await api('auth/reviewer', 'POST', { user: u.value, pass: p.value, role }); ls.set('ayah_session', r.session); location.href = '/app'; } catch (e) { m.textContent = errMsg(e); } } }, 'دخول'), m);
  return el('div', { style: 'text-align:center' }, el('button', { class: 'link', style: 'font-size:.8rem;color:var(--mute);font-weight:600', onclick: () => { f.hidden = !f.hidden; } }, 'دخول المراجعين (للمتاجر)'), f);
}
function signin(inv) {
  const top = el('div', { class: 'top' }, el('img', { class: 'logo', src: '/icon-192.png', alt: '' }), el('h1', {}, 'ثبات'),
    inv ? [el('div', { class: 'invitehero' }, el('span', { class: 'mute', style: 'color:#bfe0d4' }, `دعتك عائلة «${inv.family}»`), el('b', {}, `أهلاً ${inv.kid}`)), el('p', { class: 'tagline' }, 'سجّل دخولك بحسابك فيرتبط بملفك تلقائياً وتبدأ مباشرة.')]
      : el('p', { class: 'tagline' }, 'عادات يومية صغيرة تثبت: آية، وكلمة، وقراءة.'));
  const btns = [CFG.google ? el('button', { class: 'btn google', onclick: () => startAuth('google') }, raw(GOOGLE), 'المتابعة بـ Google') : null,
    CFG.apple ? el('button', { class: 'btn apple', onclick: () => startAuth('apple') }, raw(APPLE), 'المتابعة بـ Apple') : null,
    !CFG.google && !CFG.apple ? el('p', { class: 'note' }, 'الدخول بالحساب سيُفعَّل قريباً.') : null];
  mountRaw(el('div', { class: 'signin' }, top, el('div', { class: 'sheetcard' }, el('h2', {}, inv ? 'تابع للدخول' : 'ابدأ الآن'), el('p', { class: 'lead' }, inv ? 'بحسابك الخاص، خطوة واحدة.' : 'ادخل أو أنشئ حسابك بحساب واحد في خطوة واحدة.'), btns,
    el('p', { class: 'legal' }, 'بمتابعتك توافق على ', el('a', { href: '/privacy' }, 'سياسة الخصوصية')), CFG.reviewer ? reviewerBox() : null)));
}
const inviteProblem = (title, text) => mount([empty('mail', title, text, el('button', { class: 'btn', onclick: () => { location.href = '/app'; } }, 'متابعة'))], true);
async function claimInvite(token) {   // يُنفَّذ تلقائياً بعد الدخول: لا ضغطة إضافية ولا اختيار دور
  mount([el('div', { class: 'hero' }, el('div', { class: 'mute' }, 'لحظة…'), el('h1', {}, 'نربط حسابك بملفك')), skeleton(1)], true);
  try { const r = await api('v2/invites/' + token + '/claim', 'POST', {}); ls.del('ayah_invite'); ss.set('ayah_pick', r.kidId); await refreshMe(); if (here() !== 'today') go('today'); else route(); }
  catch (e) { ls.del('ayah_invite'); if (e.status === 403) return inviteProblem('هذا حساب أب/أم', 'افتح رابط الدعوة من جهاز الابن وبحسابه.'); if (e.status === 409) return inviteProblem('الدعوة مستخدمة', 'استُخدمت هذه الدعوة بحساب آخر. اطلب من أبيك دعوة جديدة.'); inviteProblem('الدعوة غير صالحة', 'قد تكون أُلغيت. اطلب من أبيك دعوة جديدة.'); }
}
function iAmKid() {
  mount([header('أنا ابن', { back: () => route() }), empty('mail', 'تحتاج دعوة من أبيك', 'اطلب من أبيك أن يرسل لك رابط الدعوة من تطبيق ثبات، ثم افتحه من هذا الجهاز: سيرتبط حسابك بملفك تلقائياً وتبدأ.', el('button', { class: 'btn ghost', onclick: logout }, 'تسجيل الخروج'))], true);
}

// ───── رحلة الأب: عائلة ← أولاد ← مكافأة ← دعوات ─────
const STEPS = ['العائلة', 'الأولاد', 'المكافأة', 'الدعوات'];
function journeyShell(step, illus, title, lead, body, { next, nextLabel, skip, back } = {}) {
  const top = el('div', { class: 'jtop' }, back ? el('button', { class: 'ib', 'aria-label': 'رجوع', onclick: back }, ic('back')) : '', el('div', { class: 'jsteps' }, STEPS.map((_, i) => el('i', { class: i < step ? 'done' : i === step ? 'on' : '' }))));
  const bar = el('div', { class: 'jbar' }, el('div', { class: 'in' }, next ? el('button', { class: 'btn', onclick: next }, nextLabel || 'متابعة') : '', skip ? el('button', { class: 'link', style: 'display:block;margin:0 auto', onclick: skip }, 'تخطي الآن') : ''));
  root.replaceChildren(el('div', { class: 'journey' }, top, el('div', { class: 'jlabel' }, `الخطوة ${step + 1} من ${STEPS.length} · ${STEPS[step]}`), el('div', { class: 'jillus' }, ic(illus)), el('h1', {}, title), el('p', { class: 'lead' }, lead), body), bar);
  window.scrollTo(0, 0);
}
function journey() {
  const ob = ME.onboarding, saved = +ls.get('ayah_j');
  if (ob === 'family') return jFamily();
  if (ob === 'kid' || !saved || saved === 1) return jKids();
  if (saved === 2) return jReward();
  return jInvites();
}
function jFamily() {
  const name = el('input', { value: 'عائلتي', maxlength: 40, 'aria-label': 'اسم العائلة' });
  journeyShell(0, 'family', 'سمِّ عائلتك', 'مثل: آل أحمد. يراه أولادك في التطبيق.', el('div', { class: 'card' }, el('label', {}, 'اسم العائلة'), name, el('button', { class: 'link', onclick: iAmKid }, 'لستُ أباً أو أماً: أنا ابن')),
    { next: async () => { try { await api('v2/family', 'POST', { name: name.value }); ls.set('ayah_j', '1'); await refreshMe(); route(); } catch (e) { toast(errMsg(e)); } } });
}
async function surahNames() { if (!QURAN) QURAN = (await (await fetch('/data/quran.json')).json()).map(s => ({ n: s.n, name: s.name })); return QURAN; }
const ageStart = a => (a >= 10 ? 67 : 114);
async function jKids() {
  mount([skeleton(2)], true);
  try { FAM = await api('v2/family'); } catch (e) { return mount([errorBox(jKids)], true); }
  const names = await surahNames().catch(() => []);
  const name = el('input', { placeholder: 'اسم الولد', maxlength: 30, 'aria-label': 'اسم الولد' });
  const age = el('select', { 'aria-label': 'العمر' }, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(a => el('option', { value: a, selected: a === 9 }, `${a} سنة`)));
  const start = el('select', { 'aria-label': 'سورة البداية' }, names.map(s => el('option', { value: s.n, selected: s.n === 114 }, `${s.name} (${s.n})`)));
  age.addEventListener('change', () => { start.value = ageStart(+age.value); });
  const list = FAM.kids.length ? el('div', { class: 'card' }, el('h2', {}, 'أولادك'), FAM.kids.map((k, i) => el('div', { class: 'kidmini' }, avatar(k.name, i, 42), el('div', { class: 'grow' }, el('h3', {}, k.name), el('div', { class: 'mute' }, `${k.age} سنة`)), el('span', { class: 'chip ok' }, ic('check', ''))))) : '';
  const add = async () => {
    if (!name.value.trim()) { toast('اكتب اسم الولد'); return false; }
    try { await api('v2/kids', 'POST', { name: name.value, age: +age.value, start: +start.value, habits: ['ayah'] }); await refreshMe(); return true; } catch (e) { toast(errMsg(e)); return false; }
  };
  journeyShell(1, 'kid', FAM.kids.length ? 'أضف ولداً آخر؟' : 'أضف ولدك الأول', 'الاسم والعمر فقط، والباقي يُضبط تلقائياً بحسب العمر ويمكنك تعديله لاحقاً.',
    el('div', {}, list, el('div', { class: 'card' }, el('label', {}, 'اسم الولد'), name, el('label', {}, 'العمر'), age, el('label', {}, 'تبدأ الخطة من سورة (آية واحدة يومياً)'), start,
      el('button', { class: FAM.kids.length ? 'btn ghost' : 'btn', onclick: async () => { if (await add()) { toast('أُضيف'); jKids(); } } }, FAM.kids.length ? 'إضافة ولد آخر' : 'إضافة الولد'))),
    FAM.kids.length ? { next: async () => { if (name.value.trim() && !(await add())) return; ls.set('ayah_j', '2'); route(); }, nextLabel: 'متابعة إلى المكافأة' } : {});
}
function rewardEditor(k, { compact, onSaved } = {}) {
  const plan = { ...k.plan }, calc = el('p', { class: 'note' });
  const act = () => { const [y, m, d] = new Date().toISOString().slice(0, 10).split('-').map(Number); let sy = y, sm = m; if (d < plan.cycleDay) { sm--; if (sm < 1) { sm = 12; sy--; } }
    let non = 0; for (let t = new Date(Date.UTC(sy, sm - 1, plan.cycleDay)), e = new Date(Date.UTC(sy, sm, plan.cycleDay - 1)); t <= e; t.setUTCDate(t.getUTCDate() + 1)) if (!(plan.restWeekday >= 0 && t.getUTCDay() === plan.restWeekday)) non++;
    return Math.max(1, non - Math.min(plan.extraRestDays, Math.max(0, non - 1))); };
  const showCalc = () => { if (plan.mode === 'none' || !(+plan.amount > 0)) { calc.textContent = 'اختر مصروفاً أو مبلغاً مقطوعاً لتظهر قيمة اليوم الكامل.'; return; }
    const a = act(); calc.textContent = `${a} يوماً فعّالاً في الدورة: اليوم الكامل = ${(plan.amount / a).toFixed(2)} ريال، والنقطة = ${(plan.amount / (a * 100)).toFixed(3)} ريال. الالتزام الكامل يبلغ ${plan.amount} ريال آخر الدورة.`; };
  const seg = (opts, cur, on) => { const d = el('div', { class: 'seg' }, opts.map(([v, t]) => el('button', { class: String(v) === String(cur) ? 'on' : '', onclick: e => { [...d.children].forEach(c => c.classList.toggle('on', c === e.target)); on(v); showCalc(); } }, t))); return d; };
  const amount = el('input', { type: 'number', min: 0, step: 1, value: plan.amount || '', placeholder: 'المبلغ بالريال', inputmode: 'decimal', 'aria-label': 'المبلغ' });
  amount.addEventListener('input', () => { plan.amount = +amount.value || 0; showCalc(); });
  const cyc = el('select', {}, Array.from({ length: 28 }, (_, i) => i + 1).map(d => el('option', { value: d, selected: d === plan.cycleDay }, d === 1 ? 'أول الشهر' : `يوم ${d}`))); cyc.addEventListener('change', () => { plan.cycleDay = +cyc.value; showCalc(); });
  const extra = el('select', {}, [0, 1, 2, 3, 4, 5].map(d => el('option', { value: d, selected: d === plan.extraRestDays }, `${d} أيام إجازة`))); extra.addEventListener('change', () => { plan.extraRestDays = +extra.value; showCalc(); });
  const rest = seg([[5, 'الجمعة'], [4, 'الخميس'], [-1, 'بلا']], plan.restWeekday, v => { plan.restWeekday = +v; });
  const showM = el('button', { class: 'toggle' + (plan.showMoney ? ' on' : ''), 'aria-label': 'إظهار المبلغ للولد', onclick: () => { plan.showMoney = !plan.showMoney; showM.classList.toggle('on', plan.showMoney); } });
  const more = el('div', { hidden: !!compact }, el('label', {}, 'يوم صرف المصروف (بداية الدورة)'), cyc, el('label', {}, 'يوم الراحة الأسبوعي'), rest, el('label', {}, 'إجازات الشهر'), extra, el('div', { class: 'sw' }, el('span', {}, 'إظهار المبلغ للولد'), showM));
  const box = el('div', { hidden: plan.mode === 'none' }, el('label', {}, plan.mode === 'bonus' ? 'المبلغ الإضافي الشهري' : 'مصروف الولد الشهري'), amount, more, calc);
  const modeSeg = seg([['none', 'بدون'], ['allowance', 'المصروف'], ['bonus', 'مبلغ إضافي']], plan.mode, v => { plan.mode = v; box.hidden = v === 'none'; });
  showCalc();
  return { node: el('div', {}, modeSeg, box), plan, save: async () => { await api('v2/kids/' + k.id, 'PUT', { plan }); FAM = null; onSaved && onSaved(); } };
}
async function jReward() {
  mount([skeleton(2)], true);
  try { FAM = await api('v2/family'); } catch (e) { return mount([errorBox(jReward)], true); }
  const eds = FAM.kids.map(k => rewardEditor(k, { compact: true }));
  journeyShell(2, 'gift', 'مكافأة الالتزام', 'اربط مصروف ولدك أو مبلغاً إضافياً بالتزامه. كل يوم كامل = 100 نقطة، ويُحسب المبلغ ليبلغ سقفه آخر الشهر إن التزم. التطبيق لا يدفع؛ أنت تسلّم المكافأة.',
    el('div', {}, FAM.kids.map((k, i) => el('div', { class: 'card' }, el('div', { class: 'row', style: 'margin-bottom:8px' }, avatar(k.name, i, 40), el('h2', { style: 'margin:0' }, k.name)), eds[i].node))),
    { next: async () => { try { for (const e of eds) if (e.plan.mode !== 'none') await e.save(); ls.set('ayah_j', '3'); route(); } catch (e) { toast(errMsg(e)); } }, nextLabel: 'حفظ ومتابعة', skip: () => { ls.set('ayah_j', '3'); route(); }, back: () => { ls.set('ayah_j', '1'); route(); } });
}
async function jInvites() {
  mount([skeleton(2)], true);
  try { FAM = await api('v2/family'); } catch (e) { return mount([errorBox(jInvites)], true); }
  journeyShell(3, 'mail', 'أرسل الدعوات لأولادك', 'يفتح كل ولد رابطه من جواله ويسجّل دخوله بحسابه، فيرتبط بملفه تلقائياً ويبدأ مباشرة.',
    el('div', { class: 'card' }, FAM.kids.map((k, i) => el('div', { class: 'kidmini' }, avatar(k.name, i, 42), el('div', { class: 'grow' }, el('h3', {}, k.name), inviteChip(k)),
      k.invite && k.invite.url ? el('button', { class: 'btn sm', onclick: () => shareInvite(k.name, k.invite.url) }, ic('share'), 'إرسال') : ''))),
    { next: () => { ls.del('ayah_j'); if (here() !== 'home') go('home'); else route(); }, nextLabel: 'إنهاء، إلى الرئيسية', back: () => { ls.set('ayah_j', '2'); route(); } });
}
async function shareInvite(kid, url) {
  const text = `ادخل إلى ثبات من هذا الرابط لتبدأ عاداتك اليومية يا ${kid}`;
  try { if (navigator.share) { await navigator.share({ title: 'ثبات', text, url }); return; } await navigator.clipboard.writeText(url); toast('نُسخ الرابط'); } catch (e) { if (e && e.name !== 'AbortError') prompt('انسخ الرابط:', url); }
}
const inviteChip = k => { const s = k.invite && k.invite.status; return el('span', { class: 'chip ' + (s === 'claimed' ? 'ok' : s === 'invited' ? 'warn' : 'gray') }, s === 'claimed' ? 'مرتبط' : s === 'invited' ? 'لم يقبل الدعوة بعد' : 'بلا دعوة'); };

// ───── الأب ─────
const GTABS = [['home', 'الرئيسية', 'home'], ['kids', 'الأولاد', 'users'], ['habits', 'العادات', 'habits'], ['progress', 'التقدّم', 'chart'], ['profile', 'البروفايل', 'user']];
function guardianShell(tab, title, build, { back, actions } = {}) {
  mount([header(title, { back, actions }), skeleton(3)]);
  api('v2/family').then(f => { FAM = f; root.replaceChildren(el('div', { class: 'screen' }, header(title, { back, actions }), build(f)), tabbar(GTABS, tab)); window.scrollTo(0, 0); })
    .catch(e => { if (e.status === 401) { ls.del('ayah_session'); return boot(); } root.replaceChildren(el('div', { class: 'screen' }, header(title), errorBox(() => guardianShell(tab, title, build, { back, actions }))), tabbar(GTABS, tab)); });
}
const statusChip = k => k.newToday ? el('span', { class: 'chip ok' }, ic('check', ''), 'أنجز اليوم') : el('span', { class: 'chip warn' }, 'لم يبدأ');
function kidCard(k, i, onclick) {
  const pts = k.points || {};
  return el('div', { class: 'card tap', onclick },
    el('div', { class: 'row' }, avatar(k.name, i), el('div', { class: 'grow' }, el('h2', { style: 'margin:0' }, k.name), el('div', { class: 'mute' }, `${k.age} سنة`)), statusChip(k)),
    el('div', { class: 'stats' }, [[k.streak, 'أيام متواصلة'], [k.memorized, 'آية محفوظة'], [k.reviewsDue, 'مراجعات'], [Math.round(pts.points), 'نقطة الدورة']].map(([v, l]) => el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, l)))));
}
const WHY = { unsupported: 'جهازه لا يدعم سماع التسميع', 'not-allowed': 'الميكروفون ممنوع على جهازه', 'service-not-allowed': 'خدمة التعرّف على الكلام مغلقة في جهازه', 'no-speech': 'لم يلتقط التطبيق صوتاً', 'audio-capture': 'لا ميكروفون في جهازه', network: 'انقطع الاتصال أثناء التسميع' };
function pendingBox(k) {
  if (!k.pending.length) return null;
  return el('div', { class: 'card' }, el('h2', {}, `تسميع ينتظر تأكيدك — ${k.name}`),
    el('p', { class: 'note' }, 'لم يستطع التطبيق التحقق من تسميعه بالصوت. أكّد فقط إن سمعتَه بنفسك؛ لا تُحسب الآية ولا النقاط قبل تأكيدك.'),
    ...k.pending.map(p => { const slot = el('div'); return el('div', { style: 'padding:8px 0;border-bottom:1px solid var(--line)' }, el('div', { class: 'row sb' }, el('b', {}, p.label), el('span', { class: 'mute' }, p.date)), el('div', { class: 'mute', style: 'margin:2px 0 6px' }, WHY[p.why] || 'لم يُسمَّع بالصوت'),
      p.hasRec ? [el('button', { class: 'btn sm ghost', onclick: () => playRec(k, p, slot) }, '▶ استمع لتسميعه'), slot] : el('div', { class: 'mute' }, 'لا يوجد تسجيل لهذا التسميع.'),
      FAM && FAM.kids.length > 1 ? moveRow(k, p) : '',
      el('div', { class: 'row' }, el('button', { class: 'btn sm', onclick: () => confirmSession(k, p, true) }, 'سمعتُه وصحّ'), el('button', { class: 'btn sm ghost', onclick: () => confirmSession(k, p, false) }, 'لم أسمعه / يعيد'))); }));
}
function moveRow(k, p) {   // سُجّل التسميع على ولد خطأً: انقله إلى أخيه
  const sel = el('select', { 'aria-label': 'نقل إلى', style: 'min-height:40px;margin:0;flex:1' }, FAM.kids.filter(x => x.id !== k.id).map(x => el('option', { value: x.id }, x.name)));
  return el('div', { class: 'row', style: 'margin:6px 0' }, el('span', { class: 'mute' }, 'ليس ولدك هذا؟'), sel, el('button', { class: 'btn sm ghost', onclick: async () => { try { await api(`v2/kids/${k.id}/sessions/${p.sid}/move`, 'POST', { toKid: sel.value }); toast('نُقل التسميع'); route(); } catch (e) { toast(errMsg(e)); } } }, 'نقل'));
}
async function playRec(k, p, slot) {   // يجلب التسجيل المؤقت بجلسة الأب ويشغّله
  try { const r = await fetch(`/api/v2/kids/${k.id}/sessions/${p.sid}/recording`, { headers: { 'X-Session': ls.get('ayah_session') || '' } }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'لا يوجد تسجيل'); const b = await r.blob(); slot.replaceChildren(el('audio', { controls: true, autoplay: true, src: URL.createObjectURL(b), style: 'width:100%;margin-top:6px' })); } catch (e) { toast(errMsg(e)); }
}
async function confirmSession(k, p, ok) { try { await api(`v2/kids/${k.id}/confirm`, 'POST', { sid: p.sid, ok }); toast(ok ? 'تم التأكيد' : 'طُلبت الإعادة'); route(); } catch (e) { toast(errMsg(e)); } }
const todayAr = () => { try { return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()); } catch (_) { return ''; } };
function homeTab() {
  guardianShell('home', 'الرئيسية', f => {
    if (!f.kids.length) return empty('seed', 'أضف ولدك الأول', 'أكمل رحلة الإعداد لتبدأ العادات.', el('button', { class: 'btn', onclick: () => { ls.set('ayah_j', '1'); route(); } }, 'إكمال الإعداد'));
    const done = f.kids.filter(k => k.newToday).length;
    return el('div', {}, el('div', { class: 'hero' }, el('div', { class: 'ringwrap' }, ring(done, f.kids.length, `${done}/${f.kids.length}`), el('div', {}, el('div', { class: 'mute' }, todayAr()), el('h1', { style: 'margin:2px 0' }, f.family.name), el('div', { class: 'mute' }, done === f.kids.length ? 'أنجز الجميع اليوم، ما شاء الله' : 'أنجزوا عاداتهم اليوم')))),
      ...(checklistCard(f) ? [checklistCard(f)] : []), ...f.kids.map(pendingBox).filter(Boolean), ...f.kids.map((k, i) => kidCard(k, i, () => go('kid/' + k.id))));
  });
}
function kidsTab() {
  guardianShell('kids', 'الأولاد', f => el('div', {}, f.kids.length ? f.kids.map((k, i) => el('div', { class: 'card tap', onclick: () => go('kid/' + k.id) },
    el('div', { class: 'row' }, avatar(k.name, i), el('div', { class: 'grow' }, el('h2', { style: 'margin:0' }, k.name), el('div', { class: 'mute' }, `${k.age} سنة · ${(k.habits || []).length} عادة`)), inviteChip(k)))) : empty('users', 'لا يوجد أولاد بعد', 'أضف ولدك الأول لتبدأ.'),
    el('button', { class: 'btn', onclick: () => go('kid/new') }, ic('plus'), 'إضافة ولد')));
}
function habitsTab() {
  guardianShell('habits', 'العادات', f => el('div', {},
    el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'avatar av0' }, ic('habits')), el('div', { class: 'grow' }, el('h2', { style: 'margin:0' }, 'آية اليوم'), el('div', { class: 'mute' }, 'استماع وترديد وتسميع في صفحة المصحف، ومراجعة متباعدة'))),
      f.kids.length ? el('div', { style: 'margin-top:8px' }, f.kids.map(k => el('div', { class: 'sw' }, el('span', {}, k.name), el('span', { class: 'chip ' + ((k.habits || []).includes('ayah') ? 'ok' : 'gray') }, (k.habits || []).includes('ayah') ? 'مُسندة' : 'غير مُسندة')))) : el('p', { class: 'mute' }, 'أضف ولداً أولاً.')),
    el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'avatar av2' }, ic('star')), el('div', { class: 'grow' }, el('h2', { style: 'margin:0' }, 'كلمة اليوم'), el('div', { class: 'mute' }, 'حفظ كلمة إنجليزية يومياً بمراجعة متباعدة')), el('span', { class: 'chip gray' }, 'قريباً'))),
    el('p', { class: 'mute' }, 'تُسنَد العادات لكل ولد من صفحته، وتُضاف عادات جديدة لاحقاً: جدول الضرب والقراءة.')));
}
function progressTab() {
  guardianShell('progress', 'التقدّم', f => f.kids.length ? el('div', {}, f.kids.map((k, i) => {
    const p = k.points || {};
    return el('div', { class: 'card' }, el('div', { class: 'row' }, avatar(k.name, i), el('div', { class: 'grow' }, el('h2', { style: 'margin:0' }, k.name), el('div', { class: 'mute' }, k.finished ? 'أتمّ خطته' : `الآية التالية: ${k.current}`))),
      el('div', { class: 'dots' }, k.last14.map(on => el('i', { class: 'dot' + (on ? ' on' : '') }))),
      el('div', { class: 'stats' }, [[k.streak, 'متواصلة'], [k.memorized, 'محفوظ'], [k.weekNew + '/7', 'الأسبوع']].map(([v, l]) => el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, l)))),
      k.avgNewSecs ? el('p', { class: 'mute' }, `متوسط درس الآية الجديدة: ${(k.avgNewSecs / 60).toFixed(1)} دقيقة (آخر 7 دروس)`) : '',
      el('div', { style: 'margin-top:10px' }, el('div', { class: 'row sb' }, el('span', { class: 'mute' }, 'نقاط الدورة'), el('b', {}, `${Math.round(p.points)} / ${p.maxPoints}`)), el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, Math.round(100 * p.points / p.maxPoints))}%` })),
        weekBars(k.recent || []), p.mode !== 'none' ? el('div', { class: 'mute' }, `يستحق حتى الآن: ${p.earned} من ${p.amount} ريال`) : el('p', { class: 'mute' }, 'لم تُحدَّد مكافأة بعد (من صفحة الولد).')));
  })) : empty('chart', 'لا يوجد تقدّم بعد', 'أضف ولداً ليبدأ التقدّم بالظهور.'));
}
function profileTab() {
  guardianShell('profile', 'البروفايل', f => {
    const name = el('input', { value: f.family.name, maxlength: 40, 'aria-label': 'اسم العائلة' });
    return el('div', {}, el('div', { class: 'hero', style: 'text-align:center' }, el('div', { class: 'avatar av0', style: 'margin:0 auto 10px;width:70px;height:70px;font-size:2rem;background:#ffffff26' }, initial(f.family.name)), el('h1', {}, f.family.name),
      el('div', { class: 'mute' }, `${f.kids.length} أولاد · ${f.guardians} ${f.guardians > 1 ? 'أوصياء' : 'وصيّ'}`)),
      el('div', { class: 'card' }, el('label', {}, 'اسم العائلة'), name, el('button', { class: 'btn ghost', onclick: async () => { try { await api('v2/family', 'PUT', { name: name.value }); toast('تم الحفظ'); profileTab(); } catch (e) { toast(errMsg(e)); } } }, 'حفظ الاسم')),
      el('div', { class: 'card' }, el('h2', {}, 'الأولاد'), f.kids.length ? f.kids.map((k, i) => el('div', { class: 'kidmini', style: 'cursor:pointer', onclick: () => go('kid/' + k.id) }, avatar(k.name, i, 40), el('div', { class: 'grow' }, el('h3', {}, k.name)), inviteChip(k))) : el('p', { class: 'mute' }, 'لا يوجد أولاد بعد.'), el('button', { class: 'btn ghost', onclick: () => go('kid/new') }, ic('plus'), 'إضافة ولد')),
      el('button', { class: 'btn ghost', onclick: () => go('guide') }, ic('book'), 'دليل الأب'),
      el('button', { class: 'btn ghost', onclick: () => go('settings') }, ic('gear'), 'الإعدادات'));
  });
}
function reminderCard() {
  const saved = ls.get('ayah_rem'), t = el('input', { type: 'time', value: saved || '06:30' }), m = el('div', { class: 'mute' }, saved ? `التذكير اليومي: ${saved}` : '');
  return el('div', { class: 'card' }, el('h2', {}, 'تذكير يومي'), t, el('button', { class: 'btn ghost', onclick: async () => { m.textContent = (await setDailyReminder(t.value)) ? `✓ سأذكّرك كل يوم ${t.value}` : 'اسمح بالإشعارات من إعدادات الجوال'; } }, saved ? 'تغيير الوقت' : 'فعّل التذكير'), m);
}
function settingsScreen() {
  const guard = ME.account.role === 'guardian';
  const body = el('div', {},
    el('div', { class: 'card' }, el('h2', {}, 'الحساب'), el('p', { class: 'mute' }, guard ? 'حساب أب/أم' : 'حساب ابن')),
    window.NATIVE && !guard ? reminderCard() : null,
    el('div', { class: 'card' }, el('a', { class: 'btn ghost', href: '/privacy' }, 'سياسة الخصوصية'), el('button', { class: 'btn ghost', onclick: logout }, 'تسجيل الخروج'),
      el('button', { class: 'btn danger', onclick: async () => {
        if (!(await confirmTyped(guard ? 'سيُحذف حسابك وعائلتك وكل أولادك وسجلاتهم نهائياً ولا يمكن التراجع. متابعة؟' : 'سيُفك ارتباط حسابك بملفك ويُحذف حسابك. متابعة؟'))) return;
        try { await api('v2/account', 'DELETE', { confirm: 'حذف' }); ['ayah_session', 'ayah_j'].forEach(ls.del); location.href = '/app'; } catch (e) { toast(errMsg(e)); }
      } }, guard ? 'حذف حسابي وكل بيانات العائلة' : 'حذف حسابي')));
  mount([header('الإعدادات', { back: guard ? 'profile' : 'me' }), body]); root.append(tabbar(guard ? GTABS : STABS, guard ? 'profile' : 'me'));
}
async function kidForm(k) {   // نموذج تعديل بيانات الولد: يرجع قائمة عقد
  const names = await surahNames();
  const name = el('input', { value: k.name, maxlength: 30, 'aria-label': 'اسم الولد' }), age = el('select', {}, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(a => el('option', { value: a, selected: a === k.age }, `${a} سنة`)));
  const start = el('select', {}, names.map(s => el('option', { value: s.n, selected: s.n === k.start }, `${s.name} (${s.n})`)));
  const habitSet = new Set(k.habits || ['ayah']);
  const wt = el('button', { class: 'toggle' + (habitSet.has('word') ? ' on' : ''), 'aria-label': 'كلمة اليوم', onclick: () => { habitSet.has('word') ? habitSet.delete('word') : habitSet.add('word'); wt.classList.toggle('on', habitSet.has('word')); } });
  const wordRow = CFG.kalimati ? el('div', { class: 'sw' }, el('span', {}, 'كلمة اليوم (إنجليزي)'), wt) : el('div', { class: 'sw' }, el('span', {}, 'كلمة اليوم (إنجليزي)'), el('span', { class: 'chip gray' }, 'قريباً'));
  return [el('label', {}, 'الاسم'), name, el('label', {}, 'العمر'), age, el('label', {}, 'الخطة تبدأ من سورة'), start, el('div', { class: 'sw' }, el('span', {}, 'آية اليوم'), el('button', { class: 'toggle on', 'aria-label': 'آية اليوم', disabled: true })), wordRow,
    el('button', { class: 'btn', onclick: async () => { try { await api('v2/kids/' + k.id, 'PUT', { name: name.value, age: +age.value, start: +start.value, habits: [...habitSet] }); toast('تم الحفظ'); kidDetail(k.id); } catch (e) { toast(errMsg(e)); } } }, 'حفظ البيانات')];
}
function repeatsCard(k) {   // عدد التكرارات لكل مقطع صوتي (استماعاً ثم ترديداً)
  const cur = k.repeats || 10, d = el('div', { class: 'seg' }, [[10, '10 (الأكمل)'], [7, '7'], [5, '5'], [3, '3']].map(([v, t]) => el('button', { class: v === cur ? 'on' : '', onclick: async e => { try { await api('v2/kids/' + k.id, 'PUT', { repeats: v }); [...d.children].forEach(c => c.classList.toggle('on', c === e.target)); toast('تم ضبط التكرار'); } catch (er) { toast(errMsg(er)); } } }, t)));
  return el('div', { class: 'card' }, el('h2', {}, 'تكرار الحلقة'), el('p', { class: 'mute' }, 'كم مرة يستمع ولدك ثم يردد كل مقطع من الآية. الأكمل 10، وللأصغر أو الآيات الطويلة اختر أقل ليقصر الدرس.'), d);
}
function speedCard(k) {   // سرعة تشغيل القارئ: تسرّع الإيقاع مع بقاء الوقفات عند علامات الوقف
  const cur = k.speed || 1, d = el('div', { class: 'seg' }, [[1, '1× (الأبطأ)'], [1.15, '1.15×'], [1.25, '1.25× (الأسرع)']].map(([v, t]) => el('button', { class: v === cur ? 'on' : '', onclick: async e => { try { await api('v2/kids/' + k.id, 'PUT', { speed: v }); [...d.children].forEach(c => c.classList.toggle('on', c === e.target)); toast('تم ضبط السرعة'); } catch (er) { toast(errMsg(er)); } } }, t)));
  return el('div', { class: 'card' }, el('h2', {}, 'سرعة القارئ'), el('p', { class: 'mute' }, 'تسريع الصوت مع بقاء نبرته ووقفاته. للأصغر 1×، وللأكبر 1.25× ليكون الدرس أنشط.'), d);
}
function kidDetail(id) {
  guardianShell('kids', 'ملف الولد', f => {
    const idx = f.kids.findIndex(x => x.id === id), k = f.kids[idx];
    if (idx < 0) return empty('users', 'غير موجود', 'ربما حُذف هذا الملف.', el('button', { class: 'btn', onclick: () => go('kids') }, 'رجوع'));
    const rw = rewardEditor(k, { onSaved: () => { toast('تم حفظ المكافأة'); kidDetail(id); } });
    const inv = el('div', { class: 'card' }, el('div', { class: 'row sb' }, el('h2', { style: 'margin:0' }, 'الدعوة'), inviteChip(k)),
      el('p', { class: 'mute' }, k.invite && k.invite.status === 'claimed' ? 'ربط ولدك حسابه بملفه.' : 'أرسل الرابط ليفتحه ولدك ويسجّل دخوله فيرتبط بملفه.'),
      k.invite && k.invite.url ? el('button', { class: 'btn', onclick: () => shareInvite(k.name, k.invite.url) }, ic('share'), 'مشاركة رابط الدعوة') : '',
      el('button', { class: 'btn ghost', onclick: async () => { if (k.invite && k.invite.status === 'claimed' && !confirm('تجديد الدعوة يفصل حساب ولدك الحالي عن ملفه. متابعة؟')) return; try { await api(`v2/kids/${k.id}/invite`, 'POST', {}); toast('جُدّدت الدعوة'); kidDetail(id); } catch (e) { toast(errMsg(e)); } } }, 'تجديد الدعوة'));
    const edit = el('div', { class: 'card' }, el('h2', {}, 'البيانات والعادات'), skeleton(1));
    kidForm(k).then(form => edit.replaceChildren(el('h2', {}, 'البيانات والعادات'), ...form)).catch(() => edit.replaceChildren(errorBox(() => kidDetail(id))));
    return el('div', {}, el('div', { class: 'row', style: 'margin-bottom:12px' }, avatar(k.name, idx, 56), el('div', { class: 'grow' }, el('h1', { style: 'margin:0' }, k.name), statusChip(k))),
      ...(pendingBox(k) ? [pendingBox(k)] : []), inv,
      el('div', { class: 'card' }, el('h2', {}, 'المكافأة والنقاط'), el('p', { class: 'mute' }, 'كل يوم كامل = 100 نقطة. التطبيق لا يدفع؛ أنت تسلّم المكافأة.'), rw.node, el('button', { class: 'btn', onclick: async () => { try { await rw.save(); } catch (e) { toast(errMsg(e)); } } }, 'حفظ المكافأة')),
      repeatsCard(k),
      speedCard(k),
      el('div', { class: 'card' }, el('div', { class: 'sw' }, el('div', {}, el('h2', { style: 'margin:0' }, 'تسجيل التسميع'), el('div', { class: 'mute' }, 'يُسجَّل صوت ولدك أثناء التسميع ويبقى على جهازه 14 يوماً. وإن لم يتحقق التطبيق من تسميعه تصلك نسخة مؤقتة لتسمعها (تُحذف بعد قرارك أو بعد 72 ساعة).')),
        (() => { const t = el('button', { class: 'toggle' + (k.recordVoice !== false ? ' on' : ''), 'aria-label': 'تسجيل التسميع', onclick: async () => { const on = !t.classList.contains('on'); try { await api('v2/kids/' + k.id, 'PUT', { recordVoice: on }); t.classList.toggle('on', on); toast(on ? 'فُعّل التسجيل' : 'أُوقف التسجيل'); } catch (e) { toast(errMsg(e)); } } }); return t; })())),
      edit, el('button', { class: 'btn danger', onclick: async () => { if (await confirmTyped(`حذف ${k.name} وكل سجله نهائياً؟`)) { try { await api('v2/kids/' + k.id, 'DELETE'); go('kids'); } catch (e) { toast(errMsg(e)); } } } }, 'حذف الولد'));
  }, { back: 'kids' });
}
function newKid() { ls.set('ayah_j', '1'); jKids(); }

// ───── الابن ─────
const STABS = [['today', 'اليوم', 'today'], ['achv', 'إنجازي', 'star'], ['me', 'البروفايل', 'user']];
const curKid = () => { const id = ss.get('ayah_pick'); return ME.profiles.find(p => p.kidId === id) || (ME.profiles.length === 1 ? ME.profiles[0] : null); };
const unpick = () => { try { sessionStorage.removeItem('ayah_pick'); } catch (_) {} };
function picker() {
  mount([el('h1', {}, 'من يتعلم الآن؟'), el('p', { class: 'lead' }, 'اختر اسمك ليُسجَّل تقدّمك في ملفك.'), el('div', { class: 'pick' }, ME.profiles.map((p, i) => el('div', { class: 'card tap', onclick: () => { ss.set('ayah_pick', p.kidId); if (here() === 'today' || here() === '') route(); else go('today'); } }, avatar(p.name, i), el('h2', {}, p.name)))),
    el('button', { class: 'link', onclick: () => go('settings') }, 'الإعدادات')], true);
}
function studentShell(tab, title, build) {
  const p = curKid(); if (!p) return picker();
  const act = ME.profiles.length > 1 ? el('button', { class: 'chip', onclick: () => { unpick(); picker(); } }, 'تبديل ↔') : '';
  mount([header(title, { actions: act }), skeleton(3)]);
  api(`v2/kids/${p.kidId}/state`).then(s => { KS = s; root.replaceChildren(el('div', { class: 'screen' }, header(title, { actions: act }), build(s, p)), tabbar(STABS, tab)); window.scrollTo(0, 0); })
    .catch(e => { if (e.status === 401) { ls.del('ayah_session'); return boot(); } root.replaceChildren(el('div', { class: 'screen' }, header(title), errorBox(() => studentShell(tab, title, build))), tabbar(STABS, tab)); });
}
const lessonUrl = (id, kind, key, extra) => `/lesson/${id}?kind=${kind}${key ? '&key=' + key : ''}${extra ? '&extra=1' : ''}`;
function todayTab() {
  studentShell('today', 'اليوم', (s, p) => {
    const pts = s.points || {}, cards = [];
    const srOk = !!(window.SpeechRecognition || window.webkitSpeechRecognition) || window.NATIVE;
    if (!srOk) cards.push(el('div', { class: 'note', style: 'margin-bottom:12px' }, 'هذا المتصفح لا يدعم سماع التسميع بالصوت. افتح ثبات من Chrome (أندرويد أو كمبيوتر) أو من تطبيق ثبات، وإلا سيحتاج تسميعك إلى أن يسمعك أبوك ويؤكد.'));
    cards.push(el('div', { class: 'hero' }, el('div', { class: 'ringwrap' }, ring(Math.round(pts.pointsToday), 100, Math.round(pts.pointsToday)),
      el('div', {}, el('div', { class: 'mute' }, `السلام عليكم يا ${s.name}`), el('h1', { style: 'margin:2px 0' }, `نقاط اليوم: ${Math.round(pts.pointsToday)} من 100`), el('div', { class: 'mute' }, `${s.streak} ${s.streak === 1 ? 'يوم متواصل' : 'أيام متواصلة'}`)))));
    if (!s.finished) {
      if (s.newToday) cards.push(el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'avatar av0' }, ic('check')), el('div', { class: 'grow' }, el('h2', { style: 'margin:0' }, 'أحسنت! أتممت آية اليوم'), el('div', { class: 'mute' }, s.pending.length ? 'بانتظار تأكيد أبيك' : 'ثبّتها بالتدريب إن أردت'))),
        s.todayUnit ? el('button', { class: 'btn ghost', onclick: () => { location.href = lessonUrl(p.kidId, 'practice'); } }, `درّب ${s.todayUnit.name} ${s.todayUnit.i}`) : '',
        s.next && s.todayCount < 4 ? el('button', { class: 'btn gold', onclick: () => { location.href = lessonUrl(p.kidId, 'new', null, true); } }, `آية إضافية: ${s.next.name} ${s.next.i}`) : ''));
      else cards.push(el('div', { class: 'ayahcard' }, el('div', { class: 'tag' }, `آية اليوم · سورة ${s.next.name} — ${s.next.i}`), el('div', { class: 'q' }, s.next.t), el('button', { class: 'btn gold', onclick: () => { location.href = lessonUrl(p.kidId, 'new'); } }, 'ابدأ الآن')));
    } else cards.push(empty('star', 'ما شاء الله! أتممت خطتك', 'اطلب من أبيك خطة جديدة.'));
    if ((s.habits || []).includes('word') && CFG.kalimati) {   // كلمة اليوم (كلماتي): تُفتح برمز موقّع قصير العمر، والإنجاز يصلنا تلقائياً
      const wd = s.habitsDone && s.habitsDone.word;
      cards.push(el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'avatar av2' }, wd ? ic('check') : ic('star')), el('div', { class: 'grow' }, el('h2', { style: 'margin:0' }, 'كلمة اليوم'), el('div', { class: 'mute' }, wd ? 'أحسنت! أتممت كلمات اليوم' : 'تعلّم كلمات إنجليزية جديدة وراجع السابقة'))),
        el('button', { class: wd ? 'btn ghost' : 'btn gold', onclick: async () => { try { const r = await api(`v2/kids/${p.kidId}/habit-token?habit=word`); location.href = r.url; } catch (e) { toast(errMsg(e)); } } }, wd ? 'راجع مرة أخرى' : 'ابدأ كلمة اليوم')));
    }
    if (s.reviews.length) cards.push(el('div', { class: 'card' }, el('h2', {}, 'مراجعة اليوم'), s.reviews.map(u => el('button', { class: 'btn ghost', onclick: () => { location.href = lessonUrl(p.kidId, 'review', u.key); } }, `راجع: ${u.name} ${u.i}`))));
    return el('div', {}, cards);
  });
}
const weekBars = recent => el('div', { class: 'week' }, recent.map(d => { let l = ''; try { l = new Date(d.date + 'T00:00:00Z').toLocaleDateString('ar', { weekday: 'short', timeZone: 'UTC' }); } catch (_) {}
  return el('div', { class: 'b' }, el('span', { class: 'v' }, Math.round(d.pts)), el('i', { style: `height:${Math.max(4, Math.round(d.pts * 0.62))}px;${d.pts ? '' : 'background:var(--line)'}` }), el('span', { class: 'd' }, l)); }));
function recordingsCard() {   // تسجيلاتي: محفوظة على هذا الجهاز فقط 14 يوماً
  const box = el('div', { class: 'card' }, el('h2', {}, 'تسجيلاتي'), el('p', { class: 'mute' }, 'تُحفظ على هذا الجهاز فقط 14 يوماً ثم تُحذف.'));
  const p = curKid(); if (!p || typeof Rec === 'undefined' || !Rec.supported()) return '';
  Rec.purge().catch(() => {}).then(() => Rec.list(p.kidId)).then(list => {
    if (!list.length) { box.append(el('p', { class: 'mute' }, 'لا توجد تسجيلات بعد.')); return; }
    list.forEach(r => { const row = el('div', { class: 'kidmini' }, el('div', { class: 'grow' }, el('h3', {}, r.label), el('div', { class: 'mute' }, r.date)),
      el('button', { class: 'btn sm ghost', onclick: () => { const a = el('audio', { controls: true, autoplay: true, src: URL.createObjectURL(r.blob), style: 'width:100%' }); row.after(a); } }, '▶'),
      el('button', { class: 'btn sm danger', onclick: async () => { await Rec.remove(r.id); row.remove(); } }, 'حذف')); box.append(row); });
  }).catch(() => box.append(el('p', { class: 'mute' }, 'تعذّر قراءة التسجيلات.')));
  return box;
}
function achvTab() {
  studentShell('achv', 'إنجازي', s => {
    const pts = s.points || {};
    return el('div', {}, el('div', { class: 'card' }, el('div', { class: 'stats' }, [[s.memorized, 'آية محفوظة'], [s.streak, 'أيام متواصلة'], [s.weekNew + '/7', 'هذا الأسبوع']].map(([v, l]) => el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, l)))), el('div', { class: 'dots' }, s.last14.map(on => el('i', { class: 'dot' + (on ? ' on' : '') })))),
      el('div', { class: 'card' }, el('h2', {}, 'نقاط آخر 7 أيام'), el('p', { class: 'mute' }, 'اليوم الكامل = 100 نقطة'), weekBars(s.recent || [])),
      recordingsCard(),
      el('div', { class: 'card' }, el('h2', {}, 'نقاط هذه الدورة'), el('div', { class: 'pts' }, el('b', {}, Math.round(pts.points)), el('span', { class: 'mute' }, `من ${pts.maxPoints}`)), el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, Math.round(100 * pts.points / pts.maxPoints))}%` })),
        pts.mode !== 'none' && pts.showMoney ? el('p', { class: 'mute' }, `مكافأتك حتى الآن: ${pts.earned} من ${pts.amount} ريال`) : el('p', { class: 'mute' }, 'استمر كل يوم لتصل إلى أعلى نقاطك.')));
  });
}
function meTab() {
  studentShell('me', 'البروفايل', (s, p) => el('div', {}, el('div', { class: 'hero', style: 'text-align:center' }, el('div', { class: 'avatar av0', style: 'margin:0 auto 10px;width:70px;height:70px;font-size:2rem;background:#ffffff26' }, initial(s.name)), el('h1', {}, s.name), el('div', { class: 'mute' }, `عائلة ${p.family}`)),
    ME.profiles.length > 1 ? el('button', { class: 'btn ghost', onclick: () => { unpick(); picker(); } }, 'تبديل الولد') : '',
    window.NATIVE ? reminderCard() : '', el('button', { class: 'btn ghost', onclick: () => go('settings') }, ic('gear'), 'الإعدادات')));
}

// ───── التوجيه والإقلاع ─────

// ───── دليل الأب: كيف تدير أولادك برحلة تعليمية ─────
const GUIDE = [
  ['ابدأ في خمس دقائق', ['أضف ولدك باسمه وعمره فقط، فالخطة تُضبط بحسب عمره.', 'حدّد المكافأة إن أردت، أو تجاوزها وعُد لها لاحقاً من صفحته.', 'أرسل له رابط الدعوة من جواله، فيفتحه ويسجّل دخوله ويرتبط بملفه تلقائياً.', 'اجلس معه في أول يوم مدة خمس دقائق ليرى أن الأمر خفيف وليس عبئاً.']],
  ['أول ثلاثة أيام: اجلس بجانبه', ['دعه يستمع للآية ويردد خلف القارئ كما في الحلقة، ولا تكثر التصحيح.', 'امدح التزامه قبل إتقانه: «جاء وقتك وبدأتَ بنفسك» أنفع من «أخطأتَ هنا».', 'إن تعثّر في كلمة فاتركها لحلقة الغد، فالمراجعة المتباعدة تعالج الكلمات الضعيفة.', 'ثلاثة أيام متواصلة تبني العادة أكثر من يوم طويل واحد.']],
  ['كيف تؤكد التسميع', ['عندما لا يستطيع التطبيق سماع ولدك ويطلب تأكيدك، تجد بطاقة «تسميع ينتظر تأكيدك» في الرئيسية.', 'اضغط ▶ واستمع للتسجيل. إن سمعتَ الآية صحيحة فاضغط «سمعتُه وصحّ».', 'إن لم تسمع أو لم تكن الآية صحيحة فاضغط «لم أسمعه»، فيعيدها ولا تُحسب نقاطه.', 'إن سُجّل التسميع على ولد خطأً فاختر أخاه وانقله بزر «نقل».']],
  ['اليوم الفائت بلا عقاب', ['يفوت اليوم أحياناً: مرض أو سفر أو انشغال. لا تجعلها معركة.', 'يوم الراحة الأسبوعي وإجازات الشهر لا تدخل حساب النقاط، فلا يُظلَم ولدك.', 'ابدأ الغد كأن شيئاً لم يكن؛ المهم أن تعود العادة، لا أن لا تنقطع أبداً.', 'خفّف الخطة مؤقتاً إن رأيتَ ثقلاً: آية أقصر خير من ترك كامل.']],
  ['المكافأة: كيف تقدّمها وتتحدث عنها', ['قرّر المبلغ قبل بدء الشهر واشرح لولدك القاعدة: كل يوم كامل يقرّبه من المبلغ كله.', 'التطبيق يحسب ما يستحقه ولا يدفع، فسلّمه في موعده كما وعدتَه ولو كان أقل من السقف.', 'اجعل الحديث عن المكافأة تقديراً لجهده، وعن الحفظ نفسه فضلاً ونعمة، حتى لا يصير المال هو الغاية.', 'يمكنك إخفاء المبلغ عن ولدك وإظهار نقاطه فقط.']],
  ['متى ترفع الصعوبة', ['بعد أسبوعين من الالتزام السهل يمكنك البدء بسورة أطول أو آية أطول.', 'لا تقفز بولد صغير؛ الثبات على القليل أنفع من البدء بالكثير ثم الترك.', 'راقب زمن الدرس في «التقدّم»: إن طال كثيراً فالخطة أثقل مما ينبغي.', 'غيّر سورة البداية من صفحة الولد متى شئت.']],
  ['بعد الشهر الأول', ['اجلس مع ولدك وراجعوا معاً ما حفظ وكم يوماً التزم، وهنّئه.', 'سلّمه مكافأته، ثم اتفقوا على هدف الشهر التالي.', 'أضف عادة ثانية حين تثبت الأولى، فلا تحمّله عادتين في أسبوع واحد.', 'ثباتك أنت في المتابعة أهم من أي إعداد في التطبيق.']],
];
function guideScreen() {
  const idx = +(here().split('/')[1] || -1);
  if (idx >= 0 && GUIDE[idx]) { const [t, pts] = GUIDE[idx];
    mount([header(t, { back: 'guide' }), el('div', { class: 'card' }, el('ol', { style: 'margin:0;padding-inline-start:20px;line-height:2' }, pts.map(x => el('li', {}, x)))),
      idx < GUIDE.length - 1 ? el('button', { class: 'btn', onclick: () => go('guide/' + (idx + 1)) }, 'التالي: ' + GUIDE[idx + 1][0]) : el('button', { class: 'btn', onclick: () => go('home') }, 'إلى الرئيسية')]); root.append(tabbar(GTABS, 'profile')); return; }
  mount([header('دليل الأب', { back: 'profile' }), el('p', { class: 'lead' }, 'سبع بطاقات قصيرة تعينك على إدارة رحلة أولادك بهدوء.'), GUIDE.map(([t, pts], i) => el('div', { class: 'card tap', onclick: () => go('guide/' + i) }, el('div', { class: 'row' }, el('div', { class: 'avatar av' + (i % 5) }, i + 1), el('div', { class: 'grow' }, el('h2', { style: 'margin:0' }, t), el('div', { class: 'mute' }, pts[0]))))) ]);
  root.append(tabbar(GTABS, 'profile'));
}
function checklistCard(f) {   // «ابدأ في 5 دقائق»: تظهر حتى تكتمل
  const k = f.kids, steps = [['سمِّ العائلة', true, () => go('profile')], ['أضف ولداً', k.length > 0, () => go('kid/new')], ['حدّد المكافأة', k.some(x => x.points && x.points.mode !== 'none'), () => k[0] ? go('kid/' + k[0].id) : go('kid/new')],
    ['أرسل الدعوة وليرتبط ولدك', k.some(x => x.invite && x.invite.status === 'claimed'), () => k[0] ? go('kid/' + k[0].id) : go('kid/new')], ['أول درس لولدك', k.some(x => x.memorized > 0 || x.streak > 0), () => go('guide/0')]];
  if (ls.get('ayah_chk_done') || steps.every(x => x[1])) { if (steps.every(x => x[1])) ls.set('ayah_chk_done', '1'); return null; }
  const done = steps.filter(x => x[1]).length;
  return el('div', { class: 'card' }, el('div', { class: 'row sb' }, el('h2', { style: 'margin:0' }, 'ابدأ في 5 دقائق'), el('span', { class: 'chip' }, `${done}/5`)), el('div', { class: 'bar' }, el('i', { style: `width:${done * 20}%` })),
    steps.map(([t, ok, fn]) => el('div', { class: 'sw tap', style: 'cursor:pointer', onclick: fn }, el('span', { style: ok ? 'color:var(--mute);text-decoration:line-through' : 'font-weight:700' }, t), ok ? el('span', { class: 'chip ok' }, ic('check', '')) : el('span', { class: 'chip warn' }, 'الآن'))),
    el('button', { class: 'link', onclick: () => go('guide') }, 'اقرأ دليل الأب'));
}
function guardianRoute() {
  const h = here(), m = /^kid\/(.+)$/.exec(h);
  if (h === 'guide' || /^guide\/\d+$/.test(h)) return guideScreen();
  if (m && m[1] === 'new') return newKid();
  if (m) return kidDetail(m[1]);
  ({ home: homeTab, kids: kidsTab, habits: habitsTab, progress: progressTab, profile: profileTab, settings: settingsScreen }[h] || homeTab)();
}
function route() {
  if (!ME) return;
  const ob = ME.onboarding;
  if (ME.account.role !== 'student' && (ob === 'family' || ob === 'kid' || ls.get('ayah_j'))) return journey();
  if (ob === 'invite') return iAmKid();
  if (ME.account.role === 'guardian') return guardianRoute();
  if (here() === 'settings') return settingsScreen();
  if (!curKid()) return picker();
  ({ today: todayTab, achv: achvTab, me: meTab }[here()] || todayTab)();
}
async function boot() {
  try { CFG = await api('auth/config'); } catch (_) {}
  const m = /^\/i\/([\w-]+)/.exec(location.pathname);
  if (m) { ls.set('ayah_invite', m[1]); history.replaceState(null, '', '/app'); }
  const inv = ls.get('ayah_invite');
  if (!ls.get('ayah_session')) {
    if (inv) { try { return signin(await api('v2/invites/' + inv)); } catch (_) { ls.del('ayah_invite'); return inviteProblem('الدعوة غير صالحة', 'قد تكون أُلغيت أو استُخدمت. اطلب من أبيك دعوة جديدة.'); } }
    return signin(null);
  }
  try { await refreshMe(); } catch (e) { if (e.status === 401) { ls.del('ayah_session'); return boot(); } return mount([errorBox(boot)], true); }
  if (inv) return claimInvite(inv);
  route();
}
window.addEventListener('hashchange', () => { if (ME) route(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && ME && ME.account.role === 'guardian' && !/^(kid\/|settings)/.test(here()) && !ls.get('ayah_j')) route(); });
boot();
