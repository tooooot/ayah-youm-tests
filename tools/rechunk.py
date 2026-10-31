"""يعيد تقسيم الآيات الطويلة في plan.json عند علامات الوقف (صلى/قلى/ج/م) لا بالعدّ. الاستدعاء: python3 tools/rechunk.py [--write]"""
import json, sys, math
P = json.load(open('site/data/plan.json')); Q = json.load(open('site/data/quran.json'))
STOP = 'ۖۗۚۘ'
MANUAL = {}   # مفتاح الآية -> قائمة نقاط القطع (فهارس الكلمات) لآيات بلا علامات؛ تُحدَّد يدوياً
try: MANUAL = json.load(open('tools/manual_cuts.json'))
except FileNotFoundError: pass
def cuts_for(k, w):
    n = len(w)
    if k in MANUAL: cut = sorted(MANUAL[k])
    else: cut = [j + 1 for j, x in enumerate(w) if any(c in STOP for c in x) and j + 1 < n]
    b = [0] + cut + [n]; segs = [[b[i], b[i + 1]] for i in range(len(b) - 1)]
    while len(segs) > 1 and min(s[1] - s[0] for s in segs) < 3:
        i = min(range(len(segs)), key=lambda x: segs[x][1] - segs[x][0])
        j = i - 1 if i > 0 else 1
        a, c = min(i, j), max(i, j); segs[a:c + 1] = [[segs[a][0], segs[c][1]]]
    out = []
    for a, c in segs:
        parts = math.ceil((c - a) / 12)
        for p in range(parts): out.append([a + round((c - a) * p / parts), a + round((c - a) * (p + 1) / parts)])
    return out
res = {}
for s in Q:
    for i, a in enumerate(s['ayahs'], 1):
        k = f"{s['n']:03d}{i:03d}"
        if k in P and 'ch' in P[k]:
            w = a['t'].split(' '); segs = cuts_for(k, w); st = {x[0]: x[1] for x in P[k]['fs']}; df = P[k]['df']
            P[k]['ch'] = [[x, y, round(max(0, st[x] - .03), 2), round(df if y == len(w) else st[y] + .05, 2)] for x, y in segs]
            res[k] = (segs, [' '.join(w[x:y]) for x, y in segs])
for k, (segs, tx) in res.items():
    print(k, [y - x for x, y in segs])
    if '-v' in sys.argv: print('   ' + '\n   '.join(tx))
if '--write' in sys.argv: json.dump(P, open('site/data/plan.json', 'w'), ensure_ascii=False, separators=(',', ':')); print('written')
