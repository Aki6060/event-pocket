# Event Pocket 图标栅格化脚本
# 按 96x96 设计稿绘制（与 SVG 定稿一致），超采样后缩出 128/48/32/16 四档 PNG
# 用法: python gen_icons.py
import math
import os

from PIL import Image, ImageDraw

S = 1024
F = S / 96.0
INK = (26, 26, 28, 255)
CREAM = (245, 239, 228, 255)
RED = (185, 24, 42, 255)
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def pt(p):
    return (p[0] * F, p[1] * F)


def quad(p0, p1, p2, t):
    u = 1 - t
    return (
        u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
        u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    )


def cubic(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
    )


def sample_quad_chain(segs, n=48):
    pts = []
    for p0, p1, p2 in segs:
        for i in range(n + 1):
            pts.append(quad(p0, p1, p2, i / n))
    return pts


def sample_cubic_chain(segs, n=48):
    pts = []
    for p0, p1, p2, p3 in segs:
        for i in range(n + 1):
            pts.append(cubic(p0, p1, p2, p3, i / n))
    return pts


img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 1. 底：圆角方 96x96 rx24
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=round(24 * F), fill=INK)

# 2. 虚线轨迹：Q(36,54)-(42,40)-(52,33)，dash 1 gap 6，宽 2.5 → 圆点串
curve = [quad((36, 54), (42, 40), (52, 33), i / 240) for i in range(241)]
scaled = [pt(p) for p in curve]
acc = [0.0]
for a, b in zip(scaled, scaled[1:]):
    acc.append(acc[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
step = 7.0 * F  # dash+gap
dot_r = (2.5 / 2) * F
pos = step / 2
k = 0
while pos < acc[-1]:
    while k < len(acc) - 1 and acc[k + 1] < pos:
        k += 1
    seg = acc[k + 1] - acc[k]
    ratio = 0 if seg == 0 else (pos - acc[k]) / seg
    x = scaled[k][0] + (scaled[k + 1][0] - scaled[k][0]) * ratio
    y = scaled[k][1] + (scaled[k + 1][1] - scaled[k][1]) * ratio
    d.ellipse([x - dot_r, y - dot_r, x + dot_r, y + dot_r], fill=CREAM)
    pos += step

# 3. 主四芒星（三次曲线，r=12 @ (62,28)）
star_main = sample_cubic_chain(
    [
        ((62, 16), (63.9, 23.9), (66.1, 26.1), (74, 28)),
        ((74, 28), (66.1, 29.9), (63.9, 32.1), (62, 40)),
        ((62, 40), (60.1, 32.1), (57.9, 29.9), (50, 28)),
        ((50, 28), (57.9, 26.1), (60.1, 23.9), (62, 16)),
    ]
)
d.polygon([pt(p) for p in star_main], fill=RED)

# 4. 瘦长四芒星 A 版（二次曲线控制点在中心，rx4.5 ry11 @ (28,22)）
star_slim = sample_quad_chain(
    [
        ((28, 11), (28, 22), (32.5, 22)),
        ((32.5, 22), (28, 22), (28, 33)),
        ((28, 33), (28, 22), (23.5, 22)),
        ((23.5, 22), (28, 22), (28, 11)),
    ]
)
d.polygon([pt(p) for p in star_slim], fill=RED)

# 5. 米白口袋：圆角矩形 rotate 7°（SVG 顺时针 → PIL -7）
layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dl = ImageDraw.Draw(layer)
dl.rounded_rectangle(
    [22 * F, 52 * F, 74 * F, 78 * F], radius=round(11 * F), fill=CREAM
)
layer = layer.rotate(-7, resample=Image.BICUBIC, center=(48 * F, 65 * F))
img = Image.alpha_composite(img, layer)

os.makedirs(OUT, exist_ok=True)
for size in (128, 48, 32, 16):
    img.resize((size, size), Image.LANCZOS).save(
        os.path.join(OUT, f"icon{size}.png")
    )
    print(f"icon{size}.png ok")
