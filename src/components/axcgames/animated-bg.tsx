"use client";

import { useEffect, useRef } from "react";

/**
 * Fondo de puntos estilo Claude: malla regular de puntitos muy pequeños
 * azul/blanco sobre negro puro, cuyo tamaño y brillo ondulan como olas
 * en 3D (superposición de ondas que viajan + macro-onda de brillo).
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
      spacing = w < 640 ? 28 : 32;
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

      // El patrón de oleaje se traslada lento por la pantalla (olas que viajan)
      const driftX = t * 26 + Math.sin(t * 0.1) * 120;
      const driftY = t * 16 + Math.cos(t * 0.08) * 80;

      // Macro-onda: regiones amplas de brillo que recorren el fondo
      const macroA = t * 0.12;

      halo.x += (target.x - halo.x) * 0.09;
      halo.y += (target.y - halo.y) * 0.09;
      const HALO_R = 190;
      const HR2 = HALO_R * HALO_R;

      for (let j = 0; j < rows; j++) {
        const y = j * spacing;
        for (let i = 0; i < cols; i++) {
          const x = i * spacing;
          const ph = phase[j * cols + i];

          // Campo de profundidad: superposición de ondas en varias direcciones
          const sx = x + driftX;
          const sy = y + driftY;
          let d =
            Math.sin(sx * 0.0046 + t * 0.5 + ph * 0.18) +
            Math.sin(sy * 0.0062 - t * 0.4 + ph * 0.12) +
            Math.sin((sx + sy) * 0.0027 + t * 0.33);
          d = (d / 3 + 1) / 2; // 0..1 — profundidad simulada (0 lejos, 1 cerca)

          // Halo del cursor: los puntos se avivan cerca del puntero
          // (antes del umbral → el cursor “revela” incluso los valles)
          const dx = x - halo.x;
          const dy = y - halo.y;
          const md2 = dx * dx + dy * dy;
          let glow = 0;
          if (md2 < HR2) glow = (1 - Math.sqrt(md2) / HALO_R) * 0.85;
          const depth = Math.min(1, d + glow);

          if (depth < 0.1) continue; // puntos "lejanos" casi invisibles → huecos orgánicos

          // Macro-onda de brillo
          const macro =
            0.5 + 0.5 * Math.sin((x * 0.0011 + y * 0.0017) + macroA);

          const r = 0.55 + depth * 1.05; // Ø ≈ 1.1–3.2 px → puntitos diminutos
          const sz = r * 2;
          const a = (0.15 + depth * 0.6) * (0.55 + macro * 0.45);

          // Valles azules → crestas blancas (sensación de relieve 3D)
          ctx.globalAlpha = whiteBase[j * cols + i] ? Math.min(1, a * 1.2) : a;
          ctx.drawImage(whiteBase[j * cols + i] ? WHITE : BLUE, x - r, y - r, sz, sz);
          if (depth > 0.5) {
            ctx.globalAlpha = Math.min(1, (depth - 0.5) * 2);
            ctx.drawImage(WHITE, x - r, y - r, sz, sz);
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
