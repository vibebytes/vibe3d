import json, math, sys

raw = json.load(open(sys.argv[1]))
doc = raw.get("doc", raw)
nodes = doc["nodes"]


def m_rot(rx, ry, rz, order):
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
    a, b, c = (Rz, Ry, Rx) if order == "gltf" else (Rx, Ry, Rz)
    return mul(a, mul(b, c))


def mul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def apply(R, v):
    return [sum(R[i][k] * v[k] for k in range(3)) for i in range(3)]


def compose(node, order):
    t = node["transform"]
    p = list(t["p"])
    s = list(t["s"])
    R = m_rot(*t["r"], order=order)
    parent = node.get("parent")
    if parent and parent in nodes:
        pp, ps, pR = compose(nodes[parent], order)
        p = [pp[i] + sum(pR[i][k] * s[k] * p[k] for k in range(3)) for i in range(3)]
        s = [ps[i] * s[i] for i in range(3)]
        R = mul(pR, R)
    return p, s, R


rows = []
for n in nodes.values():
    if n.get("kind") != "mesh":
        continue
    pa = compose(n, "gltf")[0]
    pb = compose(n, "three")[0]
    d = math.dist(pa, pb)
    rows.append((d, n["name"], pa, pb))

rows.sort(reverse=True)
print("meshes", len(rows))
print("max", round(rows[0][0], 4), "median", round(rows[len(rows) // 2][0], 4))
multi = [r for r in rows if r[0] > 0.05]
print("over 0.05m:", len(multi))
for d, name, pa, pb in rows[:8]:
    print(f"{d:8.4f} {name[:22]:24s} gltf={[round(x,2) for x in pa]} three={[round(x,2) for x in pb]}")
