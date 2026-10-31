'use strict';
// تسجيل تسميع الولد: الاحتفاظ على جهازه (IndexedDB) 14 يوماً. نسخة مؤقتة تُرسل للخادم فقط للتسميع المعلّق بانتظار تأكيد الأب.
const Rec = (() => {
  const DB = 'thabat-rec', ST = 'recs', DAYS = 14;
  const open = () => new Promise((ok, no) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = async (mode, f) => { const db = await open(); return new Promise((ok, no) => { const t = db.transaction(ST, mode), rq = f(t.objectStore(ST)); t.oncomplete = () => { db.close(); ok(rq && rq.result); }; t.onerror = () => no(t.error); }); };
  const api = {
    supported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && window.indexedDB),
    save: (meta, blob) => tx('readwrite', s => s.put({ ...meta, blob })),
    list: async kidId => ((await tx('readonly', s => s.getAll())) || []).filter(x => !kidId || x.kidId === kidId).sort((a, b) => b.t - a.t),
    remove: id => tx('readwrite', s => s.delete(id)),
    async purge() { const cut = Date.now() - DAYS * 864e5; for (const r of (await tx('readonly', s => s.getAll())) || []) if (r.t < cut) await api.remove(r.id); },
    recorder() {
      let stream = null, mr = null, chunks = [], done = null, timer = null;
      const self = {
        async start() {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          const mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
          mr = new MediaRecorder(stream, { ...(mt ? { mimeType: mt } : {}), audioBitsPerSecond: 32000 }); chunks = [];
          mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
          done = new Promise(res => { mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(chunks.length ? new Blob(chunks, { type: mr.mimeType || mt || 'audio/webm' }) : null); }; });
          mr.start(1000); timer = setTimeout(() => self.stop(), 120000);   // حدّ أقصى دقيقتان
        },
        stop() { clearTimeout(timer); try { if (mr && mr.state !== 'inactive') mr.stop(); else if (stream) stream.getTracks().forEach(t => t.stop()); } catch (_) {} return done || Promise.resolve(null); },
        get active() { return !!mr && mr.state === 'recording'; },
      };
      return self;
    },
  };
  return api;
})();
