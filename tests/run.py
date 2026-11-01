#!/usr/bin/env python3
"""اختبارات آية اليوم الشاملة (تُشغَّل على GitHub لا على السيرفر): بيانات، صفحات المصحف، ظهور الآية بلا تمرير لكل الآيات،
محاكاة درس كاملة بساعة مزيفة (عشر استماعات + عشر ترديدات + تسميع)، وزمن الدرس."""
import json, os, re, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); SITE = ROOT + '/site'; OUT = ROOT + '/out'; os.makedirs(OUT, exist_ok=True)
B = 'http://127.0.0.1:3100'; RES = []; FAILS = 0
def check(name, ok, detail=''):
    global FAILS; FAILS += 0 if ok else 1; RES.append({'test': name, 'ok': bool(ok), 'detail': detail}); print(('PASS ' if ok else 'FAIL ') + name, detail if not ok or len(str(detail)) < 200 else str(detail)[:200], flush=True)
q = json.load(open(SITE + '/data/quran.json')); plan = json.load(open(SITE + '/data/plan.json'))
W = {f"{s['n']:03d}{i:03d}": a['t'].split(' ') for s in q for i, a in enumerate(s['ayahs'], 1)}
UN = {f"{s['n']:03d}{i:03d}": {'key': f"{s['n']:03d}{i:03d}", 'name': s['name'], 'i': i, 't': a['t'], 'c': a['c']} for s in q for i, a in enumerate(s['ayahs'], 1)}

# ───── ١. بيانات ─────
L = re.compile(r'[ء-يٱ]')
check('لا كلمة بلا حروف في النص', all(L.search(w) for ws in W.values() for w in ws))
pc = {}
for f in os.listdir(SITE + '/data/pages'):
    d = json.load(open(SITE + '/data/pages/' + f)); Ls = d['lines']
    for ln, ws in (Ls.items() if isinstance(Ls, dict) else enumerate(Ls)):
        for w in ws or []:
            if not w[3]: a, b = map(int, w[0].split(':')); pc['%03d%03d' % (a, b)] = pc.get('%03d%03d' % (a, b), 0) + 1
bad = [k for k in W if pc.get(k) != len(W[k])]
check('عدد كلمات النص = كلمات الصفحة (601 آية)', not bad, bad[:10])
badp = []
for k, p in plan.items():
    n = len(W[k])
    if 'fs' in p:
        idx = [s[0] for s in p['fs']]
        if idx != list(range(n)) or any(s[2] < s[1] for s in p['fs']) or p['fs'][-1][2] > p['df'] + .4: badp.append(k)
    for c in p.get('ch', []):
        if not (0 <= c[0] < c[1] <= n and 0 <= c[2] < c[3] <= p['df'] + .1): badp.append(k)
check('توقيت الكلمات سليم (الصوت السريع)', not badp, badp[:10])
MAN = json.load(open(os.path.join(ROOT, 'tools', 'manual_cuts.json'))) if os.path.exists(os.path.join(ROOT, 'tools', 'manual_cuts.json')) else {}
badcut = []
for k, pl in plan.items():
    for c in pl.get('ch', []):
        ln = c[1] - c[0]
        if ln < 3 or ln > 14 or (c[1] < len(W[k]) and not (any(m in W[k][c[1] - 1] for m in 'ۖۗۚۘ') or c[1] in MAN.get(k, []))): badcut.append((k, c[:2]))
check('تقسيم الآيات الطويلة عند علامات الوقف (صلى/قلى/ج/م) أو قطع يدوي، وكل قطعة 3–14 كلمة', not badcut, badcut[:6])
check('الآيات الطويلة مقسّمة', sum(1 for p in plan.values() if 'ch' in p) >= 10, sum(1 for p in plan.values() if 'ch' in p))

