'use strict';
// جسر التطبيق (Capacitor): يتذكّر رابط الولد/الأب على الجهاز، ويفتح الروابط العميقة، ويشغّل تذكيراً يومياً محلياً.
// في المتصفح العادي لا يفعل شيئاً سوى التذكّر.
(function () {
  const C = window.Capacitor, native = !!(C && C.isNativePlatform && C.isNativePlatform());
  window.NATIVE = native;
  try {
    const m = /^\/(k|p)\/([\w-]+)$/.exec(location.pathname);
    if (m) localStorage.setItem(m[1] === 'k' ? 'ayah_kid' : 'ayah_parent', m[2]);
  } catch (_) {}
  if (!native) { window.nativeBrowser = u => { location.href = u; }; return; }
  const P = C.Plugins || {};
  const open = raw => {
    try {
      const u = new URL(raw);
      if (u.protocol === 'thabat:') { location.href = '/auth/done?t=' + encodeURIComponent(u.searchParams.get('t') || ''); return; }
      if (/^\/(k|p)\/[\w-]+$/.test(u.pathname) || u.pathname === '/auth/done') location.href = u.pathname + u.search;
    } catch (_) {}
  };
  if (P.App) {
    P.App.addListener('appUrlOpen', e => open(e.url));
    P.App.getLaunchUrl && P.App.getLaunchUrl().then(r => { if (r && r.url) open(r.url); }).catch(() => {});
  }
  window.nativeBrowser = u => { const full = new URL(u, location.origin).href; if (P.Browser) P.Browser.open({ url: full }); else location.href = full; };
  window.closeNativeBrowser = () => { try { P.Browser && P.Browser.close(); } catch (_) {} };
  // WebView لا يدعم Web Speech API: نحوّل SpeechRecognition إلى إضافة التعرّف الأصلية (أندرويد/iOS) بالواجهة نفسها
  const SRP = P.SpeechRecognition;
  if (SRP) {
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      constructor() { this.lang = 'ar-SA'; this.continuous = true; this.interimResults = true; this.maxAlternatives = 3; this._live = false; }
      async start() {
        try {
          const perm = await SRP.requestPermissions();
          if (perm.speechRecognition !== 'granted') { this.onerror && this.onerror({ error: 'not-allowed' }); this.onend && this.onend(); return; }
          this._live = true; this._hs = [];
          this._hs.push(await SRP.addListener('partialResults', d => {
            const m = (d && d.matches) || []; if (!m.length || !this._live) return;
            this.onresult && this.onresult({ results: [m.slice(0, 3).map(t => ({ transcript: t }))] });
          }));
          this._hs.push(await SRP.addListener('listeningState', s => { if (s && s.status === 'stopped') this._end(); }));
          await SRP.start({ language: this.lang, maxResults: 3, partialResults: true, popup: false });
        } catch (e) { this.onerror && this.onerror({ error: 'audio-capture' }); this._end(); }
      }
      stop() { try { SRP.stop(); } catch (_) {} setTimeout(() => this._end(), 150); }
      _end() { if (!this._live) return; this._live = false; (this._hs || []).forEach(h => { try { h.remove(); } catch (_) {} }); this.onend && this.onend(); }
    };
  }
  // تذكير يومي محلي بلا خادم
  window.setDailyReminder = async hhmm => {
    const LN = P.LocalNotifications; if (!LN) return false;
    const perm = await LN.requestPermissions(); if (perm.display !== 'granted') return false;
    await LN.cancel({ notifications: [{ id: 1 }] });
    const [h, m] = hhmm.split(':').map(Number);
    await LN.schedule({ notifications: [{ id: 1, title: 'ثبات', body: 'حان وقت عاداتك اليوم 🌙', schedule: { on: { hour: h, minute: m }, allowWhileIdle: true } }] });
    try { localStorage.setItem('ayah_rem', hhmm); } catch (_) {}
    return true;
  };
})();
