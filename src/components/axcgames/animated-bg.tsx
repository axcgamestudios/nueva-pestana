"use client";

import { useEffect, useRef } from "react";

/**
 * Campo de partículas premium (canvas) — tema azul:
 * - Partículas azules/blancas con titileo (twinkle) y conexiones.
 * - Estrellas fugaces (meteoros) con estela azul/cian.
 * Se pausa cuando la pestaña está oculta y respeta prefers-reduced-motion.
 */
function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    type P = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      blue: boolean;
      /** fase de titileo */
      tw: number;
      twSpeed: number;
    };
    type Meteor = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      len: number;
      life: number;
      maxLife: number;
    };

    let parts: P[] = [];
    let meteors: Meteor[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    let nextMeteorAt = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(95, Math.max(30, Math.floor((w * h) / 24000)));
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.6 + 0.5,
        blue: Math.random() < 0.55,
        tw: Math.random() * Math.PI * 2,
        twSpeed: 0.008 + Math.random() * 0.02,
      }));
    };

    const spawnMeteor = (t: number) => {
      // Diagonal descendente desde la zona superior
      const fromTop = Math.random() < 0.75;
      const speed = 7 + Math.random() * 5;
      const angle = (Math.PI / 180) * (18 + Math.random() * 16);
      meteors.push({
        x: fromTop ? Math.random() * w * 0.8 : -40,
        y: fromTop ? -20 : Math.random() * h * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: 110 + Math.random() * 140,
        life: 0,
        maxLife: 55 + Math.random() * 30,
      });
      // Próxima estrella fugaz en 3–9 s
      nextMeteorAt = t + 3000 + Math.random() * 6000;
    };

    const step = (t: number) => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      if (t >= nextMeteorAt) spawnMeteor(t);

      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.tw += p.twSpeed;
        if (p.x < -24) p.x = w + 24;
        if (p.x > w + 24) p.x = -24;
        if (p.y < -24) p.y = h + 24;
        if (p.y > h + 24) p.y = -24;
      }

      const maxDist = 110;
      for (let i = 0; i < parts.length; i++) {
        const a = parts[i];
        for (let j = i + 1; j < parts.length; j++) {
          const b = parts[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < maxDist * maxDist) {
            const alpha = (1 - Math.sqrt(d2) / maxDist) * 0.14;
            ctx.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Estrellas con titileo (más brillo en el pico del ciclo)
      for (const p of parts) {
        const twinkle = 0.55 + 0.45 * Math.sin(p.tw);
        ctx.fillStyle = p.blue
          ? `rgba(96, 165, 250, ${0.5 * twinkle + 0.15})`
          : `rgba(255, 255, 255, ${0.34 * twinkle + 0.1})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Estrellas fugaces: estela con degradado + núcleo brillante
      meteors = meteors.filter((m) => m.life < m.maxLife);
      for (const m of meteors) {
        m.life += 1;
        m.x += m.vx;
        m.y += m.vy;
        const fade = Math.sin((m.life / m.maxLife) * Math.PI); // entra y sale suave
        const tailX = m.x - (m.vx / Math.hypot(m.vx, m.vy)) * m.len;
        const tailY = m.y - (m.vy / Math.hypot(m.vx, m.vy)) * m.len;
        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, `rgba(219, 234, 254, ${0.85 * fade})`);
        grad.addColorStop(0.35, `rgba(96, 165, 250, ${0.4 * fade})`);
        grad.addColorStop(1, "rgba(59, 130, 246, 0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        // Núcleo
        ctx.fillStyle = `rgba(240, 249, 255, ${0.9 * fade})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(step);
    };

    const onVisibility = () => {
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
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(step);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full opacity-70" />;
}

/**
 * Fondo animado premium: campo de partículas azul con fugaces + auroras
 * + rayo de luz + grid + ruido + viñeta. Solo transform/opacity/canvas
 * para rendimiento. Respeta prefers-reduced-motion.
 */
export default function AnimatedBg({ dim = false }: { dim?: boolean }) {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-black">
      {/* Campo de partículas con estrellas fugaces */}
      <Particles />

      {/* Blobs de aurora (familia azul) */}
      <div
        className="axc-aurora axc-aurora-a absolute -top-[20%] left-[-10%] h-[55vmax] w-[55vmax] rounded-full opacity-70 blur-[110px]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(37,99,235,0.20), rgba(59,130,246,0.07) 45%, transparent 70%)",
        }}
      />
      <div
        className="axc-aurora axc-aurora-b absolute top-[30%] right-[-15%] h-[50vmax] w-[50vmax] rounded-full opacity-60 blur-[120px]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(56,189,248,0.14), rgba(14,165,233,0.06) 45%, transparent 70%)",
        }}
      />
      <div
        className="axc-aurora axc-aurora-c absolute bottom-[-25%] left-[20%] h-[45vmax] w-[45vmax] rounded-full opacity-60 blur-[130px]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(99,102,241,0.12), rgba(79,70,229,0.05) 45%, transparent 70%)",
        }}
      />

      {/* Rayo de luz que barre la pantalla */}
      <div
        className="axc-beam absolute -top-[20%] left-0 h-[140%] w-[24vw]"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(59,130,246,0.05) 45%, rgba(147,197,253,0.10) 50%, rgba(59,130,246,0.05) 55%, transparent)",
          filter: "blur(6px)",
        }}
      />

      {/* Grid con paneo lento */}
      <div className="axc-grid absolute inset-0 opacity-[0.55]" />

      {/* Ruido */}
      <div
        className="axc-noise absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Viñeta */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% 0%, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {dim && <div className="absolute inset-0 bg-black/30" />}
    </div>
  );
}
