"""把 imagegen 生成的绿幕动作立绘处理成透明 PNG 桌宠素材。

处理内容：
1. 绿幕抠图（带软边与 despill，兼容明亮/暗绿渐变背景）
2. 去掉右下角的生成器水印（该区域在所有图里都是纯背景）
3. 统一为 1024×1024 RGBA，脚底 baseline 对齐到画布底部安全区
4. 输出一张棋盘格预览图，便于人工检查边缘与缩放

用法：
    python scripts/process-action-sprites.py
    python scripts/process-action-sprites.py --input docs/hutao-action-design --output src/renderer/assets/pet
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# 生成顺序 -> 输出文件名
MAPPING = {
    "01": "hutao-umbrella-walk-left",
    "02": "hutao-umbrella-walk-right",
    "03": "hutao-lantern-wish",
    "04": "hutao-talisman",
    "05": "hutao-nap",
    "06": "hutao-flustered",
    "07": "hutao-offer-tea",
    "08": "hutao-boo",
    "09": "hutao-boo-grin",
    "10": "hutao-twirl",
    "11": "hutao-abacus",
    "12": "hutao-stretch",
}

CANVAS = 1024
BASELINE_MARGIN = 18

# 绿幕判定：greenness = g - max(r, b)
GREEN_OPAQUE = 18
GREEN_TRANSPARENT = 46

# 水印区域（相对 1024 画布），所有素材该区域都是纯背景
WATERMARK_BOX = (836, 946, 1010, 1010)


def green_alpha(r: int, g: int, b: int) -> int:
    greenness = g - max(r, b)

    if greenness >= GREEN_TRANSPARENT:
        return 0

    if greenness <= GREEN_OPAQUE:
        return 255

    ratio = (GREEN_TRANSPARENT - greenness) / (GREEN_TRANSPARENT - GREEN_OPAQUE)
    return max(0, min(255, round(ratio * 255)))


def despill(r: int, g: int, b: int) -> tuple[int, int, int]:
    """压低半透明边缘上的绿色反光，避免缩到 100px 后出现绿边。"""
    ceiling = (r + b) // 2 + 8
    if g > ceiling:
        return r, ceiling, b

    return r, g, b


def key_image(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    if image.size != (CANVAS, CANVAS):
        image = image.resize((CANVAS, CANVAS), Image.LANCZOS)

    pixels = image.load()
    left, top, right, bottom = WATERMARK_BOX

    for y in range(CANVAS):
        for x in range(CANVAS):
            r, g, b, _ = pixels[x, y]

            if left <= x < right and top <= y < bottom:
                pixels[x, y] = (0, 0, 0, 0)
                continue

            alpha = green_alpha(r, g, b)
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
                continue

            if alpha < 255:
                r, g, b = despill(r, g, b)

            pixels[x, y] = (r, g, b, alpha)

    return image


def fit_canvas(image: Image.Image) -> Image.Image:
    """保留比例，把非透明区域底部对齐，水平居中。"""
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        return image

    subject = image.crop(bbox)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))

    max_width = CANVAS - 40
    max_height = CANVAS - BASELINE_MARGIN - 24
    scale = min(1.0, max_width / subject.width, max_height / subject.height)
    if scale < 1.0:
        subject = subject.resize(
            (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
            Image.LANCZOS,
        )

    x = (CANVAS - subject.width) // 2
    y = CANVAS - BASELINE_MARGIN - subject.height
    canvas.paste(subject, (x, y), subject)
    return canvas


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    board = Image.new("RGB", size, (235, 235, 235))
    draw = Image.new("RGB", (cell, cell), (205, 205, 205))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2 == 0:
                board.paste(draw, (x, y))
    return board


def build_review_sheet(images: list[tuple[str, Image.Image]], target: Path) -> None:
    thumb = 320
    cols = 4
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb, rows * thumb), (255, 255, 255))

    for index, (_name, image) in enumerate(images):
        board = checkerboard((thumb, thumb))
        preview = image.resize((thumb, thumb), Image.LANCZOS)
        board.paste(preview, (0, 0), preview)
        sheet.paste(board, ((index % cols) * thumb, (index // cols) * thumb))

    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target)
    print(f"review sheet: {target}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(ROOT / "docs" / "hutao-action-design"))
    parser.add_argument("--output", default=str(ROOT / "tmp" / "action-keyed"))
    parser.add_argument("--review", default=str(ROOT / "tmp" / "action-keyed-review.png"))
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    sources = sorted(input_dir.glob("*.png"))
    if not sources:
        raise SystemExit(f"没有找到输入图片：{input_dir}")

    processed: list[tuple[str, Image.Image]] = []

    for source in sources:
        number = source.name.split("-", 1)[0]
        name = MAPPING.get(number)
        if not name:
            print(f"skip unknown: {source.name}")
            continue

        keyed = fit_canvas(key_image(source))
        target = output_dir / f"{name}.png"
        keyed.save(target, optimize=True)

        bbox = keyed.getchannel("A").getbbox()
        opaque = sum(keyed.getchannel("A").histogram()[1:]) / (CANVAS * CANVAS)
        print(f"{source.name} -> {target.name} bbox={bbox} opaque={opaque:.1%}")
        processed.append((name, keyed))

    build_review_sheet(processed, Path(args.review))


if __name__ == "__main__":
    main()
