import json, math, sys
from pathlib import Path

ROOM = sys.argv[1] if len(sys.argv) > 1 else "r_0uyuub9x"
d = json.loads((Path(".devhome/rooms") / f"{ROOM}.json").read_text())["doc"]
nodes = d["nodes"]
kids = {k: [] for k in nodes}
for k, n in nodes.items():
    if n.get("parent"):
        kids[n["parent"]].append(k)


def euler(r):
    x, y, z = r
    a, b = math.cos(x), math.sin(x)
    c, e = math.cos(y), math.sin(y)
    f, g = math.cos(z), math.sin(z)
    return [[c * f, -c * g, e],
            [a * g + b * e * f, a * f - b * e * g, -b * c],
            [b * g - a * e * f, b * f + a * e * g, a * c]]


def size_of(n):
    gm = n.get("geometry") or {}
    t = gm.get("type")
    if t == "box":
        return gm["size"]
    if t == "sphere":
        return [gm["radius"] * 2] * 3
    if t == "cylinder":
        rt = gm.get("radiusTop", gm.get("radius_top", 0))
        rb = gm.get("radiusBottom", gm.get("radius_bottom", 0))
        return [max(rt, rb) * 2, gm.get("height", 1), max(rt, rb) * 2]
    if t == "plane":
        return [gm.get("width", 1), 0.001, gm.get("height", 1)]
    return [1, 1, 1]


I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
acc = {}


def walk(k, pM, pT):
    t = nodes[k].get("transform", {})
    R, s, p = euler(t.get("r", [0, 0, 0])), t.get("s", [1, 1, 1]), t.get("p", [0, 0, 0])
    M = [[R[i][j] * s[j] for j in range(3)] for i in range(3)]
    T = [pT[i] + sum(pM[i][j] * p[j] for j in range(3)) for i in range(3)]
    acc[k] = (M, T)
    for c in kids[k]:
        walk(c, [[sum(pM[i][m] * M[m][j] for m in range(3)) for j in range(3)] for i in range(3)], T)


for r in d["roots"]:
    walk(r, I3, [0, 0, 0])

boxes = {}
for k, n in nodes.items():
    if n.get("kind") != "mesh":
        continue
    M, T = acc[k]
    sz = size_of(n)
    h = [abs(sz[j]) / 2 for j in range(3)]
    pts = []
    for cx in (-1, 1):
        for cy in (-1, 1):
            for cz in (-1, 1):
                v = [cx * h[0], cy * h[1], cz * h[2]]
                pts.append([T[i] + sum(M[i][j] * v[j] for j in range(3)) for i in range(3)])
    boxes[k] = ([min(q[i] for q in pts) for i in range(3)], [max(q[i] for q in pts) for i in range(3)])

ids = list(boxes)


def gap(a, b):
    out = 0.0
    for i in range(3):
        lo = max(a[0][i] - b[1][i], b[0][i] - a[1][i], 0.0)
        out += lo * lo
    return math.sqrt(out)


def vol_overlap(a, b):
    v = 1.0
    for i in range(3):
        lo = min(a[1][i], b[1][i]) - max(a[0][i], b[0][i])
        if lo <= 0:
            return 0.0
        v *= lo
    return v


def vol(a):
    return max(1e-9, (a[1][0] - a[0][0]) * (a[1][1] - a[0][1]) * (a[1][2] - a[0][2]))


nearest = {}
for i in ids:
    best, bj = 1e9, None
    for j in ids:
        if i == j:
            continue
        g = gap(boxes[i], boxes[j])
        if g < best:
            best, bj = g, j
    nearest[i] = (best, bj)

hist = {"<=0.02": 0, "0.02-0.1": 0, "0.1-0.5": 0, "0.5-1": 0, ">1": 0}
for i, (g, _) in nearest.items():
    k = "<=0.02" if g <= 0.02 else "0.02-0.1" if g <= 0.1 else "0.1-0.5" if g <= 0.5 else "0.5-1" if g <= 1 else ">1"
    hist[k] += 1
print(f"room={ROOM} meshes={len(ids)}  nearest_gap_hist={hist}")

float_ids = [(g, i) for i, (g, _) in nearest.items() if g > 0.1]
float_ids.sort(reverse=True)
print(f"no-contact(>0.1m)={len(float_ids)}  worst:")
for g, i in float_ids[:10]:
    n = nodes[i]
    b = boxes[i]
    print(f"   gap={g:6.2f}  {n['name'][:16]:18s} y=[{b[0][1]:6.2f},{b[1][1]:6.2f}] size=({b[1][0]-b[0][0]:.2f},{b[1][1]-b[0][1]:.2f},{b[1][2]-b[0][2]:.2f})")

unsupported = []
for i in ids:
    a = boxes[i]
    ok = False
    for j in ids:
        if i == j:
            continue
        b = boxes[j]
        dy = a[0][1] - b[1][1]
        if -0.03 <= dy <= 0.35:
            ox = min(a[1][0], b[1][0]) - max(a[0][0], b[0][0])
            oz = min(a[1][2], b[1][2]) - max(a[0][2], b[0][2])
            if ox > 0 and oz > 0 and ox * oz > 0.02 * vol(a) ** (2 / 3):
                ok = True
                break
    if not ok:
        unsupported.append(i)
unsupported.sort(key=lambda i: -boxes[i][0][1])
print(f"unsupported(no part below)={len(unsupported)}  highest:")
for i in unsupported[:8]:
    n = nodes[i]
    b = boxes[i]
    print(f"   bottom_y={b[0][1]:6.2f}  {n['name'][:16]:18s} gap_to_nearest={nearest[i][0]:.2f}")

deep = []
for x in range(len(ids)):
    for y in range(x + 1, len(ids)):
        a, b = boxes[ids[x]], boxes[ids[y]]
        ov = vol_overlap(a, b)
        if ov > 0.5 * min(vol(a), vol(b)):
            deep.append((ov / min(vol(a), vol(b)), ids[x], ids[y]))
deep.sort(reverse=True)
print(f"heavy_overlap_pairs(>50% of smaller)={len(deep)}")
for r, i, j in deep[:5]:
    print(f"   {r*100:5.1f}%  {nodes[i]['name'][:14]} x {nodes[j]['name'][:14]}")
