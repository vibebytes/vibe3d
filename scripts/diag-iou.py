import sys
from PIL import Image

a = Image.open(sys.argv[1]).convert("RGB")
b = Image.open(sys.argv[2]).convert("RGB")
W, H = a.size
pa, pb = a.load(), b.load()


def mask(px):
    bg = px[2, 2]
    m = set()
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            c = px[x, y]
            if abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) > 30:
                m.add((x, y))
    return m


ma, mb = mask(pa), mask(pb)
inter = len(ma & mb)
union = len(ma | mb)
print("inkA", len(ma), "inkB", len(mb), "IoU", round(inter / union, 3))
