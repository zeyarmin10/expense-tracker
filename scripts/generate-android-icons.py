"""Generate Android launcher icons, splash assets and the master SVG from the
brand-loader artwork in brand-loader.component.ts.

Needs Google Chrome (headless render) and macOS sips.
Usage: python3 scripts/generate-android-icons.py . /tmp/icon-work
"""
import math, os, re, subprocess, sys
import xml.etree.ElementTree as ET

ROOT, WORK = sys.argv[1], sys.argv[2]
RES = f'{ROOT}/android/app/src/main/res'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
os.makedirs(WORK, exist_ok=True)

# ---------------------------------------------------------------- artwork
comp = open(f'{ROOT}/src/app/components/common/brand-loader/brand-loader.component.ts').read()
a = comp.index('<svg class="bl-wallet"')
b = comp.index('</svg>', a) + len('</svg>')
svg_src = comp[a:b]

CX, CY = 619, 518          # centre of the artwork in SVG user units
R = 440                    # radius (user units) of the circle the artwork fits in


def master_svg(side):
    """Plain SVG (no classes/animation) centred in a square viewBox of `side` units."""
    s = re.sub(r'\sclass="[^"]*"', '', svg_src)
    s = re.sub(r'viewBox="[^"]*"', f'viewBox="{CX - side/2:g} {CY - side/2:g} {side:g} {side:g}"', s, count=1)
    s = s.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
    return s


# Master SVG for the repo (tight crop, like the original icon)
open(f'{ROOT}/resources/app-icon.svg', 'w').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<!-- KyatWise app icon. Generated from brand-loader.component.ts -->\n'
    + master_svg(760) + '\n')


def shoot(name, w, h, body, bg='transparent'):
    html = f'''<html><head><style>html,body{{margin:0;width:{w}px;height:{h}px;background:{bg};overflow:hidden}}
    .c{{width:100%;height:100%;display:flex;align-items:center;justify-content:center}} svg{{display:block}}</style></head>
    <body>{body}</body></html>'''
    hp = f'{WORK}/{name}.html'
    out = f'{WORK}/{name}.png'
    open(hp, 'w').write(html)
    subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                    '--default-background-color=00000000', f'--window-size={w},{h}',
                    f'--screenshot={out}', f'file://{hp}'], capture_output=True)
    return out


