"""Builds every icon the project ships from resources/icon-source.png.

The source is the rounded-square artwork on a white canvas: we crop to the square,
cut the corners out so they're transparent, then export app / tray / .ico /
extension / website sizes.  Run: python scripts/make-icons.py   (needs Pillow)"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "resources" / "icon-source.png"


def square_bounds(img: Image.Image, threshold: int = 235) -> tuple[int, int, int, int]:
    """Bounding box of the non-white artwork."""
    gray = img.convert("L")
    mask = gray.point(lambda v: 255 if v < threshold else 0)
    return mask.getbbox()


MARK = (255, 0, 255)


def master() -> Image.Image:
    img = Image.open(SOURCE).convert("RGB")
    art = img.crop(square_bounds(img))
    size = max(art.size)
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2))

    # The white background only touches the corners; flood-fill it from there so the
    # white arrow inside the artwork is untouched.
    marked = canvas.copy()
    for corner in [(0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1)]:
        ImageDraw.floodfill(marked, corner, MARK, thresh=70)
    alpha = Image.new("L", (size, size), 255)
    px_bg, px_a = marked.load(), alpha.load()
    for y in range(size):
        for x in range(size):
            if px_bg[x, y] == MARK:
                px_a[x, y] = 0
    # Shave the light anti-aliased fringe, then soften the edge again
    alpha = alpha.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))

    out = canvas.convert("RGBA")
    out.putalpha(alpha)
    return out


def export(img: Image.Image, size: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path)


def main() -> None:
    icon = master()
    res = ROOT / "resources"
    export(icon, 512, res / "icon.png")
    export(icon, 32, res / "tray.png")
    icon.resize((256, 256), Image.LANCZOS).save(
        res / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    for n in (16, 32, 48, 128):
        export(icon, n, ROOT / "extension" / "icons" / f"icon{n}.png")
    export(icon, 256, ROOT / "website" / "assets" / "icon.png")
    export(icon, 128, ROOT / "src" / "renderer" / "src" / "assets" / "logo.png")

    # Social preview (1200x630) for the website
    og = Image.new("RGB", (1200, 630), (13, 17, 26))
    draw = ImageDraw.Draw(og)
    for y in range(630):
        t = y / 630
        draw.line([(0, y), (1200, y)], fill=(int(13 + 10 * t), int(17 + 20 * t), int(26 + 50 * t)))
    mark = icon.resize((300, 300), Image.LANCZOS)
    og.paste(mark, (450, 165), mark)
    og.save(ROOT / "website" / "assets" / "og.png")
    print("icons written")


if __name__ == "__main__":
    main()
