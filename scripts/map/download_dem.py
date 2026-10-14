import math, os, sys, urllib.request, concurrent.futures as cf
Z=9
def tx(lon): return (lon+180)/360*2**Z
def ty(lat): r=math.radians(lat); return (1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*2**Z
x0,x1=int(tx(69.0)),int(tx(80.6)); y0,y1=int(ty(43.6)),int(ty(39.0))
print('tiles x',x0,x1,'y',y0,y1,(x1-x0+1)*(y1-y0+1))
def get(xy):
    x,y=xy; p=f'geo/dem/{x}_{y}.png'
    if os.path.exists(p): return 0
    urllib.request.urlretrieve(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png',p); return 1
with cf.ThreadPoolExecutor(8) as ex: print(sum(ex.map(get,[(x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)])))
