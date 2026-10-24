import json, math, sys
from PIL import Image

W, H = 1024, 640
raw = json.load(open(sys.argv[1]))
doc = raw.get("doc", raw)
img = Image.open(sys.argv[2]).convert("RGB")
px = img.load()
bg = px[2, 2]


def is_bg(c):
    return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) < 18


def mat_identity():
    return [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


def mat_mul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def mat_trs(p, r, s):
    cx, sx = math.cos(r[0]), math.sin(r[0])
    cy, sy = math.cos(r[1]), math.sin(r[1])
    cz, sz = math.cos(r[2]), math.sin(r[2])
    Rx = [[1, 0, 0, 0], [0, cx, -sx, 0], [0, sx, cx, 0], [0, 0, 0, 1]]
    Ry = [[cy, 0, sy, 0], [0, 1, 0, 0], [-sy, 0, cy, 0], [0, 0, 0, 1]]
    Rz = [[cz, -sz, 0, 0], [sz, cz, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    R = mat_mul(mat_mul(Rz, Ry), Rx)
    M = mat_identity()
    for i in range(3):
        for j in range(3):
            M[i][j] = R[i][j] * s[j]
        M[i][3] = p[i]
    return M


def world_of(nid, cache):
    if nid in cache:
        return cache[nid]
    n = doc["nodes"][nid]
    t = n["transform"]
    local = mat_trs(t["p"], t["r"], t["s"])
    par = n.get("parent")
    M = mat_mul(world_of(par, cache), local) if par in doc["nodes"] else local
    cache[nid] = M
    return M


def apply(M, v):
    return [sum(M[i][k] * (v[k] if k < 3 else 1.0) for k in range(4)) for i in range(3)]


def local_size(g):
    if g["type"] == "box":
        return [g["size"][0] / 2, g["size"][1] / 2, g["size"][2] / 2]
    if g["type"] == "sphere":
        return [g["radius"]] * 3
    if g["type"] == "cylinder":
        r = max(g["radiusTop"], g["radiusBottom"])
        return [r, g["height"] / 2, r]
    if g["type"] == "plane":
        return [g["width"] / 2, g["height"] / 2, 0.0]
    p = g["positions"]
    xs, ys, zs = p[0::3], p[1::3], p[2::3]
    return [(max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2, (max(zs) - min(zs)) / 2]


cam = doc["camera"]
eye = cam["p"]
tgt = cam["target"]
fov = cam["fov"]
f = [tgt[i] - eye[i] for i in range(3)]
fl = math.sqrt(sum(v * v for v in f))
f = [v / fl for v in f]
up0 = [0.0, 1.0, 0.0]
rgt = [f[1] * up0[2] - f[2] * up0[1], f[2] * up0[0] - f[0] * up0[2], f[0] * up0[1] - f[1] * up0[0]]
rl = math.sqrt(sum(v * v for v in rgt))
rgt = [v / rl for v in rgt]
up = [rgt[1] * f[2] - rgt[2] * f[1], rgt[2] * f[0] - rgt[0] * f[2], rgt[0] * f[1] - rgt[1] * f[0]]
th = math.tan(math.radians(fov) / 2)


def project(p):
    d = [p[i] - eye[i] for i in range(3)]
    z = sum(d[i] * f[i] for i in range(3))
    if z <= 0.05:
        return None
    x = sum(d[i] * rgt[i] for i in range(3))
    y = sum(d[i] * up[i] for i in range(3))
    ndc_x = x / (z * th * (W / H))
    ndc_y = y / (z * th)
    return ((ndc_x + 1) / 2 * W, (1 - ndc_y) / 2 * H)


cache = {}
miss = []
hit = 0
for nid, n in doc["nodes"].items():
    if n.get("kind") != "mesh":
        continue
    c = apply(world_of(nid, cache), [0, 0, 0])
    sp = project(c)
    if sp is None:
        continue
    x, y = int(sp[0]), int(sp[1])
    if not (1 <= x < W - 1 and 1 <= y < H - 1):
        miss.append((n["name"], x, y, "offscreen", n["geometry"]["type"], [round(v, 2) for v in c]))
        continue
    solid = False
    for dx in (-2, 0, 2):
        for dy in (-2, 0, 2):
            if not is_bg(px[min(W - 1, max(0, x + dx)), min(H - 1, max(0, y + dy))]):
                solid = True
    if solid:
        hit += 1
    else:
        miss.append((n["name"], x, y, "bg", n["geometry"]["type"], [round(v, 2) for v in c]))

print("bg", bg, "hit", hit, "miss", len(miss))
for m in miss[:14]:
    print(m)
