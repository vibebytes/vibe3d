import json, struct, sys, math
from pathlib import Path

GLB = Path(sys.argv[1])


def load_glb(p):
    b = p.read_bytes()
    magic, ver, total = struct.unpack_from("<III", b, 0)
    assert magic == 0x46546C67, "not a glb"
    off, js, bin_ = 12, None, b""
    while off < total:
        clen, ctype = struct.unpack_from("<II", b, off)
        chunk = b[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            bin_ = chunk
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    return js, bin_


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def trs(t, r, s):
    x, y, z, w = r
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz, wx, wy, wz = x * y, x * z, y * z, w * x, w * y, w * z
    R = [[1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
         [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
         [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)]]
    M = [[R[i][j] * s[j] for j in range(3)] + [t[i]] for i in range(3)]
    M.append([0, 0, 0, 1])
    return M


def ap(M, v):
    return [sum(M[i][j] * v[j] for j in range(3)) + M[i][3] for i in range(3)]


g, _ = load_glb(GLB)
nodes = g.get("nodes", [])
acc = g.get("accessors", [])
meshes = g.get("meshes", [])
kids = {i: n.get("children", []) for i, n in enumerate(nodes)}
parent = {}
for i, cs in kids.items():
    for c in cs:
        parent[c] = i
roots = [i for i in range(len(nodes)) if i not in parent]


def depth(i):
    d = 0
    while i in parent:
        i = parent[i]
        d += 1
    return d


world = {}


def walk(i, pm):
    n = nodes[i]
    local = trs(n.get("translation", [0, 0, 0]), n.get("rotation", [0, 0, 0, 1]), n.get("scale", [1, 1, 1]))
    w = mat_mul(pm, local)
    world[i] = w
    for c in kids[i]:
        walk(c, w)


for r in roots:
    walk(r, [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])

I4 = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
boxes = {}
for i, n in enumerate(nodes):
    if "mesh" not in n:
        continue
    prims = meshes[n["mesh"]].get("primitives", [])
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for p in prims:
        a = acc[p["attributes"]["POSITION"]]
        if "min" not in a:
            continue
        for cx in (a["min"][0], a["max"][0]):
            for cy in (a["min"][1], a["max"][1]):
                for cz in (a["min"][2], a["max"][2]):
                    q = ap(world[i], [cx, cy, cz])
                    for k in range(3):
                        mn[k] = min(mn[k], q[k])
                        mx[k] = max(mx[k], q[k])
    if mn[0] < 1e8:
        boxes[i] = (mn, mx)

print(f"file={GLB.name} bytes={GLB.stat().st_size}")
print(f"nodes={len(nodes)} meshes={len(meshes)} roots={len(roots)} parents={len(parent)}")
h = {}
for i in range(len(nodes)):
    h[depth(i)] = h.get(depth(i), 0) + 1
print(f"depth_hist={dict(sorted(h.items()))}")
if boxes:
    mn = [min(b[0][k] for b in boxes.values()) for k in range(3)]
    mx = [max(b[1][k] for b in boxes.values()) for k in range(3)]
    print(f"world_bbox=({mn[0]:.2f},{mn[1]:.2f},{mn[2]:.2f}) -> ({mx[0]:.2f},{mx[1]:.2f},{mx[2]:.2f})"
          f" size=({mx[0]-mn[0]:.2f},{mx[1]-mn[1]:.2f},{mx[2]-mn[2]:.2f}) meshes_with_bbox={len(boxes)}")
    names = [nodes[i].get("name", "?") for i in boxes]
    print(f"first10={names[:10]}")
    for i, b in list(boxes.items())[:5]:
        n = nodes[i]
        t = n.get("translation", [0, 0, 0])
        print(f"   {n.get('name','?')[:20]:22s} localT=({t[0]:6.2f},{t[1]:6.2f},{t[2]:6.2f}) "
              f"worldY=[{b[0][1]:6.2f},{b[1][1]:6.2f}] parent={parent.get(i)}")
