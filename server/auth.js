'use strict';
// دخول الأب بـ Google / Apple عبر تدفق المتصفح (code flow) من الخادم — لا إضافات أصلية في التطبيق.
// الابن لا يدخل: رابطه الخاص (/k/<token>) يفتح التطبيق مباشرة عبر الروابط العميقة ويبقى محفوظاً على الجهاز.
// لا نخزّن بريداً ولا اسماً: هوية الحساب = provider:sub فقط.
const crypto = require('crypto');
const fs = require('fs');

const E = process.env;
const CFG = {
  google: {
    id: E.GOOGLE_CLIENT_ID, secret: E.GOOGLE_CLIENT_SECRET,
    auth: E.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
    token: E.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
    jwks: E.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs',
    iss: ['https://accounts.google.com', 'accounts.google.com'],
  },
  apple: {
    id: E.APPLE_SERVICE_ID, team: E.APPLE_TEAM_ID, key: E.APPLE_KEY_ID, p8: E.APPLE_KEY_P8,
    auth: E.APPLE_AUTH_URL || 'https://appleid.apple.com/auth/authorize',
    token: E.APPLE_TOKEN_URL || 'https://appleid.apple.com/auth/token',
    jwks: E.APPLE_JWKS_URL || 'https://appleid.apple.com/auth/keys',
    iss: ['https://appleid.apple.com'],
  },
};
const configured = p => p === 'google' ? !!(CFG.google.id && CFG.google.secret) : !!(CFG.apple.id && CFG.apple.team && CFG.apple.key && CFG.apple.p8);

const b64u = b => Buffer.from(b).toString('base64url');
function appleSecret() {   // client_secret لـ Apple: JWT بتوقيع ES256 من مفتاح .p8
  const a = CFG.apple, now = Math.floor(Date.now() / 1000);
  const pem = a.p8.includes('BEGIN') ? a.p8 : fs.readFileSync(a.p8, 'utf8');
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: a.key, typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: a.team, iat: now, exp: now + 600, aud: 'https://appleid.apple.com', sub: a.id }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: pem, dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + b64u(sig);
}

