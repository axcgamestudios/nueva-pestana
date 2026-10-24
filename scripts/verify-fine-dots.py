#!/usr/bin/env python3
"""Verifica la iteración 'puntos finos + azul marino visible + más movimiento':
1. Diferencia frame a frame (t1 vs t2, 500ms) → cuánto se mueve el campo.
2. Estadística de puntos azules en zonas limpias (visibilidad del azul marino).
3. Estimación del tamaño de los puntos (finura) vía componentes conexos.
"""
from PIL import Image
import sys

def motion_diff(a_path, b_path, thresh=18):
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    assert a.size == b.size, "tamaños distintos"
    pa, pb = a.load(), b.load()
    w, h = a.size
    changed = 0
    total = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            ra, ga, ba = pa[x, y]
            rb, gb, bb = pb[x, y]
            if abs(ra - rb) + abs(ga - gb) + abs(ba - bb) > thresh:
                changed += 1
            total += 1
    print(f"[movimiento] {a_path} vs {b_path}: {changed} px cambiados de {total} "
          f"muestreados -> {100.0 * changed / total:.2f}% del encuadre")
    return changed

def blue_stats(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()
    # franja limpia a la izquierda (solo fondo, sin tarjetas)
    x0, x1 = 0, 60
    total = blue = bright_blue = 0
    for y in range(0, h, 2):
        for x in range(x0, x1, 2):
            r, g, b = px[x, y]
            total += 1
            if b > 50 and b > r + 20 and g > 25:
                blue += 1
                if b > 130:  # azul claramente brillante, no apagado
                    bright_blue += 1
    print(f"[azul marino] {path} margen izq: azules={blue} ({100.0*blue/total:.2f}%), "
          f"de los cuales brillantes={100.0*bright_blue/max(blue,1):.1f}%")

def dot_sizes(path):
    """Estima el ancho de los puntos contando runs horizontales de píxeles no negros."""
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()
    x0, x1 = 0, 90  # margen limpio
    runs = []
    for y in range(0, h):
        run = 0
        for x in range(x0, x1):
            r, g, b = px[x, y]
            if r + g + b > 90:
                run += 1
            else:
                if run > 0:
                    runs.append(run)
                run = 0
        if run > 0:
            runs.append(run)
    if not runs:
        print(f"[finura] {path}: sin puntos detectados en el margen")
        return
    import statistics
    med = statistics.median(runs)
    mean = statistics.mean(runs)
    print(f"[finura] {path}: {len(runs)} puntos en margen, ancho mediano={med}px, "
          f"medio={mean:.1f}px, max={max(runs)}px")

if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) >= 2:
        motion_diff(args[0], args[1])
        if len(args) >= 3:
            motion_diff(args[1], args[2])
    for p in args:
        blue_stats(p)
        dot_sizes(p)
