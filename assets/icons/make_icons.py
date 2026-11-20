"""앱 아이콘 굽기 (홈 화면에 추가할 때 쓰는 아이콘).

남색 바탕 + 아래쪽을 가로지르는 금색 띠 + 그 띠 위에 찍힌 빨간 결재 도장(나무 손잡이, 도장 면에 "3P").
1인칭 게임 속 거대 도장(src/fps/hazards.ts: 나무 손잡이 + 넓은 빨간 도장 머리)을 옆에서 본 모양이다.

SVG를 Chrome(headless)으로 1024px로 그린 뒤 Pillow로 줄여 public/icons/ 에 PNG로 저장한다.
  py -X utf8 assets/icons/make_icons.py
필요: Chrome, Pillow.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "icons"
BIG = 1024

NAVY = "#002c52"
GOLD = "#e0bb62"

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
]


def art(scale: float) -> str:
    """그림 본체 (512 좌표). scale: 가운데를 기준으로 줄이는 비율 (maskable은 안전 영역 안에 넣으려고 줄인다)."""
    return f"""
  <g transform="translate(256 240) scale({scale}) translate(-256 -240)">
    <!-- 찍힌 충격선 (금색) -->
    <g stroke="{GOLD}" stroke-width="9" stroke-linecap="round" opacity=".9">
      <line x1="124" y1="284" x2="100" y2="258"/>
      <line x1="118" y1="308" x2="84" y2="300"/>
      <line x1="388" y1="284" x2="412" y2="258"/>
      <line x1="394" y1="308" x2="428" y2="300"/>
    </g>
    <!-- 손잡이 위 꼭지 -->
    <ellipse cx="256" cy="118" rx="60" ry="44" fill="#8b5a2b"/>
    <ellipse cx="240" cy="104" rx="30" ry="16" fill="#b07a44" opacity=".75"/>
    <!-- 손잡이 목 -->
    <path d="M226 150 L286 150 L298 252 L214 252 Z" fill="#8b5a2b"/>
    <path d="M232 150 L248 150 L244 252 L224 252 Z" fill="#a8723d" opacity=".8"/>
    <!-- 깃 (나무 → 도장 머리) -->
    <rect x="194" y="244" width="124" height="24" rx="6" fill="#6b4220"/>
    <!-- 도장 머리 (빨간 도장 면) -->
    <rect x="140" y="262" width="232" height="92" rx="14" fill="#c8202f"/>
    <rect x="140" y="262" width="232" height="20" rx="10" fill="#e23a48"/>
    <rect x="140" y="336" width="232" height="18" rx="8" fill="#9c1622"/>
    <text x="256" y="331" text-anchor="middle" font-family="'Arial Black','Segoe UI Black','Malgun Gothic',sans-serif"
          font-weight="900" font-size="66" fill="#fff4e2" letter-spacing="2">3P</text>
  </g>"""


def svg(scale: float) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{BIG}" height="{BIG}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="70%">
      <stop offset="0" stop-color="#0b4274"/>
      <stop offset="1" stop-color="{NAVY}"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <!-- 금색 띠: 아이콘 아래쪽을 가로지른다 (도장이 이 띠 위에 찍힘) -->
  <g transform="translate(256 240) scale({scale}) translate(-256 -240)">
    <rect x="-400" y="320" width="1312" height="68" fill="{GOLD}"/>
    <rect x="-400" y="320" width="1312" height="6" fill="#f0d488"/>
    <rect x="-400" y="382" width="1312" height="6" fill="#b8913c"/>
    <!-- 도장이 닿은 자리의 인주 그림자 -->
    <ellipse cx="256" cy="356" rx="134" ry="12" fill="#8e1420" opacity=".55"/>
  </g>
{art(scale)}
</svg>"""


def find_chrome() -> str:
    for c in CHROME_CANDIDATES:
        if Path(c).exists():
            return c
    sys.exit("Chrome을 찾지 못했습니다")


def render(chrome: str, svg_text: str, out_png: Path, tmp: Path) -> None:
    html = tmp / f"{out_png.stem}.html"
    html.write_text(
        f"<!doctype html><html><body style='margin:0;overflow:hidden;background:{NAVY}'>{svg_text}</body></html>",
        encoding="utf-8",
    )
    subprocess.run(
        [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            f"--user-data-dir={tmp / 'profile'}",
            f"--window-size={BIG},{BIG}",
            f"--screenshot={out_png}",
            html.as_uri(),
        ],
        check=True,
        capture_output=True,
    )


def rounded(img: Image.Image, radius_ratio: float) -> Image.Image:
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    r = int(img.size[0] * radius_ratio)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], r, fill=255)
    img.putalpha(mask)
    return img


def main() -> None:
    chrome = find_chrome()
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        full = tmp / "full.png"
        mask = tmp / "mask.png"
        render(chrome, svg(1.0), full, tmp)
        # maskable: 지름 80% 안전 원 안에 도장이 다 들어가도록 더 줄인다
        render(chrome, svg(0.82), mask, tmp)
        full_img = Image.open(full).convert("RGB").crop((0, 0, BIG, BIG))
        mask_img = Image.open(mask).convert("RGB").crop((0, 0, BIG, BIG))

        def save(img: Image.Image, size: int, name: str) -> None:
            img.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
            print("저장", OUT / name)

        any_img = rounded(full_img, 0.19)
        save(any_img, 192, "icon-192.png")
        save(any_img, 512, "icon-512.png")
        save(mask_img, 192, "icon-maskable-192.png")
        save(mask_img, 512, "icon-maskable-512.png")
        # 아이폰은 투명 없이 꽉 찬 정사각형 (모서리는 iOS가 깎는다)
        save(full_img, 180, "apple-touch-icon.png")


if __name__ == "__main__":
    main()
