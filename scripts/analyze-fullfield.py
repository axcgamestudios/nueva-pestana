#!/usr/bin/env python3
"""Métricas sobre el campo de puntos PURO (contenido oculto): pantalla completa.
Cuenta muestras azules, brillo medio del canal azul de los puntos, y % brillantes."""
from PIL import Image
import sys

def full_field(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()
    total = blue = bright = 0
    bsum = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            total += 1
            if b > 45 and b > r + 18 and g > 22:
                blue += 1
                bsum += b
                if b > 130:
                    bright += 1
    print(f"[campo puro] {path} ({w}x{h}): muestras azules={blue} ({100.0*blue/total:.2f}%), "
          f"brillantes={100.0*bright/max(blue,1):.1f}%, "
          f"canal B medio de puntos={bsum/max(blue,1):.0f}/255")

for p in sys.argv[1:]:
    full_field(p)
