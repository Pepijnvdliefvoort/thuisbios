#!/usr/bin/env python3
"""Restore regenerated README screenshots that only differ by invisible pixel noise.

For every modified tracked PNG under docs/images, compare it with the committed version. When the
size is equal and no channel differs by more than THRESHOLD (default 8, first CLI argument), the
committed file is restored so the "screenshots up to date" check does not go red for nothing.
Needs Python 3 and Pillow.
"""
import io
import subprocess
import sys

from PIL import Image, ImageChops


def git(*args, binary=False):
    out = subprocess.run(["git", *args], check=True, stdout=subprocess.PIPE).stdout
    return out if binary else out.decode()


def load(source):
    image = Image.open(source)
    image.load()
    return image.convert("RGBA")


def main():
    threshold = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    paths = [p for p in git("diff", "--name-only", "--", "docs/images").splitlines() if p.lower().endswith(".png")]
    for path in paths:
        old = load(io.BytesIO(git("show", "HEAD:" + path, binary=True)))
        new = load(path)
        if old.size != new.size:
            print("%s: size changed %s -> %s, keeping" % (path, old.size, new.size))
            continue
        diff = ImageChops.difference(old, new)
        peak = max(hi for _, hi in diff.getextrema())
        if peak <= threshold:
            git("checkout", "--", path)
            print("%s: noise only (max diff %d <= %d), restored" % (path, peak, threshold))
            continue
        bands = diff.split()
        mask = bands[0]
        for band in bands[1:]:
            mask = ImageChops.lighter(mask, band)
        mask = mask.point(lambda v: 255 if v > threshold else 0)
        count = mask.histogram()[255]
        print("%s: max diff %d, %d pixels over %d, keeping" % (path, peak, count, threshold))


if __name__ == "__main__":
    main()
