import json, struct, sys, math
from pathlib import Path

GLB = Path(sys.argv[1])
ROOM = sys.argv[2] if len(sys.argv) > 2 else "r_0uyuub9x"


def load_glb(p):
    b = p.read_bytes()
    magic, ver, total = struct.unpack_from("<III", b, 0)
    assert magic == 0x46546C67
    off, js = 12, None
    while off < total:
        clen, ctype = struct.unpack_from("<II", b, off)
        if ctype == 0x4E4F534A:
            js = json.loads(b[off + 8: off + 8 + clen].decode("utf-8"))
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    return js


def mm(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def trs(t, r, s):
    x, y, z, w = r
    R = [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
         [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
         [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]]
    M = [[R[i][j] * s[j] for j in range(3)] + [t[i]] for i in range(3)]
    M.append([0, 0, 0, 1])
    return M


def ap(M, v):
    return [sum(M[i][j] * v[j] for j in range(3)) + M[i][3] for i in range(3)]


g = load_glb(GLB)
nodes, acc, meshes = g["nodes"], g["accessors"], g["meshes"]
kids = {i: n.get("children", []) for i, n in enumerate(nodes)}
world = {}


def walk(i, pm):
    n = nodes[i]
    w = mm(pm, trs(n.get("translation", [0, 0, 0]), n.get("rotation", [0, 0, 0, 1]), n.get("scale", [1, 1, 1])))
    world[i] = w
    for c in kids[i]:
        walk(c, w)


for i in range(len(nodes)):
    if not any(i in cs for cs in kids.values()):
        pass
roots = [i for i in range(len(nodes)) if not any(i in cs for cs in kids.values())]
for r in roots:
    walk(r, [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])


def glb_box(i):
    mn, mx = [1e9] * 3, [-1e9] * 3
    for p in meshes[nodes[i]["mesh"]]["primitives"]:
        a = acc[p["attributes"]["POSITION"]]
        if "min" not in a:
            return None
        for cx in (a["min"][0], a["max"][0]):
            for cy in (a["min"][1], a["max"][1]):
                for cz in (a["min"][2], a["max"][2]):
                    q = ap(world[i], [cx, cy, cz])
                    for k in range(3):
                        mn[k] = min(mn[k], q[k])
                        mx[k] = max(mx[k], q[k])
    return (mn, mx)


d = json.loads((Path(".devhome/rooms") / f"{ROOM}.json").read_text())["doc"]
dn = d["nodes"]
dch = {k: [] for k in dn}
for k, n in dn.items():
    if n.get("parent"):
        dch[n["parent"]].append(k)


def euler(r):
    x, y, z = r
    a, b = math.cos(x), math.sin(x)
    c, dd = math.cos(y), math.sin(y)
    e, f = math.cos(z), math.sin(z)
    return [[c * e, -c * f, dd], [a * f + b * e * dd, a * e - b * f * dd, -b * c],
            [b * f - a * e * dd, b * e + a * f * dd, a * c]]


def size_of(n):
    gm = n.get("geometry") or {}
    t = gm.get("type")
    if t == "box":
        return gm["size"]
    if t == "sphere":
        return [gm["radius"] * 2] * 3
    if t == "cylinder":
        h = gm.get("height", 1)
        r = max(gm.get("radius_top", 0), gm.get("radius_bottom", 0)) * 2
        return [r, h, r]
    if t == "plane":
        return [gm["width"], 0.001, gm["height"]]
    return [1, 1, 1]


dw = {}


def dwalk(k, pM, pT):
    t = dn[k].get("transform", {})
    R = euler(t.get("r", [0, 0, 0]))
    s = t.get("s", [1, 1, 1])
    M = [[R[i][j] * s[j] for j in range(3)] for i in range(3)]
    off = [sum(pM[i][j] * t.get("p", [0, 0, 0])[j] for j in range(3)) for i in range(3)]
    wM = [[sum(pM[i][k] * M[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    wT = [pT[i] + off[i] for i in range(3)]
    dw[k] = (wM, wT)
    for c in dch[k]:
        dwalk(c, wM, wT)


for r in d["roots"]:
    dwalk(r, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, 0])


def doc_box(k):
    M, T = dw[k]
    s = size_of(dn[k])
    h = [abs(s[j]) / 2 for j in range(3)]
    pts = [ap([[M[i][j] for j in range(3)] + [T[i]] for i in range(3)] + [[0, 0, 0, 1]],
              [cx * h[0], cy * h[1], cz * h[2]])
           for cx in (-1, 1) for cy in (-1, 1) for cz in (-1, 1)]
    return ([min(q[i] for q in pts) for i in range(3)], [max(q[i] for q in pts) for i in range(3)])


gb = {}
for i, n in enumerate(nodes):
    if "mesh" in n and n.get("name"):
        b = glb_box(i)
        if b:
            gb.setdefault(n["name"], b)
dbox = {dn[k]["name"]: doc_box(k) for k in dn if dn[k].get("kind") == "mesh"}
common = sorted(set(gb) & set(dbox))
dmax = 0.0
worst = []
for nm in common:
    a, b = gb[nm], dbox[nm]
    dc = max(abs((a[0][i] + a[1][i]) / 2 - (b[0][i] + b[1][i]) / 2) for i in range(3))
    ds = max(abs((a[1][i] - a[0][i]) - (b[1][i] - b[0][i])) for i in range(3))
    d = max(dc, ds)
    dmax = max(dmax, d)
    if d > 1e-3:
        worst.append((d, nm, dc, ds))
print(f"matched_meshes={len(common)} (glb {len(gb)} / doc {len(dbox)})  max_bbox_delta={dmax:.4f}")
worst.sort(reverse=True)
for w in worst[:8]:
    print(f"   {w[1][:22]:24s} delta={w[0]:7.3f} center={w[2]:7.3f} size={w[3]:7.3f}")