def resize(src, px, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(['sips', '-z', str(px), str(px), src, '--out', dst], capture_output=True)


def sized(side, px):
    return master_svg(side).replace('<svg ', f'<svg width="{px}" height="{px}" ', 1)


DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

# ----------------------------------------------- adaptive icon (API 26+)
# 108dp canvas; the launcher mask always shows the central 66dp circle.
FG_SIDE = R * 108 / 33
big = 1296
fg = shoot('fg', big, big, f'<div class="c">{sized(FG_SIDE, big)}</div>')
mono_filter = '''<svg width="0" height="0" style="position:absolute"><filter id="m" color-interpolation-filters="sRGB">
  <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.3 -1 -0.1 0 1.4"/></filter></svg>'''
mono = shoot('mono', big, big, f'{mono_filter}<div class="c" style="background:#fff;filter:url(#m)">{sized(FG_SIDE, big)}</div>')
bgp = shoot('bg', big, big, '', bg='#ffffff')
for d, k in DENS.items():
    px = round(108 * k)
    resize(fg, px, f'{RES}/mipmap-{d}/ic_launcher_foreground.png')
    resize(mono, px, f'{RES}/mipmap-{d}/ic_launcher_monochrome.png')
    resize(bgp, px, f'{RES}/mipmap-{d}/ic_launcher_background.png')

# ------------------------------------------- legacy icons (API 24-25)
lg = 768
sq = shoot('legacy', lg, lg, f'<div class="c" style="width:92%;height:92%;margin:4%;background:#fff;border-radius:18%;box-shadow:0 0 0 1px rgba(0,0,0,.04)">{sized(800, round(lg*0.92))}</div>')
rd = shoot('round', lg, lg, f'<div class="c" style="width:92%;height:92%;margin:4%;background:#fff;border-radius:50%">{sized(R/0.42, round(lg*0.92))}</div>')
for d, k in DENS.items():
    px = round(48 * k)
    resize(sq, px, f'{RES}/mipmap-{d}/ic_launcher.png')
    resize(rd, px, f'{RES}/mipmap-{d}/ic_launcher_round.png')

# Play Store listing icon (full-bleed square, Play applies its own mask)
ps = shoot('play', 1024, 1024, f'<div class="c">{sized(1000, 1024)}</div>', bg='#ffffff')
resize(ps, 512, f'{ROOT}/resources/play-store-icon-512.png')

# ---------------------------------------------- legacy full-screen splash
for f in sorted(os.listdir(RES)):
    p = f'{RES}/{f}/splash.png'
    if f.startswith('drawable') and os.path.exists(p):
        out = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', p], capture_output=True, text=True).stdout
        w, h = [int(x) for x in re.findall(r'pixel\w+: (\d+)', out)]
        art = round(min(w, h) * 0.42)
        shot = shoot(f'splash_{f}', w, h, f'<div class="c">{sized(760, art)}</div>', bg='#ffffff')
        subprocess.run(['cp', shot, p])

# --------------------------------- animated splash icon (API 31+, AVD)
SPLASH_SIDE = R * 3          # 288dp canvas; the icon must fit a 192dp circle
NS = 'http://schemas.android.com/apk/res/android'
tree = ET.fromstring(svg_src)
CLIPS = {cp.get('id'): ' '.join(
    f"M{float(r.get('x')):g} {float(r.get('y')):g} h{float(r.get('width')):g} v{float(r.get('height')):g} h{-float(r.get('width')):g} Z"
    for r in cp.iter('rect')) for cp in tree.iter('clipPath')}


def color(c):
    if c in (None, 'none'):
        return None
    return {'white': '#FFFFFF', 'black': '#000000'}.get(c, c.upper())


def nums(d):
    v = [float(x) for x in re.findall(r'-?\d*\.?\d+', d)]
    return v[0::2], v[1::2]


def bbox(el):
    xs, ys = [], []
    for p in el.iter('path'):
        x, y = nums(p.get('d'))
        xs += x; ys += y
    return min(xs), min(ys), max(xs), max(ys)


def dashes(d, on, off):
    """Turn a stroked M/L/C path into dash segments (VectorDrawable has no dasharray)."""
    pts_list, cur = [], None
    for cmd, args in re.findall(r'([MLC])([^MLC]*)', d):
        v = [float(x) for x in re.findall(r'-?\d*\.?\d+', args)]
        if cmd == 'M':
            cur = [(v[0], v[1])]; pts_list.append(cur)
        elif cmd == 'L':
            cur.append((v[0], v[1]))
        else:
            p0 = cur[-1]; p1, p2, p3 = (v[0], v[1]), (v[2], v[3]), (v[4], v[5])
            for i in range(1, 25):
                t = i / 24; u = 1 - t
                cur.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                            u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    out = []
    for pts in pts_list:
        pos, drawing, left, seg = 0.0, True, on, [pts[0]]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            L = math.hypot(x1 - x0, y1 - y0); t0 = 0.0
            while L - t0 > left:
                t0 += left; f = t0 / L
                p = (x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)
                if drawing:
                    seg.append(p); out.append(seg)
                else:
                    seg = [p]
                drawing = not drawing; left = on if drawing else off
            left -= (L - t0)
            if drawing:
                seg.append((x1, y1))
        if drawing and len(seg) > 1:
            out.append(seg)
    return ' '.join('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in s) for s in out)


def emit(el, inh, lines, ind):
    sp = '    ' * ind
    tag = el.tag
    if tag == 'defs':
        return
    attrs = dict(inh)
    for k in ('fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap', 'stroke-dasharray', 'paint-order'):
        if el.get(k) is not None:
            attrs[k] = el.get(k)
    if tag == 'g':
        cls = (el.get('class') or '').split()
        name = next((c for c in cls if re.match(r'bl-(paper|bar)-\d', c)), None) or next((c for c in cls if c in ('bl-coin', 'bl-stitch')), None)
        if name == 'bl-stitch':
            p = el.find('path')
            lines.append(f'{sp}<path android:strokeColor="{color(attrs["stroke"])}" android:strokeWidth="{attrs["stroke-width"]}" '
                         f'android:strokeLineCap="round" android:pathData="{dashes(p.get("d"), 17, 21)}"/>')
            return
        if name:
            x0, y0, x1, y1 = bbox(el)
            px, py = ((x0 + x1) / 2, y1) if 'paper' in name else ((x0 + x1) / 2, (y0 + y1) / 2)
            lines.append(f'{sp}<group android:name="{name[3:].replace("-", "")}" android:pivotX="{px:.1f}" android:pivotY="{py:.1f}">')
            for ch in el:
                emit(ch, attrs, lines, ind + 1)
            lines.append(f'{sp}</group>')
        else:
            for ch in el:
                emit(ch, attrs, lines, ind)
        return
    if tag != 'path':
        return
    d = el.get('d')
    cls = (el.get('class') or '').split()
    bar = next((c for c in cls if c.startswith('bl-bar-')), None)
    fill = color(attrs.get('fill'))
    stroke = color(attrs.get('stroke'))
    body = []
    if stroke and attrs.get('paint-order') == 'stroke':
        # paint-order="stroke": stroke underneath, fill on top
        body.append(f'<path android:fillColor="{fill}" android:strokeColor="{stroke}" android:strokeWidth="{attrs["stroke-width"]}" '
                    f'android:strokeLineJoin="round" android:pathData="{d}"/>')
        body.append(f'<path android:fillColor="{fill}" android:pathData="{d}"/>')
    elif stroke:
        cap = attrs.get('stroke-linecap')
        body.append(f'<path android:strokeColor="{stroke}" android:strokeWidth="{attrs["stroke-width"]}" '
                    f'android:strokeLineJoin="{attrs.get("stroke-linejoin", "miter")}"'
                    + (f' android:strokeLineCap="{cap}"' if cap else '') + f' android:pathData="{d}"/>')
    else:
        body.append(f'<path android:fillColor="{fill}" android:pathData="{d}"/>')
    if el.get('clip-path'):
        cid = re.search(r'#([^)]+)', el.get('clip-path')).group(1)
        lines.append(f'{sp}<group>')
        lines.append(f'{sp}    <clip-path android:pathData="{CLIPS[cid]}"/>')
        lines += [f'{sp}    {x}' for x in body]
        lines.append(f'{sp}</group>')
    elif bar:
        x0, y0, x1, y1 = bbox(el)
        lines.append(f'{sp}<group android:name="{bar[3:].replace("-", "")}" android:pivotX="{(x0+x1)/2:.1f}" android:pivotY="{y1:.1f}">')
        lines += [f'{sp}    {x}' for x in body]
        lines.append(f'{sp}</group>')
    else:
        lines += [f'{sp}{x}' for x in body]


vec = []
for ch in tree:
    emit(ch, {}, vec, 3)
tx, ty = -(CX - SPLASH_SIDE / 2), -(CY - SPLASH_SIDE / 2)


def anim(name, steps):
    """steps: list of (startOffset, duration, {prop: (from, to)}, interpolator)."""
    out = [f'    <target android:name="{name}">', '        <aapt:attr name="android:animation">',
           '            <set android:ordering="together">']
    for off, dur, props, interp in steps:
        for prop, (fr, to) in props.items():
            out.append(f'                <objectAnimator android:propertyName="{prop}" android:startOffset="{off}" '
                       f'android:duration="{dur}" android:valueFrom="{fr}" android:valueTo="{to}" '
                       f'android:valueType="floatType" android:interpolator="@android:interpolator/{interp}"/>')
    out += ['            </set>', '        </aapt:attr>', '    </target>']
    return out


def pull(start, dx, tilt):
    return [(start, 240, {'translateX': (0, dx), 'translateY': (0, -24), 'rotation': (0, tilt)}, 'decelerate_quad'),
            (start + 240, 180, {'translateX': (dx, 0), 'translateY': (-24, 3), 'rotation': (tilt, 0)}, 'accelerate_quad'),
            (start + 420, 120, {'translateY': (3, 0)}, 'decelerate_quad')]


targets = []
targets += anim('paper1', pull(0, -9, -1.5))
targets += anim('paper2', pull(160, 11, 1))
targets += anim('paper3', pull(320, 12, 1.5))
for i, dur in ((1, 420), (2, 520), (3, 620)):
    targets += anim(f'bar{i}', [(0, dur, {'scaleY': (0.25, 1)}, 'decelerate_cubic')])
targets += anim('coin', [(560, 180, {'scaleX': (1, 1.15), 'scaleY': (1, 1.15)}, 'decelerate_quad'),
                         (740, 220, {'scaleX': (1.15, 1), 'scaleY': (1.15, 1)}, 'accelerate_decelerate')])

avd = f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Animated splash icon (Android 12+): the brand-loader wallet. Papers are pulled up
     one after another, the bars grow and the clasp button pulses, all within 1s.
     Android 11 and below show the first frame (the resting icon).
     Generated from src/app/components/common/brand-loader/brand-loader.component.ts -->
<animated-vector xmlns:android="{NS}" xmlns:aapt="http://schemas.android.com/aapt">
    <aapt:attr name="android:drawable">
        <vector android:width="288dp" android:height="288dp"
            android:viewportWidth="{SPLASH_SIDE:g}" android:viewportHeight="{SPLASH_SIDE:g}">
        <group android:name="root" android:translateX="{tx:g}" android:translateY="{ty:g}">
''' + '\n'.join(vec) + '''
        </group>
        </vector>
    </aapt:attr>
''' + '\n'.join(targets) + '\n</animated-vector>\n'
open(f'{RES}/drawable/splash_icon.xml', 'w').write(avd)
old = f'{RES}/drawable-nodpi/splash_icon.png'
if os.path.exists(old):
    os.remove(old)
print('done')
