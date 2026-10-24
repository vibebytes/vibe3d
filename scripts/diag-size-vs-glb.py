import json, math, struct, sys

glb_path, room_path = sys.argv[1], sys.argv[2]
blob = open(glb_path, "rb").read()
off = 12
gj = None
while off < len(blob):
    ln, kind = struct.unpack_from("<II", blob, off)
    if kind == 0x4E4F534A:
        gj = json.loads(blob[off + 8 : off + 8 + ln])
        break
    off += 8 + ln
raw = json.load(open(room_path))
doc = raw.get("doc", raw)


def ident():
    return [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


def mul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def trs(node):
    if "matrix" in node:
        m = node["matrix"]
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    tx, ty, tz = node.get("translation", [0, 0, 0])
    qx, qy, qz, qw = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    R = [
        [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
        [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
        [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
    ]
    M = ident()
    for i in range(3):
        for j in range(3):
            M[i][j] = R[i][j] * (sx, sy, sz)[j]
        M[i][3] = (tx, ty, tz)[i]
    return M


def pos_accessor_bounds(mesh_idx):
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for prim in gj["meshes"][mesh_idx]["primitives"]:
        acc = gj["accessors"][prim["attributes"]["POSITION"]]
        for i in range(3):
            lo[i] = min(lo[i], acc["min"][i])
            hi[i] = max(hi[i], acc["max"][i])
    return lo, hi


def apply(M, v):
    return [sum(M[i][k] * v[k] for k in range(3)) + M[i][3] for i in range(3)]


def bbox_of(M, lo, hi):
    pts = [apply(M, [lo[0] if a else hi[0], lo[1] if b else hi[1], lo[2] if c else hi[2]]) for a in (0, 1) for b in (0, 1) for c in (0, 1)]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


gw = {}
stack = [(i, ident()) for i in gj["scenes"][gj.get("scene", 0)]["nodes"]]
while stack:
    idx, parent = stack.pop()
    M = mul(parent, trs(gj["nodes"][idx]))
    gw[idx] = M
    for c in gj["nodes"][idx].get("children", []):
        stack.append((c, M))

ginfo = {}
for idx, nd in enumerate(gj["nodes"]):
    if nd.get("name") and "mesh" in nd:
        lo, hi = pos_accessor_bounds(nd["mesh"])
        ginfo.setdefault(nd["name"], []).append((bbox_of(gw[idx], lo, hi), (lo, hi)))


def mtrs(p, r, s):
    cx, sx = math.cos(r[0]), math.sin(r[0])
    cy, sy = math.cos(r[1]), math.sin(r[1])
    cz, sz = math.cos(r[2]), math.sin(r[2])
    Rx = [[1, 0, 0, 0], [0, cx, -sx, 0], [0, sx, cx, 0], [0, 0, 0, 1]]
    Ry = [[cy, 0, sy, 0], [0, 1, 0, 0], [-sy, 0, cy, 0], [0, 0, 0, 1]]
    Rz = [[cz, -sz, 0, 0], [sz, cz, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    R = mul(mul(Rz, Ry), Rx)
    M = ident()
    for i in range(3):
        for j in range(3):
            M[i][j] = R[i][j] * s[j]
        M[i][3] = p[i]
    return M


cache = {}


def dworld(nid):
    if nid in cache:
        return cache[nid]
    n = doc["nodes"][nid]
    t = n["transform"]
    local = mtrs(t["p"], t["r"], t["s"])
    par = n.get("parent")
    M = mul(dworld(par), local) if par in doc["nodes"] else local
    cache[nid] = M
    return M


def dlocal(n):
    g = n["geometry"]
    if g["type"] == "box":
        h = [g["size"][0] / 2, g["size"][1] / 2, g["size"][2] / 2]
    elif g["type"] == "sphere":
        h = [g["radius"]] * 3
    elif g["type"] == "cylinder":
        r = max(g["radiusTop"], g["radiusBottom"])
        h = [r, g["height"] / 2, r]
    elif g["type"] == "plane":
        h = [g["width"] / 2, g["height"] / 2, 0.0]
    else:
        p = g["positions"]
        xs, ys, zs = p[0::3], p[1::3], p[2::3]
        return [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]
    return [-h[0], -h[1], -h[2]], h


rows = []
for nid, n in doc["nodes"].items():
    if n.get("kind") != "mesh" or n["name"] not in ginfo:
        continue
    lo, hi = dlocal(n)
    db = bbox_of(dworld(nid), lo, hi)
    gb = min((g[0] for g in ginfo[n["name"]]), key=lambda b: math.dist(b[0], db[0]))
    cs = math.dist(db[0], gb[0])
    ce = math.dist([db[1][i] - db[0][i] for i in range(3)], [gb[1][i] - gb[0][i] for i in range(3)])
    rows.append((ce, cs, n["name"], n["geometry"]["type"], [round(db[1][i] - db[0][i], 3) for i in range(3)], [round(gb[1][i] - gb[0][i], 3) for i in range(3)]))

rows.sort(reverse=True)
bad_ext = [r for r in rows if r[0] > 0.2]
print("compared", len(rows), "extent-delta>0.2m:", len(bad_ext))
print("median extent delta", round(rows[len(rows) // 2][0], 4), "median center delta", round(sorted(r[1] for r in rows)[len(rows) // 2], 4))
for r in rows[:12]:
    print(f"ext={r[0]:6.3f} ctr={r[1]:6.3f} {r[2][:18]:20s} {r[3]:9s} doc={r[4]} glb={r[5]}")
