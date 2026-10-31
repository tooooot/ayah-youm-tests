#!/usr/bin/env python3
"""اختبار واجهة ثبات الجديدة (Playwright): فتح الحساب، الأدوار، الشريط السفلي، الأولاد والدعوات والمكافأة، جهاز مشترك، الدرس.
الحسابات تُنشأ بنقطة /api/auth/test (TEST_AUTH=1 فقط في الاختبار). اللقطات في out/ui/"""
import json, os, socket, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'out', 'ui'); os.makedirs(OUT, exist_ok=True)
FAILS = []; RES = []
def check(name, ok, info=''):
    RES.append((name, bool(ok), str(info)[:200])); print(('PASS ' if ok else 'FAIL ') + name, info if not ok else '')
    if not ok: FAILS.append(name)
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close(); B = f'http://127.0.0.1:{PORT}'
D = tempfile.mkdtemp()
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server/server.js')], env={**os.environ, 'PORT': str(PORT), 'DATA_DIR': D, 'ORIGIN': B, 'TEST_AUTH': '1', 'GOOGLE_CLIENT_ID': 'gid', 'GOOGLE_CLIENT_SECRET': 'gsec', 'APPLE_SERVICE_ID': 's', 'APPLE_TEAM_ID': 't', 'APPLE_KEY_ID': 'k', 'APPLE_KEY_P8': 'x'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(50):
    try: urllib.request.urlopen(B + '/healthz'); break
    except Exception: time.sleep(.2)
def post(path, body, sess=None):
    h = {'Content-Type': 'application/json'}; sess and h.update({'X-Session': sess})
    return json.load(urllib.request.urlopen(urllib.request.Request(B + path, data=json.dumps(body).encode(), headers=h)))
def get(path, sess):
    return json.load(urllib.request.urlopen(urllib.request.Request(B + path, headers={'X-Session': sess})))
