import sys
from PIL import Image

for path in sys.argv[1:]:
    im = Image.open(path).convert("RGB")
    W, H = im.size
    px = im.load()
    bg = px[2, 2]
    pts = []
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            c = px[x, y]
            if abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) > 30:
                pts.append((x, y))
    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    var = sum((p[0] - cx) ** 2 + (p[1] - cy) ** 2 for p in pts) / n
    # fraction of ink in outer 30% ring (periphery) = tell-tale of scattered debris
    ring = sum(1 for p in pts if (p[0] - cx) ** 2 / (W * 0.5) ** 2 + (p[1] - cy) ** 2 / (H * 0.5) ** 2 > 0.55) / n
    print(f"{path.split('/')[-1][:10]} n={n} centroid=({cx:.0f},{cy:.0f}) rms={var**0.5:.0f} outer_ratio={ring:.3f}")