const jwksCache = {};
async function jwk(url, kid) {
  const c = jwksCache[url];
  if (!c || Date.now() - c.t > 3600e3 || !c.keys.find(k => k.kid === kid)) {
    const r = await fetch(url); if (!r.ok) throw new Error('jwks');
    jwksCache[url] = { t: Date.now(), keys: (await r.json()).keys };
  }
  return jwksCache[url].keys.find(k => k.kid === kid);
}
async function verifyIdToken(provider, idt, nonce) {
  const c = CFG[provider], [h, b, s] = String(idt).split('.');
  if (!s) throw new Error('bad token');
  const head = JSON.parse(Buffer.from(h, 'base64url')), pay = JSON.parse(Buffer.from(b, 'base64url'));
  if (head.alg !== 'RS256') throw new Error('alg');
  const k = await jwk(c.jwks, head.kid); if (!k) throw new Error('kid');
  const ok = crypto.verify('sha256', Buffer.from(h + '.' + b), crypto.createPublicKey({ key: k, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('signature');
  if (!c.iss.includes(pay.iss) || pay.aud !== c.id || pay.exp * 1000 < Date.now() || !pay.sub) throw new Error('claims');
  if (nonce && pay.nonce !== nonce) throw new Error('nonce');
  return provider + ':' + pay.sub;
}

const STATES = new Map(), TICKETS = new Map();   // في الذاكرة: تنتهي بعد دقائق
const sweep = m => { const t = Date.now(); for (const [k, v] of m) if (v.exp < t) m.delete(k); if (m.size > 2000) m.clear(); };
const rid = (n = 24) => crypto.randomBytes(n).toString('base64url');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(title, body) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f3d33;color:#fff;font-family:system-ui,Tahoma,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
.c{max-width:420px}h1{font-size:1.4rem}p{line-height:1.8;opacity:.9}a.b,button{display:inline-block;margin-top:14px;font:inherit;font-size:1.05rem;padding:12px 28px;border-radius:999px;border:0;background:#c8962e;color:#17352d;font-weight:700;text-decoration:none}</style></head><body><div class="c">${body}</div></body></html>`;
}

// ctx: { db, save, rid, today, ORIGIN, send, readBody, famByParent }
function mount(ctx) {
  const { db, save, ORIGIN, send } = ctx;
  const html = (res, code, title, body) => send(res, code, page(title, body), 'text/html; charset=utf-8');
  const formBody = req => new Promise((ok, no) => {
    let b = ''; req.on('data', c => { b += c; if (b.length > 20000) { no(new Error('big')); req.destroy(); } });
    req.on('end', () => ok(Object.fromEntries(new URLSearchParams(b))));
  });
  const famOf = ident => db.families.find(f => (f.owners || []).includes(ident));

  async function finish(res, st, ident) {
    let f, link = st.link ? ctx.famByParent(st.link) : null;
    if (st.link && !link) return html(res, 400, 'خطأ', '<h1>رابط الأب غير صحيح</h1>');
    const mine = famOf(ident);
    if (link) {
      if (mine && mine !== link) return html(res, 409, 'الحساب مرتبط', '<h1>هذا الحساب مرتبط بعائلة أخرى</h1><p>لا يمكن ربطه بهذه العائلة.</p>');
      link.owners = link.owners || []; if (!link.owners.includes(ident)) link.owners.push(ident);
      await save(); f = link;
    } else if (mine) f = mine;
    else if (process.env.ALLOW_SIGNUP === '1') {
      f = { id: ctx.rid(6), name: 'عائلتي', parentToken: ctx.rid(), kids: [], created: ctx.today(), owners: [ident] };
      db.families.push(f); await save();
    } else return html(res, 403, 'الحساب غير مرتبط', '<h1>هذا الحساب غير مرتبط بعائلة</h1><p>افتح رابط الأب الخاص بك مرة واحدة ثم اضغط «ربط حسابي بـ Google/Apple». بعدها يدخلك الحساب مباشرة.</p>');
    sweep(TICKETS); const t = rid(); TICKETS.set(t, { parent: f.parentToken, exp: Date.now() + 120e3 });
    const dest = st.app ? `thabat://auth?t=${t}` : `${ORIGIN}/auth/done?t=${t}`;
    if (!st.app) { res.writeHead(302, { Location: dest, 'Cache-Control': 'no-store' }); return res.end(); }
    // من التطبيق: نفتح التطبيق عبر المخطط، وزر احتياطي إن لم يفتح تلقائياً
    return html(res, 200, 'تم الدخول', `<h1>تم تسجيل الدخول ✅</h1><p>جارٍ فتح التطبيق…</p><a class="b" href="${dest}">افتح التطبيق</a><script>setTimeout(function(){location.href=${JSON.stringify(dest)}},300)</script>`);
  }

  return async function handle(req, res, url, p) {
    let m;
    if ((m = /^\/auth\/start\/(google|apple)$/.exec(p)) && req.method === 'GET') {
      const prov = m[1];
      if (!configured(prov)) return html(res, 503, 'غير مفعّل', `<h1>الدخول بـ ${prov === 'google' ? 'Google' : 'Apple'} لم يُفعَّل بعد</h1><p>سيُفعَّل قريباً.</p>`);
      const link = url.searchParams.get('link') || '';
      sweep(STATES); const state = rid(), nonce = rid(12);
      STATES.set(state, { prov, nonce, app: url.searchParams.get('app') === '1', link, exp: Date.now() + 600e3 });
      const c = CFG[prov], q = new URLSearchParams({
        client_id: c.id, redirect_uri: `${ORIGIN}/auth/callback/${prov}`, response_type: 'code', state, nonce,
        scope: prov === 'google' ? 'openid' : 'openid', ...(prov === 'apple' ? { response_mode: 'form_post' } : {}) });
      res.writeHead(302, { Location: c.auth + '?' + q, 'Cache-Control': 'no-store' }); return res.end();
    }
    if ((m = /^\/auth\/callback\/(google|apple)$/.exec(p))) {
      const prov = m[1];
      const q = req.method === 'POST' ? await formBody(req) : Object.fromEntries(url.searchParams);
      const st = STATES.get(q.state); STATES.delete(q.state);
      if (!st || st.prov !== prov || st.exp < Date.now() || !q.code) return html(res, 400, 'خطأ', '<h1>انتهت صلاحية المحاولة</h1><p>ارجع وأعد تسجيل الدخول.</p>');
      try {
        const c = CFG[prov];
        const r = await fetch(c.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code: q.code, client_id: c.id, redirect_uri: `${ORIGIN}/auth/callback/${prov}`,
            client_secret: prov === 'google' ? c.secret : appleSecret() }) });
        const j = await r.json(); if (!r.ok || !j.id_token) throw new Error('token');
        return await finish(res, st, await verifyIdToken(prov, j.id_token, st.nonce));
      } catch (e) { console.error('auth', prov, e.message); return html(res, 400, 'تعذّر الدخول', '<h1>تعذّر تسجيل الدخول</h1><p>حاول مرة أخرى.</p>'); }
    }
    if (p === '/api/auth/redeem' && req.method === 'POST') {
      const b = await ctx.readBody(req), t = TICKETS.get(String(b.t || '')); TICKETS.delete(String(b.t || ''));
      if (!t || t.exp < Date.now()) return send(res, 400, { error: 'انتهت صلاحية الدخول' });
      return send(res, 200, { parent: t.parent });
    }
    if (p === '/api/auth/config' && req.method === 'GET') return send(res, 200, { google: configured('google'), apple: configured('apple'), signup: process.env.ALLOW_SIGNUP === '1' });
    return false;
  };
}
module.exports = { mount, verifyIdToken, appleSecret };
