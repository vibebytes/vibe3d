import json, math, sys
from pathlib import Path

ROOM = sys.argv[1] if len(sys.argv) > 1 else "r_0uyuub9x"
P = Path(__file__).resolve().parent.parent / ".devhome/rooms" / f"{ROOM}.json"
doc = json.loads(P.read_text())["doc"]
nodes = doc["nodes"]


def euler_xyz(r):
    x, y, z = r
    a, b = math.cos(x), math.sin(x)
    c, d = math.cos(y), math.sin(y)
    e, f = math.cos(z), math.sin(z)
    return [
        [c * e, -c * f, d],
        [a * f + b * e * d, a * e - b * f * d, -b * c],
        [b * f - a * e * d, b * e + a * f * d, a * c],
    ]


def mat_mul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def compose(t):
    R = euler_xyz(t.get("r", [0, 0, 0]))
    s = t.get("s", [1, 1, 1])
    return [[R[i][j] * s[j] for j in range(3)] for i in range(3)], list(t.get("p", [0, 0, 0]))


def apply(M, t, v):
    return [sum(M[i][j] * v[j] for j in range(3)) + t[i] for i in range(3)]


I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
world, local_only = {}, {}
order = []


def walk(nid, pM, pT):
    n = nodes[nid]
    M, T = compose(n.get("transform", {}))
    wM = mat_mul(pM, M)
    wT = [pT[i] + apply(pM, [0, 0, 0], T)[i] for i in range(3)]
    world[nid] = (wM, wT)
    local_only[nid] = T
    order.append(nid)
    for c in children.get(nid, []):
        walk(c, wM, wT)


roots = doc["roots"]
children = {n["id"]: [] for n in nodes.values()}
for n in nodes.values():
    if n.get("parent"):
        children[n["parent"]].append(n["id"])
for r in roots:
    walk(r, I, [0, 0, 0])

depth = {r: 0 for r in roots}
for nid in order:
    for c in children.get(nid, []):
        depth[c] = depth[nid] + 1

print(f"room={ROOM} nodes={len(nodes)} roots={len(roots)} maxdepth={max(depth.values())}")
print(f"depth hist: { {d: list(depth.values()).count(d) for d in sorted(set(depth.values()))} }")

groups = [n for n in nodes.values() if children.get(n["id"])]
print(f"parents={len(groups)}")

rows = []
for g in groups:
    t = g.get("transform", {})
    p, s, r = t.get("p", [0, 0, 0]), t.get("s", [1, 1, 1]), t.get("r", [0, 0, 0])
    identity = max(abs(v) for v in p) < 1e-9 and max(abs(v - 1) for v in s) < 1e-9 and max(abs(v) for v in r) < 1e-9
    shift = 0.0
    worst = None
    for c in children[g["id"]]:
        wc = world[c][1]
        abs_c = local_only[c]
        d = math.dist(wc, abs_c)
        if d > shift:
            shift, worst = d, c
    rows.append((shift, g["name"], g["id"], len(children[g["id"]]), identity, worst))

rows.sort(reverse=True)
print("\n== top shift (compose-world vs treating child p as world) ==")
for shift, name, gid, k, identity, worst in rows[:12]:
    print(f"  shift={shift:8.3f}  children={k:3d}  identityParent={identity}  {name}  <- {nodes[worst]['name'] if worst else '-'}")
bad = [x for x in rows if x[0] > 0.5]
print(f"\nparents with shift>0.5: {len(bad)} / {len(groups)}")

pts = [world[n][1] for n in order]
def diag(v):
    return [max(p[i] for p in v) - min(p[i] for p in v) for i in range(3)]
print(f"world-origin bbox diag = {[round(x,2) for x in diag(pts)]}")

# cross-room comparison: same node name -> world origin
if len(sys.argv) > 2:
    other = json.loads((Path(__file__).resolve().parent.parent / ".devhome/rooms" / f"{sys.argv[2]}.json").read_text())["doc"]
    on = other["nodes"]
    och = {n["id"]: [] for n in on.values()}
    for n in on.values():
        if n.get("parent"):
            och[n["parent"]].append(n["id"])
    ow = {}
    def walk2(nid, pM, pT):
        n = on[nid]; M, T = compose(n.get("transform", {}))
        wM = mat_mul(pM, M)
        ow[n["name"]] = [pT[i] + apply(pM, [0,0,0], T)[i] for i in range(3)]
        for c in och.get(nid, []):
            walk2(c, wM, [pT[i] + apply(pM,[0,0,0],T)[i] for i in range(3)])
    for r in other["roots"]:
        walk2(r, I, [0, 0, 0])
    diffs = []
    for nid in order:
        nm = nodes[nid]["name"]
        if nm in ow:
            diffs.append((math.dist(world[nid][1], ow[nm]), nm, world[nid][1], ow[nm]))
    diffs.sort(reverse=True)
    print(f"\n== vs {sys.argv[2]}: matched {len(diffs)} names ==")
    for d, nm, a, b in diffs[:10]:
        print(f"  d={d:8.3f}  {nm}  here={[round(x,2) for x in a]} other={[round(x,2) for x in b]}")
    big = [d for d in diffs if d[0] > 0.5]
    print(f"mismatch>0.5: {len(big)} / {len(diffs)}")
