"""앱 아이콘·시작 화면 로고 굽기.

2026-11-25: 사용자가 준 둥근 배지 로고(교직원과 학생이 웃는 그림, 테두리 글자 "UNIVERSITY LIFE · LAUGHTER & CHAOS")로 바꿨다.
그 전의 "3P 결재 도장" 아이콘은 쓰지 않는다.

원본 그림(흰 바탕 1408×768)은 레포에 넣지 않는다. 원 바깥을 투명하게 잘라 낸 사본 assets/icons/badge.png 가 여기서 쓰는 원본이다.
  아이콘·로고 다시 굽기:        py -X utf8 assets/icons/make_icons.py
  새 원본 그림에서 다시 자르기:  py -X utf8 assets/icons/make_icons.py --cut <원본.png>

만드는 것:
  public/logo/badge.png               시작 화면 세 곳(app.html, 2D 타이틀, 1인칭 시작 화면)에 놓는 배지 (높이 512px, 원 밖 투명)
  public/icons/icon-192.png · 512     남색 바탕 + 배지, 모서리 둥글게
  public/icons/icon-maskable-192 · 512  안드로이드가 원·둥근 사각형으로 잘라 내도 테두리 글자가 남도록 배지를 안전 원(지름 80%) 안에
  public/icons/apple-touch-icon.png   아이폰용: 투명 없는 꽉 찬 정사각형 (모서리는 iOS가 깎는다)
필요: Pillow.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
BADGE = Path(__file__).resolve().parent / "badge.png"
OUT = ROOT / "public" / "icons"
LOGO = ROOT / "public" / "logo"
BIG = 1024

NAVY = (0, 0x2C, 0x52)

# 배지 지름 / 아이콘 한 변
FILL_ANY = 0.92
FILL_MASKABLE = 0.78  # 안전 원은 지름 80%
FILL_APPLE = 0.9
# 자를 때 원 가장자리의 흰 번짐을 없애려고 안쪽으로 들이는 픽셀
INSET = 3
# 흰 바탕으로 보는 밝기 (이보다 어두운 픽셀이 하나라도 있는 범위가 배지)
WHITE = 215


def cut(src: Path) -> Image.Image:
    """흰 바탕 그림에서 둥근 배지만 남기고 바깥을 투명하게 한다 (배지는 살짝 타원이라 가로·세로를 따로 잰다)."""
    im = Image.open(src).convert("RGB")
    dark = im.convert("L").point(lambda v: 255 if v < WHITE else 0)
    box = dark.getbbox()
    if not box:
        sys.exit("그림에서 배지를 찾지 못했습니다")
    x0, y0, x1, y1 = box
    # 가장자리가 매끈하도록 4배로 그린 뒤 줄인다
    k = 4
    mask = Image.new("L", (im.width * k, im.height * k), 0)
    ImageDraw.Draw(mask).ellipse(
        [(x0 + INSET) * k, (y0 + INSET) * k, (x1 - INSET) * k - 1, (y1 - INSET) * k - 1], fill=255
    )
    mask = mask.resize(im.size, Image.LANCZOS)
    out = im.convert("RGBA")
    out.putalpha(mask)
    out = out.crop(box)
    # 정사각형 캔버스 가운데에 놓는다
    side = max(out.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(out, ((side - out.width) // 2, (side - out.height) // 2))
    return sq


def compose(badge: Image.Image, fill: float) -> Image.Image:
    """남색 정사각형 한가운데에 배지를 놓는다."""
    canvas = Image.new("RGBA", (BIG, BIG), NAVY + (255,))
    d = round(BIG * fill)
    b = badge.resize((d, d), Image.LANCZOS)
    canvas.alpha_composite(b, ((BIG - d) // 2, (BIG - d) // 2))
    return canvas


def rounded(img: Image.Image, radius_ratio: float) -> Image.Image:
    img = img.convert("RGBA")
    k = 4
    mask = Image.new("L", (img.width * k, img.height * k), 0)
    r = int(img.width * k * radius_ratio)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width * k - 1, img.height * k - 1], r, fill=255)
    mask = mask.resize(img.size, Image.LANCZOS)
    img.putalpha(ImageChops.multiply(img.getchannel("A"), mask))
    return img


def save(img: Image.Image, size: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path, optimize=True)
    print("저장", path.relative_to(ROOT), f"{path.stat().st_size // 1024}KB")


def main() -> None:
    args = sys.argv[1:]
    if args[:1] == ["--cut"]:
        if len(args) < 2:
            sys.exit("--cut 뒤에 원본 그림 경로를 주세요")
        cut(Path(args[1])).save(BADGE, optimize=True)
        print("저장", BADGE.relative_to(ROOT))
    if not BADGE.exists():
        sys.exit(f"{BADGE} 가 없습니다. --cut <원본.png> 으로 먼저 만드세요")
    badge = Image.open(BADGE).convert("RGBA")

    save(badge, 512, LOGO / "badge.png")

    any_img = rounded(compose(badge, FILL_ANY), 0.19)
    save(any_img, 192, OUT / "icon-192.png")
    save(any_img, 512, OUT / "icon-512.png")
    mask_img = compose(badge, FILL_MASKABLE).convert("RGB")
    save(mask_img, 192, OUT / "icon-maskable-192.png")
    save(mask_img, 512, OUT / "icon-maskable-512.png")
    save(compose(badge, FILL_APPLE).convert("RGB"), 180, OUT / "apple-touch-icon.png")


if __name__ == "__main__":
    main()
