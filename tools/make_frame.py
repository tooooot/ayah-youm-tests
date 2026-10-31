# يولّد إطار صفحة المصحف (على غرار طبعة المجمع: شريط أخضر بزهور وردية) كصورة SVG لـ border-image، ولوحة اسم السورة
import urllib.parse
G, GD, GL, PK, PL, CR = '#2a7d5c', '#14503a', '#4db38a', '#b3305c', '#e58aa8', '#f4ead0'
def motif():  # 36×24: الخارج في y=0
    return f'''<rect x="0" y="0" width="36" height="24" fill="#ece2bf"/>
<path d="M0 .8H36M0 23.2H36" stroke="{GD}" stroke-width="1.6"/>
<path d="M0 3.4H36M0 20.6H36" stroke="{G}" stroke-width=".7"/>
<path d="M9 12c-6-1-8-6-6-9 5 0 9 3 9 9s-3 9-9 9c-2-3 0-8 6-9z" fill="{GL}" opacity=".0"/>
<ellipse cx="9" cy="12" rx="7.4" ry="8" fill="{G}" stroke="{GD}" stroke-width="1"/><ellipse cx="27" cy="12" rx="7.4" ry="8" fill="{G}" stroke="{GD}" stroke-width="1"/>
<path d="M4 12c2-4 6-5 10-3M4 12c2 4 6 5 10 3M22 9c4-2 8-1 10 3M22 15c4 2 8 1 10-3" fill="none" stroke="#f6efd6" stroke-width="1"/>
<circle cx="9" cy="12" r="2.2" fill="{GL}"/><circle cx="27" cy="12" r="2.2" fill="{GL}"/>
<path d="M18 2.6c3.2 2.6 4.4 6 0 9.4-4.4-3.4-3.2-6.8 0-9.4zM18 21.4c3.2-2.6 4.4-6 0-9.4-4.4 3.4-3.2 6.8 0 9.4z" fill="{PK}"/>
<ellipse cx="18" cy="12" rx="2.1" ry="3.1" fill="{PL}"/><circle cx="18" cy="12" r="1" fill="{PK}"/>'''
def corner():  # 24×24
    return f'''<rect width="24" height="24" fill="#ece2bf"/>
<path d="M0 .8H24M.8 0V24" stroke="{GD}" stroke-width="1.6"/>
<circle cx="12" cy="12" r="9.5" fill="{G}" stroke="{GD}" stroke-width="1"/>
<path d="M4 12a8 8 0 0 1 16 0M12 4a8 8 0 0 1 0 16" fill="none" stroke="{CR}" stroke-width=".9"/>
<path d="M12 4.5c3 2.5 3 5 0 7.5-3-2.5-3-5 0-7.5zM12 19.5c3-2.5 3-5 0-7.5-3 2.5-3 5 0 7.5zM4.5 12c2.5-3 5-3 7.5 0-2.5 3-5 3-7.5 0zM19.5 12c-2.5-3-5-3-7.5 0 2.5 3 5 3 7.5 0z" fill="{PK}"/>
<circle cx="12" cy="12" r="2.2" fill="{PL}"/>'''
def frame():
    m, c = motif(), corner()
    parts = [
      f'<g transform="translate(24,0)">{m}</g>',
      f'<g transform="translate(24,84) scale(1,-1)">{m}</g>',
      f'<g transform="matrix(0,1,1,0,0,24)">{m}</g>',
      f'<g transform="matrix(0,1,-1,0,84,24)">{m}</g>',
      f'<g>{c}</g>', f'<g transform="translate(84,0) scale(-1,1)">{c}</g>',
      f'<g transform="translate(0,84) scale(1,-1)">{c}</g>', f'<g transform="translate(84,84) scale(-1,-1)">{c}</g>']
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84" viewBox="0 0 84 84">{"".join(parts)}</svg>'
def rosette():
    petals = ''.join(f'<ellipse cx="20" cy="8.5" rx="3.6" ry="6.2" fill="{PL}" stroke="{PK}" stroke-width=".8" transform="rotate({a} 20 20)"/>' for a in range(0, 360, 45))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="{G}" stroke="{CR}" stroke-width=".8"/>{petals}<circle cx="20" cy="20" r="4.2" fill="{PK}"/><circle cx="20" cy="20" r="1.8" fill="{CR}"/></svg>'
def uri(svg): return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe="/:=' ") .replace('"', "'") + '")'
css = f'''
/* v10: إطار وورق على غرار مصحف المجمع (مرجع: صور المالك) — مولَّد بـ tools/make_frame.py */
.mpage{{--frame:{uri(frame())};--rose:{uri(rosette())};
  border:16px solid transparent;border-image:var(--frame) 24 / 16px round;border-radius:0;
  box-shadow:0 2px 14px 4px #0003;margin-left:4px;margin-right:4px;padding:8px 6px 6px;
  background-color:#f8f2dc;background-image:radial-gradient(ellipse at 50% 45%,#fbf7e8 50%,#f1e7c6 100%)}}
.mpage::before{{inset:0;border:1.4px solid {GD};border-radius:0;box-shadow:inset 0 0 0 3px #f8f2dc,inset 0 0 0 4px {G}}}
.mhead{{border-bottom:0;color:#3b3a2d;font-weight:600}}
.mban span{{position:relative;overflow:hidden;border:1.6px solid {GD};border-radius:2px;padding:0 3.4em;background:#d3e6d6;background-image:none;box-shadow:inset 0 0 0 2px #f8f2dc,inset 0 0 0 3px {G}}}
.mban span::before,.mban span::after{{content:"";position:absolute;top:0;bottom:0;width:27%;background:{GD} var(--rose) no-repeat center/auto 92%;box-shadow:inset 0 0 0 2px {G}}}
.mban span::before{{left:0;clip-path:polygon(0 0,100% 0,86% 50%,100% 100%,0 100%)}}
.mban span::after{{right:0;clip-path:polygon(0 0,100% 0,100% 100%,0 100%,14% 50%)}}
.mban b{{position:relative;z-index:1;color:#14301f}}
.mnum span{{color:{GD};border-color:{G};background:#f4ead0;box-shadow:inset 0 0 0 2px #f8f2dc,inset 0 0 0 3px {G}}}
'''
open('/root/ayah-youm/site/frame.css', 'w').write(css)
print(len(css))
