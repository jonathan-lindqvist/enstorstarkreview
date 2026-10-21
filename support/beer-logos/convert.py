#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""Fit images onto small beige square WebP thumbnails with a margin.

Reads sources/ and writes output/; copy the results to static/beer-brands/ by hand.

Usage:
    uv run convert.py [INPUT_DIR] [-o OUTPUT_DIR] [--size 256] [--quality 90]
                      [--margin 10] [--background "#fefaf0"] [--no-trim] [--lossless] [--overwrite]
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

HERE = Path(__file__).resolve().parent
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif"}
# Colour distance treated as "same as background"; absorbs JPEG noise.
TOLERANCE = 24


def trim(img: Image.Image) -> Image.Image:
    """Crop away transparent or solid-colour borders the source already has."""
    alpha = img.getchannel("A")
    if alpha.getextrema()[0] < 255:
        mask = alpha.point(lambda a: 255 if a > TOLERANCE else 0)
    else:
        w, h = img.size
        corners = [img.getpixel(xy)[:3] for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
        # Differing corners mean a photo with no plain border; leave it alone.
        if any(abs(a - b) > TOLERANCE for c in corners for a, b in zip(c, corners[0])):
            return img
        rgb = img.convert("RGB")
        diff = ImageChops.difference(rgb, Image.new("RGB", img.size, corners[0]))
        mask = ImageChops.lighter(ImageChops.lighter(*diff.split()[:2]), diff.getchannel("B"))
        mask = mask.point(lambda v: 255 if v > TOLERANCE else 0)
    bbox = mask.getbbox()
    return img.crop(bbox) if bbox else img


def convert(
    src: Path,
    dest: Path,
    size: int,
    margin: int,
    background: str,
    quality: int,
    lossless: bool,
    no_trim: bool,
) -> None:
    with Image.open(src) as img:
        # Apply EXIF rotation before the metadata is dropped.
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGBA")
        if not no_trim:
            img = trim(img)

        inner = max(1, size - 2 * round(size * margin / 100))
        img = ImageOps.contain(img, (inner, inner), Image.Resampling.LANCZOS)

        canvas = Image.new("RGB", (size, size), background)
        # Alpha mask flattens transparent logos onto the background.
        canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2), img)
        canvas.save(dest, "WEBP", quality=100 if lossless else quality, lossless=lossless, method=6)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("input_dir", type=Path, nargs="?", default=HERE / "sources")
    parser.add_argument("-o", "--output-dir", type=Path, default=HERE / "output")
    parser.add_argument("--size", type=int, default=256, help="square side in px (default 256)")
    parser.add_argument(
        "--margin", type=int, default=10, help="margin per side, %% of size (default 10)"
    )
    parser.add_argument("--quality", type=int, default=90, help="WebP quality 1-100 (default 90)")
    parser.add_argument(
        "--background", default="#fefaf0", help="square colour, any CSS-style colour (default #fefaf0)"
    )
    parser.add_argument("--no-trim", action="store_true", help="keep existing borders")
    parser.add_argument("--lossless", action="store_true", help="lossless WebP (larger files)")
    parser.add_argument("--overwrite", action="store_true", help="replace existing outputs")
    args = parser.parse_args()

    if not args.input_dir.is_dir():
        print(f"Not a directory: {args.input_dir}", file=sys.stderr)
        return 1

    if not 0 <= args.margin < 50:
        print("--margin must be between 0 and 49", file=sys.stderr)
        return 1

    out_dir = args.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    sources = sorted(
        p for p in args.input_dir.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS
    )
    if not sources:
        print(f"No images found in {args.input_dir}", file=sys.stderr)
        return 1

    failures = 0
    before_total = after_total = 0
    for src in sources:
        dest = out_dir / f"{src.stem}.webp"
        if dest.exists() and not args.overwrite:
            print(f"skip  {src.name} (exists)")
            continue
        try:
            convert(src, dest, args.size, args.margin, args.background, args.quality, args.lossless, args.no_trim)
        except Exception as exc:  # keep going on bad files
            failures += 1
            print(f"FAIL  {src.name}: {exc}", file=sys.stderr)
            continue
        before, after = src.stat().st_size, dest.stat().st_size
        before_total += before
        after_total += after
        print(f"ok    {src.name} {before / 1024:.0f} KB -> {dest.name} {after / 1024:.0f} KB")

    if after_total:
        print(f"\n{before_total / 1024:.0f} KB -> {after_total / 1024:.0f} KB in {out_dir}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
