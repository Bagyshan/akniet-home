# Steel A-frame in cabinet-oblique projection → SVG for the "Несущий каркас — всегда металл" section.
import math, sys
S = 46                      # px per metre
DEP, ANG = 0.62, math.radians(28)
L, B, HT = 8.0, 6.0, 6.2    # length (depth), width, ridge height
FR = [0, 1.6, 3.2, 4.8, 6.4, 8.0]
COL = 3.3                   # collar (mezzanine) height
def P(x, y, z): return (y * S + x * S * DEP * math.cos(ANG), -z * S - x * S * DEP * math.sin(ANG))
def yz(z): return z / HT * (B / 2)   # left slope y at height z

items = []  # (depth for painter order, svg)
def gold(x):  # far members a little darker
    t = x / L
    c0, c1 = (226, 176, 77), (150, 112, 42)
    return '#%02x%02x%02x' % tuple(round(a + (b - a) * t) for a, b in zip(c0, c1))
def member(a, b, w, depth, cls='m', color=None, delay=0):
    (x1, y1), (x2, y2) = P(*a), P(*b)
    d = f'M{x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}'
    col = color or gold(depth)
    items.append((depth, f'<g class="{cls}" style="--d:{delay:.2f}s"><path class="halo" pathLength="1" d="{d}" stroke-width="{w + 5}"/><path pathLength="1" d="{d}" stroke="{col}" stroke-width="{w}"/></g>'))
def poly(pts, fill, depth, cls, extra=''):
    d = 'M' + 'L'.join('%.1f %.1f' % P(*p) for p in pts) + 'Z'
    items.append((depth, f'<path class="{cls}" d="{d}" fill="{fill}" {extra}/>'))
def boards(p0, p1, q0, q1, n, depth, cls='w'):  # n boards between edges p0-p1 and q0-q1
    for i in range(1, n):
        t = i / n
        a = [p0[k] + (q0[k] - p0[k]) * t for k in range(3)]; b = [p1[k] + (q1[k] - p1[k]) * t for k in range(3)]
        (x1, y1), (x2, y2) = P(*a), P(*b)
        items.append((depth, f'<path class="{cls}" d="M{x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}"/>'))

# ---- wood (drawn first at each depth, metal over it) ----
poly([(0, 0, 0), (L, 0, 0), (L, B, 0), (0, B, 0)], 'url(#oak)', L + 0.5, 'wood')                          # ground floor deck
boards((0, 0, 0), (L, 0, 0), (0, B, 0), (L, B, 0), 14, L + 0.49)
m0, m1 = yz(COL), B - yz(COL)
poly([(2.2, m0, COL), (L, m0, COL), (L, m1, COL), (2.2, m1, COL)], 'url(#oak)', L + 0.3, 'wood')            # mezzanine
boards((2.2, m0, COL), (L, m0, COL), (2.2, m1, COL), (L, m1, COL), 6, L + 0.29)
poly([(L, 0, 0), (L, B / 2, HT), (L, B, 0)], 'url(#oak-wall)', L + 0.2, 'wood')                              # back gable lining
for i in range(1, 12):
    y = B * i / 12; z = min(y, B - y) / (B / 2) * HT
    (x1, y1), (x2, y2) = P(L, y, 0), P(L, y, z)
    items.append((L + 0.19, f'<path class="w" d="M{x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}"/>'))

# ---- piles + grillage ----
for x in (0, L / 2, L):
    for y in (0, B / 2, B):
        (px_, py_) = P(x, y, -1.0); (qx, qy) = P(x, y, 0)
        items.append((x + 0.1, f'<g class="pile" style="--d:{0.05 * x:.2f}s"><rect x="{px_ - 6:.1f}" y="{qy:.1f}" width="12" height="{py_ - qy:.1f}" rx="2"/></g>'))
for y in (0, B):
    member((0, y, 0), (L, y, 0), 7, 4 + (0.01 if y else -0.01), delay=0.15)
member((0, 0, 0), (0, B, 0), 7, -0.02, delay=0.15)
member((L, 0, 0), (L, B, 0), 7, L, delay=0.15)

# ---- frames: rafters, collar, knee braces ----
for i, x in enumerate(FR):
    dl = 0.35 + (len(FR) - 1 - i) * 0.12  # back frames first
    member((x, 0, 0), (x, B / 2, HT), 8, x, delay=dl)
    member((x, B, 0), (x, B / 2, HT), 8, x, delay=dl)
    member((x, yz(COL), COL), (x, B - yz(COL), COL), 6, x - 0.01, delay=dl + 0.15)
    zb = HT - 1.4
    member((x, yz(zb), zb), (x, B / 2, HT - 0.35), 3, x - 0.02, delay=dl + 0.25)
    member((x, B - yz(zb), zb), (x, B / 2, HT - 0.35), 3, x - 0.02, delay=dl + 0.25)
