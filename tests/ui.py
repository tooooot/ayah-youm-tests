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
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server/server.js')], env={**os.environ, 'PORT': str(PORT), 'DATA_DIR': D, 'ORIGIN': B, 'TEST_AUTH': '1'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
        # ١. الترحيب
        pg = page(); pg.goto(B + '/app'); pg.wait_for_selector('.welcome .btn'); pg.screenshot(path=OUT + '/01_welcome.png')
        txt = pg.inner_text('body'); check('الترحيب: «فتح حساب» و«تسجيل الدخول» ولا رابط مباشر', 'فتح حساب' in txt and 'تسجيل الدخول' in txt and 'رابط' not in txt.replace('الرابط', ''))
        pg.get_by_text('فتح حساب').click(); pg.wait_for_selector('.sheet'); check('ورقة الدخول تظهر', pg.locator('.sheet').count() == 1); pg.close()
        # ٢. رحلة الأب
        gs = acct('dad-ui'); pg = page(gs); pg.goto(B + '/app'); pg.wait_for_selector('.cardrole')
        pg.screenshot(path=OUT + '/02_role.png'); check('اختيار الدور يظهر لحساب جديد', pg.locator('.cardrole').count() == 2)
        pg.get_by_text('أنا أب / أم').click(); pg.wait_for_selector('input[aria-label="اسم العائلة"]')
        pg.fill('input[aria-label="اسم العائلة"]', 'آل الاختبار'); pg.get_by_text('متابعة').click(); pg.wait_for_selector('input[aria-label="اسم الولد"]', timeout=10000)
        pg.fill('input[aria-label="اسم الولد"]', 'سلمان'); pg.screenshot(path=OUT + '/03_first_kid.png'); pg.get_by_text('إضافة وإرسال الدعوة').click(); pg.wait_for_selector('.note', timeout=10000)
        link = pg.inner_text('.note').strip(); check('شاشة الدعوة برابط /i/', '/i/' in link, link)
        noscroll(pg, 'شاشة الدعوة'); pg.screenshot(path=OUT + '/04_invite.png')
        pg.get_by_text('تم، إلى الرئيسية').click(); pg.wait_for_selector('.tabbar')
        tabs = pg.locator('.tabbar .tab'); check('الأب: خمسة تبويبات في الشريط السفلي', tabs.count() == 5, tabs.count())
        check('الرئيسية: بطاقة الولد', pg.locator('.card:has-text("سلمان")').count() >= 1); noscroll(pg, 'رئيسية الأب'); pg.screenshot(path=OUT + '/05_guardian_home.png')
        for label, key in (('الأولاد', '06_kids'), ('العادات', '07_habits'), ('التقدّم', '08_progress'), ('البروفايل', '09_profile')):
            pg.locator('.tabbar .tab', has_text=label).click(); pg.wait_for_selector('.hdr h1'); pg.wait_for_timeout(500)
            check(f'تبويب {label} يعرض عنوانه', label in pg.inner_text('.hdr h1') or label == 'التقدّم'); noscroll(pg, f'تبويب {label}'); pg.screenshot(path=OUT + f'/{key}.png')
        # ٣. صفحة الولد والمكافأة
        kid = get('/api/v2/family', gs)['kids'][0]
        pg.goto(B + f'/app#/kid/{kid["id"]}'); pg.wait_for_selector('.seg'); pg.wait_for_timeout(600)
        pg.get_by_role('button', name='المصروف').click(); pg.fill('input[aria-label="المبلغ"]', '300'); pg.wait_for_timeout(300)
        calc = pg.locator('.note').last.inner_text(); check('حساب المكافأة الحي يظهر قيمة اليوم الكامل', 'اليوم الكامل' in calc and 'ريال' in calc, calc)
        pg.screenshot(path=OUT + '/10_kid_detail.png', full_page=True)
        pg.get_by_text('حفظ المكافأة').click(); pg.wait_for_timeout(1200)
        st = get(f'/api/v2/kids/{kid["id"]}/state', gs); check('المكافأة حُفظت في الخادم', st['points']['mode'] == 'allowance' and st['points']['amount'] == 300, st['points'])
        pg.close()
        # ٤. الابن يقبل الدعوة
        token = link.split('/i/')[1]; ss_ = acct('kid-ui'); pg = page(ss_); pg.goto(B + '/i/' + token); pg.wait_for_selector('.hero', timeout=10000)
        check('صفحة الدعوة تعرض اسم الولد والعائلة', 'سلمان' in pg.inner_text('.hero') and 'آل الاختبار' in pg.inner_text('.hero'))
        pg.screenshot(path=OUT + '/11_invite_landing.png'); pg.get_by_text('ابدأ').first.click(); pg.wait_for_selector('.tabbar', timeout=10000)
        check('الابن: ثلاثة تبويبات', pg.locator('.tabbar .tab').count() == 3); check('اليوم: زر «ابدأ الآن»', pg.get_by_text('ابدأ الآن').count() == 1)
        noscroll(pg, 'يوم الابن'); pg.screenshot(path=OUT + '/12_student_today.png')
        pg.locator('.tabbar .tab', has_text='إنجازي').click(); pg.wait_for_timeout(500); pg.screenshot(path=OUT + '/13_achv.png')
        pg.locator('.tabbar .tab', has_text='البروفايل').click(); pg.wait_for_timeout(500); noscroll(pg, 'بروفايل الابن'); pg.screenshot(path=OUT + '/14_me.png')
        pg.locator('.tabbar .tab', has_text='اليوم').click(); pg.get_by_text('ابدأ الآن').click(); pg.wait_for_selector('.mpage .mw.f', timeout=20000)
        check('الدرس يفتح من التطبيق على /lesson/ بجلسة الحساب', '/lesson/' in pg.url and pg.locator('.mpage .mw.f').count() > 0, pg.url); pg.close()
        # ٥. جهاز مشترك: ولدان على حساب واحد
        k2 = post('/api/v2/kids', {'name': 'نوف', 'age': 8}, gs); k3 = post('/api/v2/kids', {'name': 'ريم', 'age': 6}, gs); dev = acct('shared-ui')
        for k_ in (k2, k3): post('/api/v2/invites/' + k_['invite']['url'].split('/i/')[1] + '/claim', {}, dev)
        pg = page(dev); pg.goto(B + '/app'); pg.wait_for_selector('.pick'); check('جهاز مشترك: شاشة «من يتعلم الآن؟» ببطاقتين', pg.locator('.pick .card').count() == 2)
        pg.screenshot(path=OUT + '/15_picker.png'); pg.locator('.pick .card', has_text='نوف').click(); pg.wait_for_selector('.tabbar')
        check('بعد الاختيار: يوم نوف', 'نوف' in pg.inner_text('body')); pg.close()
        # ٦. إعدادات + أجهزة صغيرة
        pg = page(gs, 360, 740); pg.goto(B + '/app#/settings'); pg.wait_for_selector('.hdr h1'); noscroll(pg, 'الإعدادات 360'); pg.screenshot(path=OUT + '/16_settings_360.png')
        check('الإعدادات: خروج وحذف حساب وخصوصية', all(t in pg.inner_text('body') for t in ('تسجيل الخروج', 'حذف حسابي', 'سياسة الخصوصية')))
        pg.goto(B + '/app#/home'); pg.wait_for_selector('.tabbar'); noscroll(pg, 'رئيسية 360'); pg.close()
        b.close()
    check('لا أخطاء جافاسكربت', not errs, errs[:4])
finally:
    srv.terminate()
json.dump({'fails': FAILS, 'results': RES}, open(os.path.join(OUT, 'results.json'), 'w'), ensure_ascii=False, indent=1)
print('FAILS', FAILS); sys.exit(1 if FAILS else 0)
