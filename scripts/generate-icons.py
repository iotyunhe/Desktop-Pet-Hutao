"""从桌宠立绘生成托盘图标与应用图标。

用法：
    python scripts/generate-icons.py

会从 src/renderer/assets/pet/hutao-chibi.png 裁剪出主体，
生成 resources/tray.png（16/32 托盘）、resources/icon.png（256）和
resources/icon.ico（electron-builder 用）。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "renderer" / "assets" / "pet" / "hutao-chibi.png"
OUT_DIR = ROOT / "resources"


def load_square_subject() -> Image.Image:
    image = Image.open(SOURCE).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        image = image.crop(bbox)

    side = max(image.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2), image)
    return canvas


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    subject = load_square_subject()

    subject.resize((32, 32), Image.LANCZOS).save(OUT_DIR / "tray.png")
    subject.resize((256, 256), Image.LANCZOS).save(OUT_DIR / "icon.png")
    subject.save(
        OUT_DIR / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"icons written to {OUT_DIR}")


if __name__ == "__main__":
    main()
