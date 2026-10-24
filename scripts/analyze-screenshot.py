#!/usr/bin/env python3
"""Analiza los píxeles de la captura de pantalla (no el canvas): ¿se ven los puntos?"""
from PIL import Image
import sys

def analyze(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()
    regions = {
        "margen_izq (x<70)": (0, 0, 70, h),
        "margen_der (x>w-70)": (w - 70, 0, w, h),
        "franja_sup (y<70)": (0, 0, w, 70),
        "centro": (w // 2 - 200, h // 2 - 200, w // 2 + 200, h // 2 + 200),
    }
    print(f"== {path} ({w}x{h}) ==")
    for name, (x0, y0, x1, y1) in regions.items():
        total = blue = white = nonblack = 0
        for y in range(y0, y1, 2):
            for x in range(x0, x1, 2):
                r, g, b = px[x, y]
                total += 1
                if b > 60 and b > r + 25 and g > 35:  # azul
                    blue += 1
                elif r > 120 and g > 120 and b > 120:  # blanco/gris claro
                    white += 1
                if r + g + b > 60:
                    nonblack += 1
        print(
            f"{name}: azules={blue} blancos={white} noNegros={nonblack} "
            f"({100*blue/total:.1f}% azules de {total} muestras)"
        )

for p in sys.argv[1:]:
    analyze(p)
