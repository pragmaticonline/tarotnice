#!/usr/bin/env python3
"""Convert owner JPG card faces to WebP @1x (240px) + @2x (600px), q~82.

Reads /tmp/tarotcards.zip (or --src dir), maps source filenames to the
SPEC 3.4 keys (cards/major-00..21, cards/{suit}-{rank}), writes
build/cards/{key}.webp + {key}@2x.webp preserving aspect ratio.

Usage: python3 scripts/build-card-art.py [--src /tmp/tarotcards]
"""
import io
import os
import re
import sys
import zipfile

from PIL import Image

SRC_ZIP = "/tmp/tarotcards.zip"
OUT = "build/cards"
SIZES = {"": 240, "@2x": 600}
# JPEG copies (480px) for server-side share-image rendering: the rasterizer
# decodes JPEG/PNG but not WebP. Never referenced by pages (WebP stays).


def key_for(path):
    base = os.path.basename(path)
    m = re.match(r"Major Arcana_(\d+) - .*\.jpg$", base)
    if m:
        return "major-%02d" % int(m.group(1))
    m = re.match(r"(Wands|Cups|Swords|Pentacles)_(\d+) - .*\.jpg$", base)
    if m:
        return "%s-%02d" % (m.group(1).lower(), int(m.group(2)))
    return None


def main():
    src = sys.argv[sys.argv.index("--src") + 1] if "--src" in sys.argv else None
    files = {}
    if src:
        for root, _, names in os.walk(src):
            for n in names:
                if n.endswith(".jpg"):
                    files[os.path.join(root, n)] = open(os.path.join(root, n), "rb").read()
    else:
        with zipfile.ZipFile(SRC_ZIP) as z:
            for n in z.namelist():
                if n.endswith(".jpg"):
                    files[n] = z.read(n)
    os.makedirs(OUT, exist_ok=True)
    done, skipped = 0, []
    for path, data in sorted(files.items()):
        key = key_for(path)
        if not key:
            skipped.append(path)
            continue
        img = Image.open(io.BytesIO(data)).convert("RGB")
        for suffix, width in SIZES.items():
            h = round(img.height * width / img.width)
            out = os.path.join(OUT, key + suffix + ".webp")
            img.resize((width, h), Image.LANCZOS).save(out, "WEBP", quality=82, method=6)
        h = round(img.height * 480 / img.width)
        img.resize((480, h), Image.LANCZOS).save(os.path.join(OUT, key + ".jpg"), "JPEG", quality=80)
        done += 1
        print(key, "%dx%d" % (img.width, img.height))
    print("converted: %d, skipped: %d" % (done, len(skipped)))
    for s in skipped:
        print("SKIP:", s)


if __name__ == "__main__":
    main()
