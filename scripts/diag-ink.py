import sys
from PIL import Image

for path in sys.argv[1:]:
    im = Image.open(path).convert("RGB")
    W, H = im.size
    px = im.load()
    bg = px[2, 2]
    xs, ys, n = [], [], 0
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) > 24:
                n += 1
                xs.append(x)
                ys.append(y)
    if not n:
        print(path, "empty")
        continue
    bw = max(xs) - min(xs) + 1
    bh = max(ys) - min(ys) + 1
    print(f"{path.split('/')[-1][:12]} bg={bg} ink={n} cov={n/(W*H):.3f} bbox=({min(xs)},{min(ys)})-({max(xs)},{max(ys)}) {bw}x{bh} density={n/(bw*bh):.3f}")