def acct(ident): return post('/api/auth/test', {'ident': ident})['session']
INIT = """window.__fast=true;window.Audio=class{constructor(s){this.src=s;this.duration=0.03;this.readyState=4}play(){setTimeout(()=>this.onended&&this.onended(),30);return Promise.resolve()}pause(){}};
window.SpeechRecognition=class{start(){}stop(){}};"""
errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        def page(sess=None, w=390, h=844, scale=1):
            ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=scale, locale='ar-SA'); ctx.add_init_script(INIT)
            if sess: ctx.add_init_script(f"try{{localStorage.setItem('ayah_session','{sess}')}}catch(e){{}}")
            pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); return pg
        def noscroll(pg, label):
            r = pg.evaluate("({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})")
            check(f'{label}: بلا تمرير أفقي', r['sw'] <= r['cw'] + 1, r)
        # ١. تسجيل الدخول (بلا «فتح حساب/دخول» منفصلين ولا رابط مباشر)
        pg = page(); pg.goto(B + '/app'); pg.wait_for_selector('.signin .btn'); pg.screenshot(path=OUT + '/01_signin.png')
        txt = pg.inner_text('body'); check('الدخول: أزرار Google وApple وسياسة الخصوصية', 'المتابعة بـ Google' in txt and 'المتابعة بـ Apple' in txt and 'سياسة الخصوصية' in txt)
        check('الدخول: لا إنشاء رابط ولا اختيار دور', 'رابط' not in txt.replace('الرابط', '') and 'أنا أب' not in txt); noscroll(pg, 'شاشة الدخول'); pg.close()
        # ٢. رحلة الأب: عائلة ← أولاد ← مكافأة ← دعوات ← رئيسية
        gs = acct('dad-ui'); pg = page(gs); pg.goto(B + '/app'); pg.wait_for_selector('input[aria-label="اسم العائلة"]')
        check('حساب جديد يبدأ رحلة الأب مباشرة (بلا اختيار دور)', pg.locator('.cardrole').count() == 0 and 'سمِّ عائلتك' in pg.inner_text('body'))
        pg.screenshot(path=OUT + '/02_journey_family.png'); pg.fill('input[aria-label="اسم العائلة"]', 'آل الاختبار'); pg.get_by_text('متابعة', exact=True).click()
        pg.wait_for_selector('input[aria-label="اسم الولد"]', timeout=10000); pg.fill('input[aria-label="اسم الولد"]', 'سلمان'); pg.screenshot(path=OUT + '/03_journey_kids.png')
        pg.get_by_text('إضافة الولد').click(); pg.wait_for_selector('.kidmini', timeout=10000); check('الولد أُضيف وظهر في القائمة', 'سلمان' in pg.inner_text('.kidmini'))
        pg.get_by_text('متابعة إلى المكافأة').click(); pg.wait_for_selector('.seg', timeout=10000); pg.get_by_role('button', name='المصروف').click(); pg.fill('input[aria-label="المبلغ"]', '300'); pg.wait_for_timeout(300)
        check('خطوة المكافأة: حساب حي لقيمة اليوم الكامل', 'اليوم الكامل' in pg.locator('.note').last.inner_text()); pg.screenshot(path=OUT + '/04_journey_reward.png')
        noscroll(pg, 'خطوة المكافأة'); pg.get_by_text('حفظ ومتابعة').click(); pg.wait_for_selector('.kidmini .btn', timeout=10000)
        check('خطوة الدعوات: زر إرسال لكل ولد', pg.locator('.kidmini .btn').count() == 1); pg.screenshot(path=OUT + '/05_journey_invites.png')
        kid = get('/api/v2/family', gs)['kids'][0]; link = kid['invite']['url']; check('رابط الدعوة /i/', '/i/' in link, link)
        st0 = get(f'/api/v2/kids/{kid["id"]}/state', gs); check('المكافأة حُفظت (مصروف 300)', st0['points']['mode'] == 'allowance' and st0['points']['amount'] == 300, st0['points'])
        pg.get_by_text('إنهاء، إلى الرئيسية').click(); pg.wait_for_selector('.tabbar', timeout=10000)
        tabs = pg.locator('.tabbar .tab'); check('الأب: خمسة تبويبات في الشريط السفلي', tabs.count() == 5, tabs.count())
        check('الرئيسية: بطاقة الولد', pg.locator('.card:has-text("سلمان")').count() >= 1); noscroll(pg, 'رئيسية الأب'); pg.screenshot(path=OUT + '/06_guardian_home.png')
        for label, key in (('الأولاد', '07_kids'), ('العادات', '08_habits'), ('التقدّم', '09_progress'), ('البروفايل', '10_profile')):
            pg.locator('.tabbar .tab', has_text=label).click(); pg.wait_for_selector('.hdr h1'); pg.wait_for_timeout(500)
            check(f'تبويب {label} يعرض عنوانه', label in pg.inner_text('.hdr h1')); noscroll(pg, f'تبويب {label}'); pg.screenshot(path=OUT + f'/{key}.png')
        pg.close()
        # ٣. صفحة الولد والمكافأة
        pg = page(gs); pg.goto(B + f'/app#/kid/{kid["id"]}'); pg.wait_for_selector('.seg'); pg.wait_for_timeout(600)
        pg.get_by_role('button', name='المصروف').click(); pg.fill('input[aria-label="المبلغ"]', '300'); pg.wait_for_timeout(300)
        calc = pg.locator('.note').last.inner_text(); check('حساب المكافأة الحي يظهر قيمة اليوم الكامل', 'اليوم الكامل' in calc and 'ريال' in calc, calc)
        pg.screenshot(path=OUT + '/11_kid_detail.png', full_page=True)
        pg.get_by_text('حفظ المكافأة').click(); pg.wait_for_timeout(1200)
        st = get(f'/api/v2/kids/{kid["id"]}/state', gs); check('المكافأة حُفظت في الخادم', st['points']['mode'] == 'allowance' and st['points']['amount'] == 300, st['points'])
        pg.close()
        # ٤. الابن: رابط الدعوة ← دخول ← ارتباط تلقائي ← يبدأ مباشرة
        token = link.split('/i/')[1]
        pg = page(); pg.goto(B + '/i/' + token); pg.wait_for_selector('.invitehero', timeout=10000)
        check('رابط الدعوة بلا حساب: شاشة دخول باسم الولد والعائلة', 'سلمان' in pg.inner_text('.invitehero') and 'آل الاختبار' in pg.inner_text('.invitehero'))
        pg.screenshot(path=OUT + '/12_invite_signin.png'); pg.close()
        ss_ = acct('kid-ui'); pg = page(ss_); pg.goto(B + '/i/' + token); pg.wait_for_selector('.tabbar', timeout=15000)
        check('بعد الدخول يرتبط تلقائياً بلا أي ضغطة: ثلاثة تبويبات وزر «ابدأ الآن»', pg.locator('.tabbar .tab').count() == 3 and pg.get_by_text('ابدأ الآن').count() == 1)
        check('لم يُطلب منه اختيار دور', 'أنا أب' not in pg.inner_text('body') and 'سمِّ عائلتك' not in pg.inner_text('body'))
        hero = pg.inner_text('.hero'); check('الابن: يرى «نقاط اليوم: 0 من 100» والحلقة تعرض النقاط لا الأيام', 'نقاط اليوم: 0 من 100' in hero and pg.locator('.ring b').inner_text().strip() == '0', hero)
        noscroll(pg, 'يوم الابن'); pg.screenshot(path=OUT + '/13_student_today.png')
        check('بطاقة الآية بنص المصحف', pg.locator('.ayahcard .q').count() == 1 and len(pg.inner_text('.ayahcard .q')) > 5)
        pg.locator('.tabbar .tab', has_text='إنجازي').click(); pg.wait_for_timeout(500); pg.screenshot(path=OUT + '/14_achv.png')
        pg.locator('.tabbar .tab', has_text='البروفايل').click(); pg.wait_for_timeout(500); noscroll(pg, 'بروفايل الابن'); pg.screenshot(path=OUT + '/15_me.png')
        pg.locator('.tabbar .tab', has_text='اليوم').click(); pg.get_by_text('ابدأ الآن').click(); pg.wait_for_selector('text=ابدأ الدرس', timeout=15000)
        check('شاشة «جاهز؟» قبل الدرس (ضغطة تُجيز الصوت) ولم يبدأ الدرس بعد', pg.locator('.mpage').count() == 0); pg.screenshot(path=OUT + '/13b_ready.png')
        pg.get_by_text('ابدأ الدرس').click(); pg.wait_for_selector('.mpage .mw.f', timeout=20000)
        check('الدرس يفتح من التطبيق على /lesson/ بجلسة الحساب', '/lesson/' in pg.url and pg.locator('.mpage .mw.f').count() > 0, pg.url); pg.close()
        # ٤ب. جهاز لا يدعم سماع التسميع: يوضَّح السبب، ولا نقاط قبل تأكيد الأب، ويصل السبب للأب
        k4 = post('/api/v2/kids', {'name': 'هدى', 'age': 9, 'start': 114}, gs); fb = acct('kid-fallback'); post('/api/v2/invites/' + k4['invite']['url'].split('/i/')[1] + '/claim', {}, fb)
        ctx4 = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar-SA'); ctx4.add_init_script(INIT); ctx4.add_init_script("window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;"); ctx4.add_init_script(f"try{{localStorage.setItem('ayah_session','{fb}')}}catch(e){{}}")
        pg = ctx4.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(B + f'/lesson/{k4["id"]}?kind=new'); pg.wait_for_selector('text=ابدأ الدرس', timeout=15000)
        check('تنبيه مبكر قبل الدرس: المتصفح لا يسمع التسميع', 'لا يسمع التسميع' in pg.inner_text('body')); pg.screenshot(path=OUT + '/19_no_sr_warning.png')
        pg.get_by_text('ابدأ الدرس').click(); pg.wait_for_selector('.mpage .mw.f', timeout=20000)
        pg.wait_for_function("[...document.querySelectorAll('button')].some(x=>x.textContent.includes('جاهز للتسميع') && !x.disabled)", timeout=90000); pg.get_by_text('جاهز للتسميع').click()
        pg.wait_for_selector('.dock .note', timeout=10000); check('بلا دعم للصوت: رسالة واضحة وزر «سمّعتها لأبي»', 'لا يدعم سماع التسميع' in pg.inner_text('.dock') and pg.get_by_text('سمّعتها لأبي').count() == 1)
        pg.get_by_text('سمّعتها لأبي').click(); pg.wait_for_selector('.hero', timeout=10000)
        st4 = get(f'/api/v2/kids/{k4["id"]}/state', gs)
        check('الجلسة معلّقة بلا نقاط، والسبب يصل للأب', len(st4['pending']) == 1 and st4['pending'][0]['why'] == 'unsupported' and st4['points']['pointsToday'] == 0, st4['pending'])
        pg2 = page(gs); pg2.goto(B + '/app'); pg2.wait_for_selector('.tabbar'); pg2.wait_for_timeout(600)
        check('الأب يرى: «تسميع ينتظر تأكيدك» مع سبب ويُطلب منه ألا يؤكد إلا إن سمعه', 'ينتظر تأكيدك' in pg2.inner_text('body') and 'جهازه لا يدعم' in pg2.inner_text('body') and 'سمعتُه وصحّ' in pg2.inner_text('body'))
        pg2.screenshot(path=OUT + '/18_pending_confirm.png'); pg2.get_by_text('سمعتُه وصحّ').first.click(); pg2.wait_for_timeout(1200)
        st4 = get(f'/api/v2/kids/{k4["id"]}/state', gs); check('بعد تأكيد الأب: 100 نقطة اليوم', st4['points']['pointsToday'] == 100 and not st4['pending'], st4['points']['pointsToday'])
        pg2.close(); ctx4.close()
        # ٤ج. المتصفح يمنع الصوت التلقائي (تصفح خفي): لا صمت؛ رسالة واضحة وضغطة تُشغّل
        k5 = post('/api/v2/kids', {'name': 'لمى', 'age': 9, 'start': 114}, gs); bl = acct('kid-blocked'); post('/api/v2/invites/' + k5['invite']['url'].split('/i/')[1] + '/claim', {}, bl)
        ctx5 = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar-SA'); ctx5.add_init_script(INIT)
        ctx5.add_init_script("(()=>{const P=window.Audio;window.__blk=1;window.Audio=class extends P{play(){if(window.__blk){window.__blk=0;return Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}))}return super.play()}}})();")
        ctx5.add_init_script(f"try{{localStorage.setItem('ayah_session','{bl}')}}catch(e){{}}")
        pg = ctx5.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(B + f'/lesson/{k5["id"]}?kind=new'); pg.wait_for_selector('text=ابدأ الدرس', timeout=15000)
        pg.get_by_text('ابدأ الدرس').click(); pg.wait_for_selector('.turn', timeout=15000); pg.wait_for_function("document.querySelector('.turn').textContent.includes('اضغط على الشاشة')", timeout=10000)
        check('صوت ممنوع تلقائياً: رسالة «اضغط على الشاشة لتشغيل الصوت» بدل الصمت', True); pg.screenshot(path=OUT + '/20_audio_blocked.png')
        pg.mouse.click(200, 300); pg.wait_for_function("!document.querySelector('.turn').textContent.includes('اضغط على الشاشة')", timeout=10000)
        check('بعد الضغط يعمل الصوت ويتابع الدرس', 'استمع' in pg.inner_text('.turn') or 'دورك' in pg.inner_text('.turn') or 'اسمع' in pg.inner_text('.turn'), pg.inner_text('.turn')); ctx5.close()
        # ٥. جهاز مشترك: ولدان على حساب واحد
        k2 = post('/api/v2/kids', {'name': 'نوف', 'age': 8}, gs); k3 = post('/api/v2/kids', {'name': 'ريم', 'age': 6}, gs); dev = acct('shared-ui')
        for k_ in (k2, k3): post('/api/v2/invites/' + k_['invite']['url'].split('/i/')[1] + '/claim', {}, dev)
        pg = page(dev); pg.goto(B + '/app'); pg.wait_for_selector('.pick'); check('جهاز مشترك: شاشة «من يتعلم الآن؟» ببطاقتين', pg.locator('.pick .card').count() == 2)
        pg.screenshot(path=OUT + '/16_picker.png'); pg.locator('.pick .card', has_text='نوف').click(); pg.wait_for_selector('.tabbar')
        check('بعد الاختيار: يوم نوف', 'نوف' in pg.inner_text('body')); pg.close()
        # ٦. إعدادات + أجهزة صغيرة
        pg = page(gs, 360, 740); pg.goto(B + '/app#/settings'); pg.wait_for_selector('.hdr h1'); noscroll(pg, 'الإعدادات 360'); pg.screenshot(path=OUT + '/17_settings_360.png')
        check('الإعدادات: خروج وحذف حساب وخصوصية', all(t in pg.inner_text('body') for t in ('تسجيل الخروج', 'حذف حسابي', 'سياسة الخصوصية')))
        pg.goto(B + '/app#/home'); pg.wait_for_selector('.tabbar'); noscroll(pg, 'رئيسية 360'); pg.close()
        b.close()
    check('لا أخطاء جافاسكربت', not errs, errs[:4])
finally:
    srv.terminate()
json.dump({'fails': FAILS, 'results': RES}, open(os.path.join(OUT, 'results.json'), 'w'), ensure_ascii=False, indent=1)
print('FAILS', FAILS); sys.exit(1 if FAILS else 0)
