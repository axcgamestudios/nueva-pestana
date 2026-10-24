"use client";

import { useEffect, useRef } from "react";

/**
 * Fondo de puntos estilo Claude: malla regular de puntitos muy pequeños
 * azul/blanco sobre negro puro, con oleaje 3D bien marcado:
 * - Múltiples escalas de ola (mar de fondo + oleaje medio + ripples finos)
 *   que viajan por la pantalla.
 * - Vaivén coherente: cada punto "monta" su ola (los vecinos se mueven
 *   juntos) → la malla ondula como una superficie de agua 3D.
 * - Crestas que crecen y se blanquean, valles que se encogen y atenúan.
 * - Halo suave que sigue al cursor (los puntos se avivan cerca del puntero)
 * - Se pausa cuando la pestaña está oculta y respeta prefers-reduced-motion
 * - Solo canvas (drawImage de sprites pre-renderizados) → muy fluido
 */
function DotField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // Sprites pre-renderizados: punto diminuto con halo suave
    const makeSprite = (r: number, g: number, b: number) => {
      const s = document.createElement("canvas");
      s.width = 16;
      s.height = 16;
      const c = s.getContext("2d");
      if (!c) return s;
      const grad = c.createRadialGradient(8, 8, 0, 8, 8, 8);
      grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
      grad.addColorStop(0.45, `rgba(${r},${g},${b},0.9)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = grad;
      c.fillRect(0, 0, 16, 16);
      return s;
    };
    const BLUE = makeSprite(96, 165, 250); // blue-400
    const WHITE = makeSprite(255, 255, 255);

    let cols = 0;
    let rows = 0;
    let spacing = 32;
    let phase = new Float32Array(0);
    let whiteBase = new Uint8Array(0);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spacing = w < 640 ? 26 : 30;
      cols = Math.ceil(w / spacing) + 2;
      rows = Math.ceil(h / spacing) + 2;
      phase = new Float32Array(cols * rows);
      whiteBase = new Uint8Array(cols * rows);
      for (let i = 0; i < phase.length; i++) {
        phase[i] = Math.random() * Math.PI * 2;
        // ~13% de puntos blancos de base → mezcla azul/blanca siempre visible
        whiteBase[i] = Math.random() < 0.13 ? 1 : 0;
      }
      if (reduced) draw(4000); // versión estática para reduced-motion
    };

    // Cursor con inercia: halo que persigue al puntero
    const target = { x: -9999, y: -9999 };
    const halo = { x: -9999, y: -9999 };
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
    };
    const onLeave = () => {
      target.x = -9999;
      target.y = -9999;
    };

    const draw = (time: number) => {
      const t = time / 1000;
      ctx.clearRect(0, 0, w, h);

      // Las olas viajan rápido → oleaje claramente perceptible
      const driftX = t * 55 + Math.sin(t * 0.1) * 120;
      const driftY = t * 34 + Math.cos(t * 0.08) * 80;

      // Macro-onda: regiones amplas de brillo que recorren el fondo
      const macroA = t * 0.12;

      halo.x += (target.x - halo.x) * 0.09;
      halo.y += (target.y - halo.y) * 0.09;
      const HALO_R = 190;
      const HR2 = HALO_R * HALO_R;

      // Amplitud del vaivén: la malla ondula como una superficie de agua
      const SWAY = 8;

      for (let j = 0; j < rows; j++) {
        const gy = j * spacing;
        for (let i = 0; i < cols; i++) {
          const gx = i * spacing;
          const ph = phase[j * cols + i];
          const sx = gx + driftX;
          const sy = gy + driftY;

          // Ola principal (mar de fondo, lenta y amplia)
          const p1 = sx * 0.0046 + t * 0.5 + ph * 0.18;
          const p2 = sy * 0.0062 - t * 0.4 + ph * 0.12;
          const p3 = (sx + sy) * 0.0027 + t * 0.33;
          // Onda media (viaja rápido → oleaje visible)
          const pm = sx * 0.0115 + sy * 0.0063 - t * 1.5 + ph * 0.25;
          // Ripple fino (mantiene la superficie "viva")
          const pr = sx * 0.023 - t * 2.5 + ph * 0.45;

          let d =
            ((Math.sin(p1) + Math.sin(p2) + Math.sin(p3)) / 3) * 0.55 +
            Math.sin(pm) * 0.28 +
            Math.sin(pr) * 0.17;
          d = (d + 1) / 2; // 0..1 — profundidad (0 valle, 1 cresta)

          // Halo del cursor: los puntos se avivan cerca del puntero
          const dx = gx - halo.x;
          const dy = gy - halo.y;
          const md2 = dx * dx + dy * dy;
          let glow = 0;
          if (md2 < HR2) glow = (1 - Math.sqrt(md2) / HALO_R) * 0.85;
          const depth = Math.min(1, d + glow);

          // Macro-onda de brillo
          const macro =
            0.5 + 0.5 * Math.sin((gx * 0.0011 + gy * 0.0017) + macroA);

          // Vaivén coherente: cada punto "monta" su ola (gradiente de fase)
          // → los vecinos se mueven juntos y la malla ondula como agua 3D
          const px = gx + Math.cos(p1) * SWAY * 0.6 + Math.cos(pr) * SWAY * 0.4;
          const py = gy + Math.cos(p2) * SWAY * 0.6 + Math.cos(pm) * SWAY * 0.4;

          // Rango dinámico amplio: valles pequeños/tenues → crestas grandes/brillantes
          const r = 0.7 + depth * 2.1; // Ø ≈ 1.4–5.6 px
          const sz = r * 2;
          // Contraste marcado: los valles se atenúan, las crestas brillan
          const a = (0.42 + depth * 0.58) * (0.72 + macro * 0.28);

          // Malla estilo Claude — valles azules → crestas blancas
          const white = whiteBase[j * cols + i];
          ctx.globalAlpha = white ? Math.min(1, a * 1.35) : a;
          ctx.drawImage(white ? WHITE : BLUE, px - r, py - r, sz, sz);
          if (depth > 0.4) {
            ctx.globalAlpha = Math.min(1, (depth - 0.4) * 2.4);
            ctx.drawImage(WHITE, px - r, py - r, sz, sz);
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    const step = (t: number) => {
      if (!running) return;
      draw(t);
      raf = requestAnimationFrame(step);
    };

    const onVisibility = () => {
      if (reduced) return;
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(step);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    if (!reduced) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVisibility);
      raf = requestAnimationFrame(step);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

/**
 * Fondo animado premium: negro puro + campo de puntos con oleaje 3D
 * azul/blanco (estilo Claude). `dim` atenúa el fondo en la vista de juego.
 */
export default function AnimatedBg({ dim = false }: { dim?: boolean }) {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-black">
      <DotField />
      {dim && <div className="absolute inset-0 bg-black/40" />}
    </div>
  );
}