# ---- ridge + purlins ----
member((0, B / 2, HT), (L, B / 2, HT), 6, L / 2 - 0.5, delay=1.1)
for z in (1.1, 2.2, 4.4, 5.3):
    for side in (0, 1):
        y = yz(z) if not side else B - yz(z)
        member((0, y, z), (L, y, z), 3.4, L / 2 - 0.4, delay=1.2 + z * 0.05)
# ---- front gable: posts for the panoramic glazing ----
for y in (1.5, B / 2, B - 1.5):
    top = HT if y == B / 2 else min(y, B - y) / (B / 2) * HT
    member((0, y, 0), (0, y, top), 4, -0.05, delay=1.5)
member((0, 0.6, 1.2), (0, B - 0.6, 1.2), 3, -0.06, delay=1.55)

# ---- callouts ----
def callout(pt, dx, dy, text, anchor='start', cls=''):
    x, y = P(*pt); tx, ty = x + dx, y + dy
    return (f'<g class="callout{cls}"><circle cx="{x:.1f}" cy="{y:.1f}" r="3.5"/><path d="M{x:.1f} {y:.1f}L{tx:.1f} {ty:.1f}"/>'
            f'<text x="{tx + (6 if anchor == "start" else -6):.1f}" y="{ty + 4:.1f}" text-anchor="{anchor}">{text}</text></g>')
calls = [
    callout((0, B / 2, HT), -60, -18, 'Конёк', 'end'),
    callout((0, yz(4.0), 4.0), -78, 0, 'Стропильная рама', 'end'),
    callout((L * 0.75, B - yz(4.4), 4.4), 92, -10, 'Прогоны'),
    callout((L, B - yz(COL), COL), 96, -6, 'Ригель антресоли'),
    callout((0, 1.5, 0.6), -70, 34, 'Стойки остекления', 'end'),
    callout((0, B, 0), 62, 30, 'Ростверк'),
    callout((0, B, -0.9), 46, 22, 'Сваи'),
]

# bounds
pts = [P(x, y, z) for x in (0, L) for y in (0, B) for z in (-1.0, HT)]
minx = min(p[0] for p in pts) - 150; maxx = max(p[0] for p in pts) + 150
miny = min(p[1] for p in pts) - 24; maxy = max(p[1] for p in pts) + 36
gx0, gx1 = P(0, -1.5, -1.0)[0], P(0, B + 1.5, -1.0)[0]
gy = P(0, 0, -1.0)[1]
items.sort(key=lambda t: -t[0])  # far → near
svg = f'''<svg class="frame-svg" id="frame-svg" viewBox="{minx:.0f} {miny:.0f} {maxx - minx:.0f} {maxy - miny:.0f}" role="img" aria-label="Схема A-frame: несущий металлический каркас на сваях, деревянные полы и отделка">
          <defs>
            <linearGradient id="oak" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9a27a" stop-opacity=".34"/><stop offset="1" stop-color="#8a5a35" stop-opacity=".22"/></linearGradient>
            <linearGradient id="oak-wall" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b98a5a" stop-opacity=".28"/><stop offset="1" stop-color="#c9a27a" stop-opacity=".12"/></linearGradient>
            <radialGradient id="glow" cx=".5" cy=".55" r=".55"><stop offset="0" stop-color="#d5a039" stop-opacity=".14"/><stop offset="1" stop-color="#d5a039" stop-opacity="0"/></radialGradient>
          </defs>
          <ellipse cx="{(minx + maxx) / 2:.0f}" cy="{(miny + maxy) / 2 + 20:.0f}" rx="{(maxx - minx) / 2.2:.0f}" ry="{(maxy - miny) / 2.4:.0f}" fill="url(#glow)"/>
          <path class="ground" d="M{gx0:.1f} {gy:.1f}L{P(L, B + 1.5, -1.0)[0]:.1f} {P(L, B + 1.5, -1.0)[1]:.1f}"/>
          <path class="ground" d="M{gx0:.1f} {gy:.1f}L{gx1:.1f} {gy:.1f}"/>
          ''' + '\n          '.join(t[1] for t in items) + '\n          ' + '\n          '.join(calls) + '\n        </svg>'
open(sys.argv[1], 'w').write(svg)
print(len(svg), 'bytes', 'viewBox', minx, miny, maxx - minx, maxy - miny)
