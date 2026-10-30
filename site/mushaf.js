'use strict';
// صفحة مصحف المدينة (مجمع الملك فهد، 15 سطراً) بخطوط كل صفحة: عرض الآية في مكانها وإخفاء كلماتها فيه
// البيانات: data/pages/p<N>.json (من tools/build_pages.py) + data/loc.json (موضع كل آية)
const Mushaf = (() => {
  const P = {}, F = {};
  let LOC = null, CNT = null, NAMES = null;
  const j = u => fetch(u).then(r => r.json());
  const pageData = n => (P[n] = P[n] || j(`/data/pages/p${n}.json`));
  const fontOf = n => (F[n] = F[n] || new FontFace('QCF' + n, `url(/fonts/p${n}.woff2)`).load().then(f => { document.fonts.add(f); }));
  const vk = key => (+key.slice(0, 3)) + ':' + (+key.slice(3));
  const BISM = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

  async function init() {
    if (LOC) return;
    const q = await j('/data/quran.json');
    LOC = await j('/data/loc.json'); CNT = Object.fromEntries(q.map(s => [s.n, s.ayahs.length]));
    NAMES = Object.fromEntries(q.map(s => [s.n, s.name.replace(/[\u064B-\u0652\u0670]/g, '').replace('ٱ', 'ا')]));
  }

  // موضع الآية من الصفحة
  function describe(key) {
    const seg = LOC && LOC[key]; if (!seg) return null;
    const [page, l1, l2] = seg[0], last = page === 1 ? 8 : 15;
    const frac = last > 1 ? ((l1 + l2) / 2 - 1) / (last - 1) : 0;
    const zone = frac < 0.34 ? 'أعلى' : frac < 0.67 ? 'وسط' : 'أسفل';
    const right = page % 2 === 1; // الفردية على يمين المصحف المفتوح
    return {
      page, l1, l2, last, zone, right, more: seg.length > 1,
      text: `صفحة ${page} (${right ? 'اليمنى' : 'اليسرى'}) · ${l1 === l2 ? 'السطر ' + l1 : `من السطر ${l1} إلى ${l2}`} · ${zone} الصفحة`,
    };
  }

  // شارة صغيرة: ورقة مصغرة عليها شريط في موضع الآية + نص الموضع
  function chip(key) {
    const d = describe(key); if (!d) return el('span');
    const top = ((d.l1 - 1) / d.last) * 100, h = Math.max(((d.l2 - d.l1 + 1) / d.last) * 100, 9);
    return el('div', { class: 'lchip' },
      el('div', { class: 'minipage' }, el('i', { style: `top:${top}%;height:${h}%` })),
      el('div', {}, el('b', {}, `صفحة ${d.page}`), el('div', { class: 'mute' }, d.text.replace(/^صفحة \d+ /, ''))));
  }

  // يرسم الصفحة داخل host. opts.focus = مفتاح آية للتلوين/الإخفاء
  async function render(host, focusKey) {
    await init();
    const d = describe(focusKey), n = d.page;
    const [data] = await Promise.all([pageData(n), fontOf(n)]);
    const fvk = vk(focusKey);
    const root = el('div', { class: 'mpage', style: `font-family:'QCF${n}'` });
    const focus = [];
    // رأس الصفحة كالمصحف: الجزء يساراً واسم السورة يميناً
    let firstSurah = null;
    for (let L = 1; L <= data.last && !firstSurah; L++) { const w = (data.lines[L] || [])[0]; if (w) firstSurah = +w[0].split(':')[0]; }
    const juz = n === 1 ? 1 : Math.min(30, Math.floor((n - 2) / 20) + 1);
    root.append(el('div', { class: 'mhead' }, el('span', {}, 'سورة ' + (NAMES[firstSurah] || '')), el('span', {}, 'الجزء ' + juz)));
    for (let L = 1; L <= data.last; L++) {
      const ban = data.banners.find(b => b.line === L);
      if (ban) { root.append(el('div', { class: 'mban' }, el('span', {}, el('b', {}, 'سورة ' + ban.name)))); continue; }
      if (data.bism.includes(L)) { root.append(el('div', { class: 'mbis' }, BISM)); continue; }
      const ws = data.lines[L] || [], line = el('div', { class: 'mline' });
      ws.forEach(w => {
        const f = w[0] === fvk;
        const s = el('span', { class: 'mw' + (f ? ' f' : '') + (w[3] ? ' me' : '') }, w[2]);
        if (f && !w[3]) { focus.push(s); s.addEventListener('click', () => s.classList.toggle('h')); }
        line.append(s);
      });
      const lw = ws[ws.length - 1];
      if (lw && lw[3]) { const [c, a] = lw[0].split(':').map(Number); if (CNT[c] === a) line.classList.add('mc'); } // آخر آية في السورة: سطر مركّز
      root.append(line);
    }
    root.append(el('div', { class: 'mnum' }, el('span', {}, String(n))));
    host.replaceChildren(root);
    // ضبط حجم الخط ليتسع أعرض سطر في عرض الصفحة (أسطر المصحف مضبوطة العرض)
    const lines = [...root.querySelectorAll('.mline')];
    root.style.setProperty('--fs', '100px');
    lines.forEach(l => { l.style.width = 'max-content'; l.style.justifyContent = 'flex-start'; });
    const widest = Math.max(...lines.map(l => l.getBoundingClientRect().width));
    lines.forEach(l => { l.style.width = ''; l.style.justifyContent = ''; });
    const cs = getComputedStyle(root), avail = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let fs = Math.min(34, Math.floor((100 * avail * 0.98 / widest) * 10) / 10);
    root.style.setProperty('--fs', fs + 'px');
    for (let i = 0; i < 12 && lines.some(l => l.scrollWidth > l.clientWidth + 0.5); i++) { // تقريب الخط يوسّع الأسطر قليلاً: نصغّر حتى تتسع كلها
      fs = Math.floor(fs * 0.98 * 10) / 10; root.style.setProperty('--fs', fs + 'px');
    }
    return {
      el: root, words: focus, desc: d,
      // fn(i, total) → true للإخفاء؛ علامة نهاية الآية تبقى ظاهرة كمرساة
      setHidden(fn) { focus.forEach((s, i) => s.classList.toggle('h', !!fn(i, focus.length))); },
      setCur(fn) { focus.forEach((s, i) => s.classList.toggle('cur', !!fn(i))); },
      setDim(fn) { focus.forEach((s, i) => s.classList.toggle('dim', !!fn(i))); },
    };
  }
  return { init, describe, chip, render };
})();
