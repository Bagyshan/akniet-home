# Builds the Kyrgyzstan map: relief.webp (hillshade from SRTM terrain tiles) + kg-geo.js (vector layers in the same pixel grid)
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
OUT = sys.argv[1]
Z = 9; T = 256
LON0, LON1, LAT0, LAT1 = 69.0, 80.6, 39.0, 43.6
def wx(lon): return (lon + 180) / 360 * 2**Z * T
def wy(lat): r = math.radians(lat); return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**Z * T
X0, X1, Y0, Y1 = wx(LON0), wx(LON1), wy(LAT1), wy(LAT0)
W, H = round(X1 - X0), round(Y1 - Y0)
px = lambda lon, lat: (wx(lon) - X0, wy(lat) - Y0)
print('base', W, H)

# ---- DEM mosaic ----
tx0, ty0 = int(X0 // T), int(Y0 // T); tx1, ty1 = int(X1 // T), int(Y1 // T)
dem = np.zeros(((ty1 - ty0 + 1) * T, (tx1 - tx0 + 1) * T), np.float32)
for x in range(tx0, tx1 + 1):
    for y in range(ty0, ty1 + 1):
        a = np.asarray(Image.open(f'geo/dem/{x}_{y}.png').convert('RGB'), np.float32)
        dem[(y - ty0) * T:(y - ty0 + 1) * T, (x - tx0) * T:(x - tx0 + 1) * T] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
ox, oy = round(X0 - tx0 * T), round(Y0 - ty0 * T)
dem = dem[oy:oy + H, ox:ox + W]
dem = np.maximum(dem, 0)

# ---- hillshade: several light directions blended, softer and more readable than one ----
cell = 156543.03 * math.cos(math.radians(41.3)) / 2**Z
gy, gx = np.gradient(dem, cell)
gx *= 2.2; gy *= 2.2  # vertical exaggeration
slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
def shade(az, alt):
    az, alt = math.radians(az), math.radians(alt)
    return np.clip(np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0, 1)
hs = 0.5 * shade(315, 40) + 0.3 * shade(270, 45) + 0.2 * shade(0, 50)
flat = shade(315, 40).mean()

# ---- Kyrgyzstan polygon mask ----
def rings(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    return [r for p in polys for r in p]
adm0 = json.load(open('geo/ne_10m_admin_0_countries.geojson'))
kgz = next(f for f in adm0['features'] if f['properties'].get('ADM0_A3') == 'KGZ')
mask_img = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mask_img)
for p in (kgz['geometry']['coordinates'] if kgz['geometry']['type'] == 'MultiPolygon' else [kgz['geometry']['coordinates']]):
    d.polygon([px(*c) for c in p[0]], fill=255)
    for hole in p[1:]: d.polygon([px(*c) for c in hole], fill=0)
mask = np.asarray(mask_img.filter(ImageFilter.GaussianBlur(3)), np.float32) / 255

# ---- colour: dark warm graphite; flat land stays dark, lit slopes lighter, shaded slopes darker ----
d = hs - flat
up = np.clip(d / 0.34, 0, 1)[..., None] ** 0.9
down = np.clip(-d / 0.55, 0, 1)[..., None]
elev = np.clip((dem - 1500) / 4000, 0, 1)[..., None]
base_in, base_out = np.array([46, 42, 48], np.float32), np.array([31, 28, 32], np.float32)
light = np.array([150, 138, 134], np.float32) * (0.85 + 0.15 * elev)  # peaks catch a bit more light
shadow = np.array([18, 16, 20], np.float32)
inside = base_in + (light - base_in) * up - (base_in - shadow) * down
outside = base_out + (np.array([78, 72, 74], np.float32) - base_out) * up * 0.8 - (base_out - shadow) * down * 0.7
img = outside + (inside - outside) * mask[..., None]
rgb = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')
SCALE = 0.8  # relief is stored at 80 % of the base grid; vectors stay sharp at any zoom
rgb = rgb.resize((round(W * SCALE), round(H * SCALE)), Image.LANCZOS)
rgb.save(os.path.join(OUT, 'relief.webp'), quality=70, method=6)
print('relief', rgb.size, os.path.getsize(os.path.join(OUT, 'relief.webp')) // 1024, 'KB')

# ---- vectors ----
def dp(pts, eps):
    if len(pts) < 3: return pts
    a, b = np.array(pts[0]), np.array(pts[-1]); ab = b - a; n = np.hypot(*ab)
    P = np.array(pts)
    dist = np.abs(ab[0] * (P[:, 1] - a[1]) - ab[1] * (P[:, 0] - a[0])) / n if n else np.hypot(*(P - a).T)
    i = int(dist.argmax())
    if dist[i] > eps: return dp(pts[:i + 1], eps)[:-1] + dp(pts[i:], eps)
    return [pts[0], pts[-1]]
def path(ring, closed=True, eps=0.7):
    pts = dp([px(*c) for c in ring], eps)
    if len(pts) < 2: return ''
    s = 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts)
    return s + ('Z' if closed else '')
sys.setrecursionlimit(100000)
border = ''.join(path(r) for r in rings(kgz['geometry']))

NAMES = {  # ru / ky
 'Ysyk-Köl': ('Иссык-Кульская область', 'Ысык-Көл облусу'), 'Naryn': ('Нарынская область', 'Нарын облусу'),
 'Osh': ('Ошская область', 'Ош облусу'), 'Chuy': ('Чуйская область', 'Чүй облусу'), 'Talas': ('Таласская область', 'Талас облусу'),
 'Jalal-Abad': ('Джалал-Абадская область', 'Жалал-Абад облусу'), 'Batken': ('Баткенская область', 'Баткен облусу')}
# label anchors picked by hand inside each region (lon, lat)
ANCHOR = {'Ysyk-Köl': (78.4, 41.95), 'Naryn': (75.3, 41.25), 'Osh': (73.6, 39.85), 'Chuy': (74.0, 42.45),
          'Talas': (72.0, 42.25), 'Jalal-Abad': (72.3, 41.55), 'Batken': (70.6, 39.75)}
adm1 = json.load(open('geo/ne_10m_admin_1_states_provinces.geojson'))
oblasts = []
for f in adm1['features']:
    p = f['properties']
    if p.get('adm0_a3') != 'KGZ': continue
    d_ = ''.join(path(r) for r in rings(f['geometry']))
    o = {'d': d_}
    if p['name'] in NAMES:
        o['ru'], o['ky'] = NAMES[p['name']]; o['x'], o['y'] = [round(v, 1) for v in px(*ANCHOR[p['name']])]
    oblasts.append(o)

lakes_src = json.load(open('geo/ne_10m_lakes.geojson'))
LAKE_NAMES = {'Issyk-Kul': ('Иссык-Куль', 'Ысык-Көл'), 'Toktogul Suu Saktagychy': ('Токтогульское вдхр.', 'Токтогул суу сактагычы')}
lakes = []
for f in lakes_src['features']:
    rs = rings(f['geometry'])
    xs = [c[0] for r in rs for c in r]; ys = [c[1] for r in rs for c in r]
    if not xs or max(xs) < LON0 or min(xs) > LON1 or max(ys) < LAT0 or min(ys) > LAT1: continue
    lk = {'d': ''.join(path(r, eps=0.5) for r in rs)}
    n = f['properties'].get('name')
    if n in LAKE_NAMES:
        lk['ru'], lk['ky'] = LAKE_NAMES[n]
        lk['x'], lk['y'] = round((wx((min(xs) + max(xs)) / 2) - X0), 1), round((wy((min(ys) + max(ys)) / 2) - Y0), 1)
    lakes.append(lk)

rivers_src = json.load(open('geo/ne_10m_rivers_lake_centerlines.geojson'))
rivers = ''
for f in rivers_src['features']:
    g = f['geometry']
    if not g: continue
    lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
    for ln in lines:
        seg = []
        for c in ln + [None]:
            if c and LON0 - .3 <= c[0] <= LON1 + .3 and LAT0 - .3 <= c[1] <= LAT1 + .3: seg.append(c); continue
            if len(seg) > 1: rivers += path(seg, closed=False, eps=0.8)
            seg = []

CITIES = [  # lon, lat, ru, ky, capital
 (74.5698, 42.8746, 'Бишкек', 'Бишкек', 1), (72.7985, 40.5283, 'Ош', 'Ош', 0), (73.0000, 40.9333, 'Джалал-Абад', 'Жалал-Абад', 0),
 (78.3936, 42.4907, 'Каракол', 'Каракол', 0), (75.9911, 41.4287, 'Нарын', 'Нарын', 0), (72.2427, 42.5228, 'Талас', 'Талас', 0),
 (70.8194, 40.0628, 'Баткен', 'Баткен', 0), (77.0822, 42.6494, 'Чолпон-Ата', 'Чолпон-Ата', 0), (75.2992, 42.8406, 'Токмок', 'Токмок', 0)]
cities = [{'x': round(px(lo, la)[0], 1), 'y': round(px(lo, la)[1], 1), 'ru': ru, 'ky': ky, 'cap': cap} for lo, la, ru, ky, cap in CITIES]

data = {'w': W, 'h': H, 'z': Z, 'x0': round(X0, 2), 'y0': round(Y0, 2), 'border': border, 'oblasts': oblasts, 'lakes': lakes, 'rivers': rivers, 'cities': cities}
js = '/* Kyrgyzstan map: Natural Earth (public domain) vectors in Web Mercator pixels, zoom ' + str(Z) + '. Generated — do not edit. */\nwindow.aknietMapData=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(os.path.join(OUT, 'kg-geo.js'), 'w').write(js)
print('kg-geo.js', len(js) // 1024, 'KB', 'oblasts', len(oblasts), 'lakes', len(lakes))