# ───── تشغيل الخادم ─────
tmp = tempfile.mkdtemp(); env = dict(os.environ, DATA_DIR=tmp, PORT='3100', TEST_AUTH='1')
srv = subprocess.Popen(['node', ROOT + '/server/server.js'], env=env, stdout=open(OUT + '/server.log', 'w'), stderr=subprocess.STDOUT); time.sleep(2)
def post(p, b): return json.load(urllib.request.urlopen(urllib.request.Request(B + p, data=json.dumps(b).encode(), headers={'Content-Type': 'application/json'})))
try:
    def acall(path, body, sess=None):
        h = {'Content-Type': 'application/json'}; sess and h.update({'X-Session': sess})
        return json.load(urllib.request.urlopen(urllib.request.Request(B + path, data=json.dumps(body).encode(), headers=h)))
    SESS = acall('/api/auth/test', {'ident': 'run-guardian'})['session']
    acall('/api/v2/family', {'name': 'ت'}, SESS); KID = {}
    for nm, age, st in (('ص', 6, 114), ('ك', 14, 67)): KID[nm] = acall('/api/v2/kids', {'name': nm, 'age': age, 'start': st}, SESS)['id']
    urllib.request.urlopen(urllib.request.Request(B + '/api/v2/kids/' + KID['ص'], data=json.dumps({'speed': 1.25}).encode(), headers={'Content-Type': 'application/json', 'X-Session': SESS}, method='PUT'))   # سرعة 1.25 كولد أكبر
    SESSJS = f"try{{localStorage.setItem('ayah_session','{SESS}')}}catch(e){{}}"
    DUR = {k: [v['ds'], v['df']] for k, v in plan.items()}
    INIT = """window.__DUR=%s;window.__plays=[];
window.Audio=class{constructor(s){this.src=s;const m=s.match(/(\\d{6})\\.mp3/);const k=m?m[1]:'114001';this.slow=s.includes('/audio/');this.duration=(window.__DUR[k]||[4,4])[this.slow?0:1];this.readyState=4;this.playbackRate=1;this._off=0;this._t0=null;this._tm=null}
 set currentTime(v){this._off=v} get currentTime(){return this._t0==null?this._off:this._off+(performance.now()-this._t0)/1000*this.playbackRate}
 play(){this._t0=performance.now();window.__plays.push([this.slow?'S':'F',this._off]);if(window.__hang)return new Promise(()=>{});this._tm=setTimeout(()=>{this.onended&&this.onended()},(this.duration-this._off)*1000/this.playbackRate);return Promise.resolve()}
 pause(){clearTimeout(this._tm);this._off=this.currentTime;this._t0=null}};
window.__say='';window.SpeechRecognition=class{start(){setTimeout(()=>{this.onresult&&this.onresult({results:[[{transcript:window.__say}]]})},80)}stop(){setTimeout(()=>this.onend&&this.onend(),20)}};""" % json.dumps(DUR)
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, locale='ar-SA'); ctx.add_init_script(INIT); ctx.add_init_script(SESSJS)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        # ───── ٢. صفحات المصحف (كل صفحة) ─────
        open(SITE + '/_t.html', 'w').write("""<script src=/common.js></script><script src=/mushaf.js></script><link rel=stylesheet href=/app.css><body class=paper><div id=a style='width:378px;margin:0 auto'></div>
<script>window.run=async(key)=>{await Mushaf.init();const c=await Mushaf.render(document.getElementById('a'),key);const r=document.querySelector('.mpage');
const lines=[...r.querySelectorAll('.mline')];return {over:lines.filter(l=>l.scrollWidth>l.clientWidth+0.5).length,fs:parseFloat(getComputedStyle(r).getPropertyValue('--fs')),h:Math.round(r.getBoundingClientRect().height)}}</script>""")
        loc = json.load(open(SITE + '/data/loc.json')); pages = {}
        for k, v in loc.items(): pages.setdefault(v[0][0], k)
        bad = []; fss = []
        for n, k in sorted(pages.items()):
            pg.goto(B + '/_t.html'); r = pg.evaluate(f"run('{k}')"); fss.append(r['fs'])
            if r['over']: bad.append((n, r))
        check('صفحات المصحف: لا تجاوز أسطر', not bad, bad); check('خط الصفحة', min(fss) >= 17, f'{min(fss)}–{max(fss)}px')
        os.remove(SITE + '/_t.html')
        # ───── ٣. الآية داخل النافذة بلا تمرير لكل آية ─────
        pg.goto(B + '/lesson/' + KID['ص']); pg.wait_for_selector('text=ابدأ الدرس'); pg.evaluate('window.__hang=true')
        keys = sorted(UN); out = []; t0 = time.time()
        for k in keys:
            pg.evaluate("(u)=>lesson(u,'review')", UN[k]); pg.wait_for_selector('.mpage .mw.f', timeout=15000); pg.wait_for_timeout(120)
            r = pg.evaluate("""()=>{const a=document.getElementById('app').getBoundingClientRect(),w=[...document.querySelectorAll('.mpage .mw.f')].map(x=>x.getBoundingClientRect());
              return {t:Math.min(...w.map(x=>x.top))-a.top,b:Math.max(...w.map(x=>x.bottom))-a.top,win:a.height,sy:scrollY,dh:document.documentElement.scrollHeight-innerHeight}}""")
            if r['t'] < -1 or r['b'] > r['win'] + 1 or r['sy'] or r['dh'] > 1: out.append((k, r))
        check(f'الآية ظاهرة بلا تمرير ({len(keys)} آية)', not out, out[:10]); print('geometry time', round(time.time() - t0))
        b.close()
        # ───── ٤. محاكاة دروس كاملة بساعة مزيفة ─────
        def sim(key, expect_chunk=None):
            ctx2 = b2.new_context(viewport={'width': 390, 'height': 844}, locale='ar-SA'); ctx2.add_init_script(INIT); ctx2.add_init_script(SESSJS); pg2 = ctx2.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e)))
            pg2.clock.install(); pg2.goto(B + '/lesson/' + KID['ص']); pg2.wait_for_selector('text=ابدأ الدرس'); pg2.evaluate("(u)=>lesson(u,'practice')", UN[key]); pg2.wait_for_selector('.mpage .mw.f'); pg2.add_style_tag(content='*{transition:none!important;animation:none!important}'); pg2.wait_for_timeout(300)
            chunked = 'ch' in plan[key]; ci = 0; clw = UN[key]['c'].split(' '); gmap = []; _w = 0
            for _t in clw: gmap.append(min(_w, len(W[key]) - 1)); _w += (_t != 'يا')
            seq = []; first_listens = 0; counting = True; t = 0; cur_n = 0; out_n = 0; maxsc = 1; mism = 0; stale = 0; blurred = 0; turn_bad = 0; saw_mine = 0; clicked = False
            while t < 2400:
                pg2.clock.run_for(1000); t += 1
                st = pg2.evaluate("""()=>{const tb=document.querySelector('.turn');const c=[...document.querySelectorAll('.zoombox .w')].findIndex(x=>x.classList.contains('cur'));const pc=document.querySelectorAll('.mpage .mw.cur').length;const cw=document.querySelector('.mpage .mw.f.cur'),ap=document.getElementById('app').getBoundingClientRect(),cr=cw?cw.getBoundingClientRect():null;const sc=new DOMMatrix(getComputedStyle(document.querySelector('.mpage')).transform).a;const cards=document.querySelectorAll('.zoombox .quran').length;
                  const op=x=>{const e=document.querySelector(x);return e?parseFloat(getComputedStyle(e).opacity):null};
                  return {b:tb?tb.textContent:'',c,pc,cards,sc,out:cr?(cr.left+cr.width/2<ap.left||cr.left+cr.width/2>ap.right||cr.top+cr.height/2<ap.top||cr.top+cr.height/2>ap.bottom):false,has:!!cr,tm:document.body.classList.contains('tm'),tl:document.body.classList.contains('tl'),zm:document.querySelector('.zoombox').classList.contains('mine'),op:op('.mpage .mw:not(.f)'),blur:getComputedStyle(document.querySelector('.mpage .mw:not(.f)')).filter,
                  dots:document.querySelectorAll('.dots2 i').length,ready:[...document.querySelectorAll('.dock .btn')].some(x=>x.textContent.includes('جاهز للتسميع')&&!x.disabled),fin:[...document.querySelectorAll('.dock .btn')].some(x=>x.textContent.includes('إنهاء الدرس')&&!x.disabled),stale:!!document.querySelector('.dock .mute.say,.dock .bar')}}""")
                if not seq or seq[-1] != st['b']: seq.append(st['b'])
                if counting and 'دورك' in st['b']: counting = False; first_listens = pg2.evaluate('window.__plays.length') - 1   # كم استماعاً سبق أول دور له
                if st['pc'] > 1 or st['cards']: mism += 1   # كلمة واحدة جارية، ولا بطاقة علوية
                if st['has']: cur_n += 1; out_n += st['out']; maxsc = max(maxsc, st['sc'])
                if st['stale']: stale += 1                  # لا عدّاد نصي ولا شريط تقدّم
                if st['blur'] not in ('none', ''): blurred += 1
                if st['tm']:
                    if not (st['zm'] and st['op'] is not None and st['op'] <= .1): turn_bad += 1   # شاشة دوره تتغيّر وتخفت الصفحة
                elif 'استمع' in st['b'] or 'اسمع' in st['b']:
                    if not (st['tl'] and not st['zm']): turn_bad += 1
                if 'دورك' in st['b']:
                    saw_mine += 1
                    if not clicked and saw_mine == 3: pg2.get_by_text('✓ انتهيت').click(); clicked = True
                if chunked and st['ready']:   # آية طويلة: بعد كل مقطع يأتي تسميعه (لا انتظار لنهاية الآية)
                    w0, w1 = plan[key]['ch'][ci][0], plan[key]['ch'][ci][1]; say = ' '.join(clw[j] for j in range(len(clw)) if w0 <= gmap[j] < w1)
                    pg2.get_by_text('جاهز للتسميع').click(); pg2.wait_for_selector('.mic'); pg2.wait_for_timeout(300)
                    pg2.evaluate("(s)=>window.__say=s", say); pg2.locator('.mic').click(force=True); pg2.clock.run_for(300); pg2.locator('.mic').click(force=True); pg2.clock.run_for(2000); pg2.wait_for_timeout(500)
                    ci += 1; continue
                if (chunked and st['fin']) or (not chunked and st['ready']): break
            plays = pg2.evaluate('window.__plays')
            return pg2, ctx2, {'secs': t, 'plays': len(plays), 'slow': sum(1 for x in plays if x[0] == 'S'), 'mism': mism, 'cur_n': cur_n, 'out_n': out_n, 'maxsc': maxsc, 'stale': stale, 'blurred': blurred, 'turn_bad': turn_bad, 'dots': st['dots'], 'first_listens': first_listens, 'seq': seq, 'ready': st['ready'] or st['fin'], 'recited': ci, 'mine': saw_mine}
        b2 = p.chromium.launch() if False else None
    with sync_playwright() as p2:
        b2 = p2.chromium.launch()
        for key, kind in (('114002', 'قصيرة'), ('098008', 'طويلة مقسّمة'), ('067003', 'الملك'), ('103003', 'بلا توقيت'), ('082006', 'يا أيها')):
            pg2, ctx2, r = sim(key)
            ch = 'ch' in plan[key]
            check(f'درس {kind} ({key}): ينتهي ويظهر «جاهز للتسميع»', r['ready'], f"{r['secs']:.0f}s")
            check(f'درس {kind}: كلمة جارية واحدة ولا بطاقة علوية', r['mism'] == 0, r['mism'])
            check(f'درس {kind}: الكاميرا تقترب (تكبير ≥1.4) وتبقى الكلمة الجارية داخل الشاشة', r['maxsc'] >= 1.4 and r['cur_n'] > 5 and r["out_n"] <= max(2, r["cur_n"] * .04), (round(r['maxsc'], 2), r['cur_n'], r['out_n']))
            check(f'درس {kind}: الصفحة بلا تمويه وبلا عدّاد/شريط', r['blurred'] == 0 and r['stale'] == 0, (r['blurred'], r['stale']))
            check(f'درس {kind}: شاشة «دورك» تختلف (إطار أخضر + صفحة تخفت) وشاشة الاستماع هادئة', r['turn_bad'] == 0, r['turn_bad'])
            check(f'درس {kind}: نقاط التقدّم للمجموعة الحالية (≤ 20 نقطة لا عشرات)', 6 <= r['dots'] <= 20, r['dots'])
            if not ch: check(f'درس {kind}: 10 استماعات تلقائية ثم 10 ترديدات (20 تشغيلاً، أولها بطيء)', r['plays'] == 20 and r['slow'] == 1, (r['plays'], r['slow']))
            else: check(f'درس {kind}: كل مقطع 10 استماعات + 10 ترديدات ثم الآية كاملة ×3 (استماعاً وترديداً)', r['plays'] == 20 * len(plan[key]['ch']) + 6, (r['plays'], len(plan[key]['ch'])))
            check(f'درس {kind}: يبدأ بعشر استماعات متتالية بلا فرصة ترديد في أول قراءة', r['first_listens'] >= 10, r['first_listens'])
            check(f'درس {kind}: بانر «دورك» يظهر', r['mine'] > 0, r['seq'][:4])
            check(f'درس {kind}: الزمن معقول (≤ 20 دقيقة بسرعة 1.25)', r['secs'] <= 1200, r['secs']); print('LESSON-TIME', key, round(r['secs']), flush=True)
            if ch:   # التسميع تمّ مقطعاً مقطعاً أثناء الدرس؛ الإنهاء بعد ربط المقاطع
                check(f'درس {kind}: تسميع كل مقطع على حدة ({len(plan[key]["ch"])} مقاطع)', r['recited'] == len(plan[key]['ch']), r['recited'])
                pg2.get_by_text('إنهاء الدرس').click(); pg2.wait_for_timeout(600)
                check(f'درس {kind}: يكتمل الإنجاز بتسميع المقاطع لا الآية كلها', pg2.get_by_text('ثبّتَّ').count() > 0, pg2.inner_text('body')[:80])
                ctx2.close(); continue
            # تسميع
            pg2.get_by_text('جاهز للتسميع').click(); pg2.wait_for_selector('.mic'); pg2.wait_for_timeout(300)
            check(f'التسميع {key}: الصفحة بألوانها (لا تعتيم) والميكروفون يستجيب', pg2.evaluate("parseFloat(getComputedStyle(document.querySelector('.mpage .mw:not(.f)')).opacity)") == 1 and pg2.evaluate("!document.querySelector('.mpage').classList.contains('dimrest')"), '')
            pg2.evaluate("(s)=>window.__say=s", UN[key]['c']); pg2.locator('.mic').click(force=True); pg2.clock.run_for(300); pg2.locator('.mic').click(force=True); pg2.clock.run_for(2000); pg2.wait_for_timeout(500)
            ok = pg2.get_by_text('ثبّتَّ').count() > 0
            check(f'تسميع صحيح {key} يُنجح', ok, pg2.inner_text('body')[:80])
            if key == '082006':
                pg2.close(); ctx2.close(); pg2, ctx2, _ = sim(key); pg2.get_by_text('جاهز للتسميع').click(); pg2.wait_for_selector('.mic')
                pg2.evaluate("()=>window.__say='ما غرك بربك الكريم'"); pg2.locator('.mic').click(force=True); pg2.clock.run_for(300); pg2.locator('.mic').click(force=True); pg2.clock.run_for(1500); pg2.wait_for_timeout(400)
                n = len(W[key]); check('تلوين نتيجة آية «يا أيها» (hit/miss بعدد كلماتها)', pg2.locator('.mpage .mw.f.hit, .mpage .mw.f.miss').count() == n and pg2.locator('.zoombox .quran').count() == 0, pg2.locator('.mpage .mw.f.hit').count())
            ctx2.close()
        # تغذية راجعة حيّة: الكلمات التي ينطقها تخضرّ أثناء دوره (تعرّف الكلام مُحاكى)
        ctx3 = b2.new_context(viewport={'width': 390, 'height': 844}, locale='ar-SA'); ctx3.add_init_script(INIT + "window.__fast=true;window.__live=true;"); ctx3.add_init_script(SESSJS); pg3 = ctx3.new_page(); pg3.on('pageerror', lambda e: errs.append(str(e)))
        pg3.goto(B + '/lesson/' + KID['ص']); pg3.wait_for_selector('text=ابدأ الدرس'); pg3.evaluate("(s)=>window.__say=s", UN['114002']['c']); pg3.evaluate("(u)=>lesson(u,'practice')", UN['114002']); pg3.wait_for_selector('.mpage .mw.f')
        seen = 0
        for _ in range(160):
            pg3.wait_for_timeout(250)
            if pg3.evaluate("document.body.classList.contains('tm')?document.querySelectorAll('.mpage .mw.f.hit').length:0"): seen += 1; break
        check('تعرّف حيّ: كلمات الطالب تخضرّ في دوره', seen > 0, seen)
        ctx3.close()
        b2.close()
    check('لا أخطاء جافاسكربت', not errs, errs[:5])
finally:
    srv.terminate()
json.dump({'fails': FAILS, 'results': RES}, open(OUT + '/results.json', 'w'), ensure_ascii=False, indent=1)
print('FAILS', FAILS); sys.exit(1 if FAILS else 0)
