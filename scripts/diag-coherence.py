import json, math, sys
from pathlib import Path

ROOM = sys.argv[1] if len(sys.argv) > 1 else "r_0uyuub9x"
TOL = float(sys.argv[2]) if len(sys.argv) > 2 else 0.08
doc = json.loads((Path(".devhome/rooms") / f"{ROOM}.json").read_text())["doc"]
nodes = doc["nodes"]
children = {n["id"]: [] for n in nodes.values()}
for n in nodes.values():
    if n.get("parent"):
        children[n["parent"]].append(n["id"])


def euler_xyz(r):
    x, y, z = r
    a, b = math.cos(x), math.sin(x)
    c, d = math.cos(y), math.sin(y)
    e, f = math.cos(z), math.sin(z)
    return [[c * e, -c * f, d], [a * f + b * e * d, a * e - b * f * d, -b * c],
            [b * f - a * e * d, b * e + a * f * d, a * c]]


def mm(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def ap(M, v):
    return [sum(M[i][j] * v[j] for j in range(3)) for i in range(3)]


def size_of(n):
    g = n.get("geometry") or {}
    t = g.get("type")
    if t == "box":
        return g["size"]
    if t == "sphere":
        return [g["radius"] * 2] * 3
    if t == "cylinder":
        h = g.get("height", 1)
        r = max(g.get("radius_top", 0), g.get("radius_bottom", 0)) * 2
        return [r, h, r]
    if t == "plane":
        return [g["width"], 0.001, g["height"]]
    return [1, 1, 1]


I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
world = {}


def walk(nid, pM, pT):
    t = nodes[nid].get("transform", {})
    R = euler_xyz(t.get("r", [0, 0, 0]))
    s = t.get("s", [1, 1, 1])
    M = [[R[i][j] * s[j] for j in range(3)] for i in range(3)]
    wM = mm(pM, M)
    off = ap(pM, t.get("p", [0, 0, 0]))
    wT = [pT[i] + off[i] for i in range(3)]
    world[nid] = (wM, wT, t.get("r", [0, 0, 0]))
    for c in children[nid]:
        walk(c, wM, wT)


for r in doc["roots"]:
    walk(r, I, [0, 0, 0])

boxes = {}
for nid, n in nodes.items():
    if n.get("kind") != "mesh":
        continue
    M, T, rot = world[nid]
    sz = size_of(n)
    h = [abs(sz[j]) / 2 for j in range(3)]
    pts = []
    for cx in (-1, 1):
        for cy in (-1, 1):
            for cz in (-1, 1):
                v = [cx * h[0], cy * h[1], cz * h[2]]
                pts.append([T[i] + sum(M[i][j] * v[j] for j in range(3)) for i in range(3)])
    boxes[nid] = ([min(q[i] for q in pts) for i in range(3)], [max(q[i] for q in pts) for i in range(3)])


def overlap(a, b, tol=0.0):
    return all(a[0][i] - tol <= b[1][i] and b[0][i] - tol <= a[1][i] for i in range(3))


met = [n for n in nodes.values() if n.get("kind") == "mesh"]
rot_count = sum(1 for n in met if max(abs(v) for v in world[n["id"]][2]) > 1e-6)
print(f"room={ROOM} meshes={len(met)} rotated={rot_count} groups={len([n for n in nodes.values() if children[n['id']]])}")

ids = list(boxes)
parent = {i: i for i in ids}


def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[rb] = ra


touching = 0
for i in range(len(ids)):
    for j in range(i + 1, len(ids)):
        if overlap(boxes[ids[i]], boxes[ids[j]], TOL):
            union(ids[i], ids[j])
            touching += 1
comp = {}
for i in ids:
    comp.setdefault(find(i), []).append(i)
sizes = sorted((len(v) for v in comp.values()), reverse=True)
print(f"tol={TOL} touching_pairs={touching} components={len(comp)} largest={sizes[:8]}")

ground = min(b[0][1] for b in boxes.values())
print(f"ground_y={ground:.3f} top_y={max(b[1][1] for b in boxes.values()):.3f}")
iso = sorted(comp.values(), key=len)
lonely = [v for v in iso if len(v) == 1]
print(f"isolated(no contact) meshes={len(lonely)}")
for v in lonely[:8]:
    n = nodes[v[0]]
    b = boxes[v[0]]
    print(f"   {n['name'][:18]:20s} y=[{b[0][1]:6.2f},{b[1][1]:6.2f}] xz=({(b[0][0]+b[1][0])/2:5.2f},{(b[0][2]+b[1][2])/2:5.2f})")
