'use strict';
// أدوات مشتركة: الاتصال بالخادم + مقارنة التسميع بالنص
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  kids.flat().forEach(c => { if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(c)); });
  return e;
};
async function api(path, method = 'GET', body) {
  const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json', ...(() => { try { const s = localStorage.getItem('ayah_session'); return s ? { 'X-Session': s } : {}; } catch (_) { return {}; } })() }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'خطأ'), { status: r.status });
  return j;
}
const AR_DIGITS = n => String(n); // أرقام لاتينية: أوضح في الخط ولا تلخبط الاتجاه

// تطبيع النص العربي للمقارنة: إزالة التشكيل والتطويل وتوحيد الأشكال
function norm(s) {
  return String(s || '')
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^ء-غف-ي\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && lev(a, b) <= 1);

// يرجع {score, hit:[bool لكل كلمة متوقعة]} بمحاذاة LCS بين المتوقع والمسموع
function compare(expectedClean, heard) {
  const E = norm(expectedClean).split(' ').filter(Boolean);
  const H = norm(heard).split(' ').filter(Boolean);
  const n = E.length, m = H.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = same(E[i], H[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hit = new Array(n).fill(false);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (same(E[i], H[j])) { hit[i] = true; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return { score: n ? L[0][0] / n : 0, hit };
}
// دمج نتائج التعرّف على الكلام بلا تكرار: Chrome على أندرويد يعيد كل نتيجة تراكمية تشمل ما قبلها (فتتكرر الكلمة 4-5 مرات إن ضممنا النتائج)،
// فإذا بدأت نتيجة بنص السابقة (أو العكس) نأخذ الأطول فقط. alt = ترتيب البديل (0 الأرجح).
function joinResults(results, alt = 0) {
  const out = [];
  for (const r of Array.from(results || [])) {
    const p = String((r[alt] || r[0] || {}).transcript || '').trim(); if (!p) continue;
    const last = out[out.length - 1];
    if (last !== undefined && (p.startsWith(last) || last.startsWith(p))) out[out.length - 1] = p.length >= last.length ? p : last;
    else out.push(p);
  }
  return out.join(' ');
}
if (typeof module !== 'undefined') module.exports = { norm, compare, joinResults };
