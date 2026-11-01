#!/usr/bin/env python3
"""قياس الوقفات عند حدود مقاطعنا لكل قارئ (يعمل على GitHub): لأي قارئ وقفةٌ حقيقية عند علامات الوقف التي نقطع عندها،
وانعدامها داخل الجمل؟ المدخل: site/data/plan.json (ch) + توقيت كلمات Quran Foundation + كاشف صمت ffmpeg."""
import json, os, re, statistics, subprocess, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'out'); os.makedirs(OUT, exist_ok=True)
RECITERS = {6: 'الحصري (مرتّل)', 9: 'المنشاوي (مرتّل)', 2: 'عبد الباسط (مرتّل)', 7: 'العفاسي', 3: 'السديس (الحالي)',
            10: 'الشريم', 5: 'هاني الرفاعي', 4: 'أبو بكر الشاطري', 1: 'عبد الباسط (مجوَّد)', 97: 'ياسر الدوسري', 161: 'خليفة الطنيجي'}
plan = json.load(open(ROOT + '/site/data/plan.json')); quran = json.load(open(ROOT + '/site/data/quran.json'))
W = {f"{s['n']:03d}{i:03d}": a['t'].split(' ') for s in quran for i, a in enumerate(s['ayahs'], 1)}
TARGET = {k: p['ch'] for k, p in plan.items() if 'ch' in p}   # الآيات الطويلة المقسّمة
CHAPTERS = sorted({int(k[:3]) for k in TARGET})
def get(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': 'curl/8.5'})
    with urllib.request.urlopen(req, timeout=180) as r: return r.read() if binary else json.loads(r.read())
def silences(path, noise='-35dB', d='0.05'):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', f'silencedetect=noise={noise}:d={d}', '-f', 'null', '-'], capture_output=True, text=True)
    out, start = [], None
    for l in r.stderr.split('\n'):
        m = re.search(r'silence_start: ([\d.]+)', l)
        if m: start = float(m.group(1))
        m = re.search(r'silence_end: ([\d.]+) \| silence_duration: ([\d.]+)', l)
        if m and start is not None: out.append((float(m.group(1)) - float(m.group(2)), float(m.group(1)))); start = None
    return out
def pause_at(sil, t):   # أطول صمت يتقاطع مع نافذة حول نهاية الكلمة
    best = None
    for s, e in sil:
        if e > t - .35 and s < t + .5:
            d = e - max(s, t - .35)
            if best is None or d > best[0]: best = (d, s, e)
    return best
res = {}
for rid, name in RECITERS.items():
    marks, mids, words, secs, cuts, micro = [], [], 0, 0.0, [], []
    for ch in CHAPTERS:
        j = get(f'https://api.quran.com/api/v4/chapter_recitations/{rid}/{ch}?segments=true')['audio_file']
        mp3 = f'/tmp/r{rid}_{ch}.mp3'; open(mp3, 'wb').write(get(j['audio_url'], True)); sil = silences(mp3); sil2 = silences(mp3, '-30dB', '0.015')
        for t in j['timestamps']:
            key = f"{ch:03d}{int(t['verse_key'].split(':')[1]):03d}"
            if key not in TARGET: continue
            seg = {}
            for w, a, b in t['segments']: seg.setdefault(int(w), (a / 1000, b / 1000))
            n = len(W[key]); bounds = {c[1] for c in TARGET[key][:-1]}
            words += n; secs += (t['timestamp_to'] - t['timestamp_from']) / 1000
            for w in range(1, n):   # نهاية كلمة داخل الآية
                if w not in seg: continue
                p = pause_at(sil, seg[w][1]); d = p[0] if p else 0.0
                if w in bounds:
                    micro.append(1 if any(e > seg[w][1] - .12 and s < seg[w][1] + .12 for s, e in sil2) else 0)
                    marks.append(d); cuts.append({'ayah': key, 'afterWord': w, 'pause': round(d, 2), 'cut': round((p[1] + p[2]) / 2, 2) if p else None})
                else: mids.append(d)
    pm = lambda xs, th: round(100 * sum(1 for x in xs if x >= th) / max(1, len(xs)), 1)
    r = {'name': name, 'boundaries': len(marks), 'pctMarksPause>=0.20s': pm(marks, .20), 'meanMarkPause': round(statistics.mean(marks), 3) if marks else 0, 'medianMarkPause': round(statistics.median(marks), 3) if marks else 0,
         'pctMidPause>=0.12s': pm(mids, .12), 'meanMidPause': round(statistics.mean(mids), 3) if mids else 0, 'wordsPerSec': round(words / secs, 2) if secs else 0, 'microGapPct': round(100 * sum(micro) / max(1, len(micro)), 1), 'cuts': cuts}
    r['contrast'] = round(r['meanMarkPause'] - r['meanMidPause'], 3)
    r['cleanScore'] = round(0.5 * r['pctMarksPause>=0.20s'] + 0.3 * (100 - r['pctMidPause>=0.12s']) + 0.2 * min(100, max(0, r['contrast'] / .4 * 100)), 1)
    res[rid] = r; print('done', rid, name, flush=True)

# ───── سعد الغامدي: لا توقيت كلمات في المصدر، فقياس تقريبي: صمت داخل الآية قرب الموضع المتوقع (نسبة الحروف) ─────
try:
    marks, mids, words, secs, micro = [], [], 0, 0.0, []
    for key, chs in TARGET.items():
        mp3 = f'/tmp/g_{key}.mp3'; open(mp3, 'wb').write(get(f'https://everyayah.com/data/Ghamadi_40kbps/{key}.mp3', True))
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], capture_output=True, text=True).stdout or 0)
        sil = silences(mp3, '-35dB', '0.05'); sil2 = silences(mp3, '-30dB', '0.015'); ws = W[key]; n = len(ws); tot = sum(len(x) for x in ws)
        lead = sil[0][1] if sil and sil[0][0] < .05 else 0.0; tail = sil[-1][0] if sil and sil[-1][1] >= dur - .05 else dur; span = tail - lead; words += n; secs += span
        acc, pos = 0, {}
        for i, x in enumerate(ws, 1): acc += len(x); pos[i] = lead + span * acc / tot
        bounds = {c[1] for c in chs[:-1]}
        for w in bounds:
            t = pos[w]; cand = [(e - s, s, e) for s, e in sil if s > lead + .05 and e < tail - .05 and abs((s + e) / 2 - t) < .12 * span]
            d = max(cand)[0] if cand else 0.0; marks.append(d); micro.append(1 if any(e > t - .15 and s < t + .15 for s, e in sil2) else 0)
        for w in range(1, n):
            if w in bounds: continue
            t = pos[w]; cand = [(e - s) for s, e in sil if s > lead + .05 and e < tail - .05 and abs((s + e) / 2 - t) < .04 * span]; mids.append(max(cand) if cand else 0.0)
    pm = lambda xs, th: round(100 * sum(1 for x in xs if x >= th) / max(1, len(xs)), 1)
    r = {'name': 'سعد الغامدي (تقريبي)', 'boundaries': len(marks), 'pctMarksPause>=0.20s': pm(marks, .20), 'meanMarkPause': round(statistics.mean(marks), 3), 'medianMarkPause': round(statistics.median(marks), 3), 'pctMidPause>=0.12s': pm(mids, .12), 'meanMidPause': round(statistics.mean(mids), 3), 'wordsPerSec': round(words / secs, 2), 'microGapPct': round(100 * sum(micro) / len(micro), 1), 'cuts': []}
    r['contrast'] = round(r['meanMarkPause'] - r['meanMidPause'], 3); r['cleanScore'] = round(0.5 * r['pctMarksPause>=0.20s'] + 0.3 * (100 - r['pctMidPause>=0.12s']) + 0.2 * min(100, max(0, r['contrast'] / .4 * 100)), 1)
    res['ghamdi'] = r; print('done ghamdi', flush=True)
except Exception as e: print('ghamdi failed', e, flush=True)
json.dump(res, open(OUT + '/reciters.json', 'w'), ensure_ascii=False, indent=1)
print('\n== نتيجة قياس القراء (الحدود=%d في %d آية، فصول %s) ==' % (len(next(iter(res.values()))['cuts']), len(TARGET), CHAPTERS))
print('| القارئ | درجة القطع النظيف | وقفة عند الحدود ≥0.2ث | متوسط الوقفة عند الحدود | وقفات داخل الجملة ≥0.12ث | فجوة صغيرة عند الحد (للقطع النظيف) | كلمة/ث |')
for rid, r in sorted(res.items(), key=lambda x: -x[1]['cleanScore']):
    print(f"| {r['name']} | {r['cleanScore']} | {r['pctMarksPause>=0.20s']}% | {r['meanMarkPause']}ث | {r['pctMidPause>=0.12s']}% | {r['microGapPct']}% | {r['wordsPerSec']} |")
