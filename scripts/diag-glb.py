import json, math, struct, sys
from pathlib import Path

GLB = Path(sys.argv[1])
DOC = json.loads((Path(".devhome/rooms/r_0uyuub9x.json")).read_text())["doc"]

raw = GLB.read_bytes()
magic, ver, total = struct.unpack("<III", raw[:12])
off, js = 12, None
while off < total:
    ln, ty = struct.unpack("<II", raw[off:off + 8])
    if ty == 0x4E4F534A:
        js = json.loads(raw[off + 8:off + 8 + ln])
    off += 8 + ln
g = js
print(f"glb nodes={len(g['nodes'])} meshes={len(g.get('meshes', []))} scenes={len(g.get('scenes', []))} root={g['scenes'][0].get('nodes')}")
print(f"doc  nodes={len(DOC['nodes'])} roots={len(DOC['roots'])}")


def euler_xyz(r):
    x, y, z = r
    a, b = math.cos(x), math.sin(x)
    c, d = math.cos(y), math.sin(y)
    e, f = math.cos(z), math.sin(z)
    return [[c * e, -c * f, d],
            [a * f + b * e * d, a * e - b * f * d, -b * c],
            [b * f - a * e * d, b * e + a * f * d, a * c]]


def mm(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def compose_doc(t):
    R = euler_xyz(t.get("r", [0, 0, 0]))
    s = t.get("s", [1, 1, 1])
    return [[R[i][j] * s[j] for j in range(3)] for i in range(3)], list(t.get("p", [0, 0, 0]))


def apply(M, v):
    return [sum(M[i][j] * v[j] for j in range(3)) for i in range(3)]


def compose_gltf(n):
    if "matrix" in n:
        m = n["matrix"]
        return [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], [m[12], m[13], m[14]]
    if "rotation" in n:
        x, y, z, w = n["rotation"]
        R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
             [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
             [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    else:
        R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    s = n.get("scale", [1, 1, 1])
    return [[R[i][j] * s[j] for j in range(3)] for i in range(3)], list(n.get("translation", [0, 0, 0]))


nodes = DOC["nodes"]
children = {n["id"]: [] for n in nodes.values()}
for n in nodes.values():
    if n.get("parent"):
        children[n["parent"]].append(n["id"])
docw = {}
I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]


def walk_doc(nid, pM, pT):
    M, T = compose_doc(nodes[nid].get("transform", {}))
    wM = mm(pM, M)
    off = apply(pM, T)
    wT = [pT[i] + off[i] for i in range(3)]
    docw[nodes[nid]["name"]] = wT
    for c in children[nid]:
        walk_doc(c, wM, wT)


for r in DOC["roots"]:
    walk_doc(r, I, [0, 0, 0])

glbw = {}


def walk_glb(i, pM, pT):
    n = g["nodes"][i]
    M, T = compose_gltf(n)
    wM = mm(pM, M)
    off = apply(pM, T)
    wT = [pT[j] + off[j] for j in range(3)]
    glbw[n.get("name", f"n{i}")] = wT
    for c in n.get("children", []):
        walk_glb(c, wM, wT)


for r in g["scenes"][0].get("nodes", []):
    walk_glb(r, I, [0, 0, 0])

print(f"glb world nodes={len(glbw)}  doc world nodes={len(docw)}")
diffs = []
for nm, a in docw.items():
    if nm in glbw:
        b = glbw[nm]
        diffs.append((math.dist(a, b), nm, a, b))
diffs.sort(reverse=True)
print(f"matched={len(diffs)}  maxdiff={diffs[0][0] if diffs else 'NA'}")
for d, nm, a, b in diffs[:8]:
    print(f"  d={d:7.4f} {nm[:18]:20s} doc={[round(x,2) for x in a]} glb={[round(x,2) for x in b]}")
print(f"mismatch>1e-3: {len([1 for d in diffs if d[0] > 1e-3])}")

# which doc nodes are parents in doc vs in glb
doc_parents = {nodes[c]["parent"] for c in nodes if nodes[c].get("parent")}
glb_parents = {g["nodes"][i].get("name") for i in range(len(g["nodes"])) if g["nodes"][i].get("children")}
print(f"doc group nodes={len(doc_parents)} glb group nodes={len(glb_parents)}")
print(f"doc groups={[nodes[p]['name'] for p in doc_parents]}")
print(f"glb groups={sorted(glb_parents)[:8]}")
