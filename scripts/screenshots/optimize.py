"""Shrinks the PNGs in docs/images (palette quantize with dithering). Best effort, needs Pillow."""
import sys
from pathlib import Path
from PIL import Image

LIMIT = 500 * 1024
folder = Path(sys.argv[1])
for path in sorted(folder.glob('*.png')):
    before = path.stat().st_size
    if before <= LIMIT:
        continue
    img = Image.open(path).convert('RGB')
    small = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    small.save(path, optimize=True)
    print(f'{path.name}: {before // 1024} KB -> {path.stat().st_size // 1024} KB')
