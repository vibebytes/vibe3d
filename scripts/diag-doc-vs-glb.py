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


gw = {}
stack = [(i, ident()) for i in gj["scenes"][gj.get("scene", 0)]["nodes"]]
while stack:
    idx, parent = stack.pop()
    M = mul(parent, trs(gj["nodes"][idx]))
    gw[idx] = M
    for c in gj["nodes"][idx].get("children", []):
        stack.append((c, M))


def gworld(name):
    out = []
    for idx, nd in enumerate(gj["nodes"]):
        if nd.get("name") == name and "mesh" in nd:
            out.append([gw[idx][i][3] for i in range(3)])
    return out


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


rows = []
for nid, n in doc["nodes"].items():
    if n.get("kind") != "mesh":
        continue
    d = [dworld(nid)[i][3] for i in range(3)]
    gs = gworld(n["name"])
    if not gs:
        continue
    g = min(gs, key=lambda v: math.dist(v, d))
    rows.append((math.dist(d, g), n["name"], d, g))

rows.sort(reverse=True)
bad = [r for r in rows if r[0] > 0.3]
print("compared", len(rows), "of", sum(1 for n in doc["nodes"].values() if n.get("kind") == "mesh"))
print("delta>0.3m:", len(bad), " max/median:", round(rows[0][0], 3), round(rows[len(rows) // 2][0], 3))
for d, name, p1, p2 in rows[:10]:
    print(f"{d:7.3f} {name[:20]:22s} doc={[round(v,2) for v in p1]} glb={[round(v,2) for v in p2]}")
