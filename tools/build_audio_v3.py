#!/usr/bin/env python3
"""v3 (يعمل على GitHub): التلاوة السريعة = عبد الباسط مرتّل (يقف عند علامات الوقف). مقاطع الآيات تُقصّ من ملف السورة بتوقيت Quran Foundation للكلمات،
وحدود المقاطع الطويلة عند **منتصف الصمت** الحقيقي (وإلا أقرب فجوة صغيرة، وإلا نهاية الكلمة). المخرجات: out/audio-ab/*.mp3 وout/plan_ab.json وout/cuts_report.json."""
import json, os, re, subprocess, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'out'); AD = os.path.join(OUT, 'audio-ab'); os.makedirs(AD, exist_ok=True)
RID = int(os.environ.get('RECITER', '2'))
old = json.load(open(ROOT + '/site/data/plan.json')); q = json.load(open(ROOT + '/site/data/quran.json'))
W = {f"{s['n']:03d}{i:03d}": a['t'].split(' ') for s in q for i, a in enumerate(s['ayahs'], 1)}
def get(u, binary=False):
    with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'curl/8.5'}), timeout=180) as r: return r.read() if binary else json.loads(r.read())
def silences(path, noise='-35dB', d='0.05'):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', f'silencedetect=noise={noise}:d={d}', '-f', 'null', '-'], capture_output=True, text=True)
    out, start = [], None
    for l in r.stderr.split('\n'):
        m = re.search(r'silence_start: ([\d.]+)', l)
        if m: start = float(m.group(1))
        m = re.search(r'silence_end: ([\d.]+) \| silence_duration: ([\d.]+)', l)
        if m and start is not None: out.append((float(m.group(1)) - float(m.group(2)), float(m.group(1)))); start = None
    return out
def cut_at(t, sil, sil2):   # يرجع (زمن القطع، نوعه)
    best = None
    for s, e in sil:
        if e > t - .35 and s < t + .5:
            d = e - max(s, t - .35)
            if best is None or d > best[0]: best = (d, s, e)
    if best and best[0] >= .12: return (best[1] + best[2]) / 2, 'silence'
    near = [(abs((s + e) / 2 - t), (s + e) / 2) for s, e in sil2 if e > t - .15 and s < t + .15]
    if near: return min(near)[1], 'micro'
    return t, 'word'
plan, report, bad = {}, [], []
for s in q:
    ch = s['n']
    j = get(f'https://api.quran.com/api/v4/chapter_recitations/{RID}/{ch}?segments=true')['audio_file']
    mp3 = f'/tmp/ab_{ch}.mp3'; open(mp3, 'wb').write(get(j['audio_url'], True)); sil = silences(mp3); sil2 = silences(mp3, '-30dB', '0.015')
    for t in j['timestamps']:
        i = int(t['verse_key'].split(':')[1]); k = f'{ch:03d}{i:03d}'; n = len(W[k]); segs = t['segments']
        start = min(t['timestamp_from'], segs[0][1]) / 1000; end = t['timestamp_to'] / 1000
        out = f'{AD}/{k}.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-to', f'{end:.3f}', '-i', mp3, '-ac', '1', '-ar', '24000', '-b:a', '64k', out], check=True)
        df = round(os.path.getsize(out) * 8 / 64000, 2)
        fs = [[x[0] - 1, round(max(0, x[1] / 1000 - start), 2), round(x[2] / 1000 - start, 2)] for x in segs]
        last = {x[0]: i for i, x in enumerate(fs)}   # كلمات يكرّرها القارئ: تبقى القراءة الأخيرة
        fs = [x for i, x in enumerate(fs) if last[x[0]] == i]
        if len(fs) != n: bad.append((k, len(fs), n))
        e = {'ds': old[k]['ds'], 'df': df, 'fs': fs, 'ss': old[k]['ss']}
        if 'ch' in old[k]:
            if len(fs) != n: e['ch'] = old[k]['ch']; report.append({'ayah': k, 'error': 'segments mismatch: kept old chunks'})
            else:
                st = {x[0]: (x[1], x[2]) for x in fs}; chs = old[k]['ch']; cuts = []
                for c in chs[:-1]:
                    w1 = c[1]; tend = start + st[w1 - 1][1]; ct, kind = cut_at(tend, sil, sil2); rel = round(min(max(ct - start, .05), df - .05), 2)
                    cuts.append(rel); report.append({'ayah': k, 'afterWord': w1, 'kind': kind, 'wordEnd': st[w1 - 1][1], 'cut': rel})
                e['ch'] = []
                for idx, c in enumerate(chs):
                    a = max(0, round(st[c[0]][0] - .03, 2)) if idx == 0 else cuts[idx - 1]
                    b = df if idx == len(chs) - 1 else cuts[idx]
                    e['ch'].append([c[0], c[1], a, b])
        plan[k] = e
    print('chapter', ch, flush=True)
json.dump(plan, open(OUT + '/plan_ab.json', 'w'), separators=(',', ':')); json.dump(report, open(OUT + '/cuts_report.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print('ayat', len(plan), 'segment mismatches', len(bad), bad[:8], '| cuts by kind', dict(Counter(r.get('kind') for r in report if 'kind' in r)))
print('audio bytes', sum(os.path.getsize(f'{AD}/{f}') for f in os.listdir(AD)))
