"use client";

/**
 * Preloader de motion graphics del diseño axcStudios:
 * átomo 3D metálico (3 órbitas con núcleo) rodeando el logo, anillos de
 * progreso, partículas ascendentes y barra con porcentaje. Duración 1.5 s
 * + fundido; con `prefers-reduced-motion` se omite directamente.
 */
import { useEffect, useState } from "react";
import { asset } from "@/lib/paths";

const PARTICLES = [
  { left: "6%", dur: "6.5s", delay: "0s" },
  { left: "14%", dur: "8s", delay: "1.2s" },
  { left: "24%", dur: "7s", delay: ".5s" },
  { left: "35%", dur: "9s", delay: "2s" },
  { left: "48%", dur: "6s", delay: ".9s" },
  { left: "60%", dur: "8.5s", delay: "1.6s" },
  { left: "70%", dur: "7.5s", delay: ".3s" },
  { left: "80%", dur: "6.8s", delay: "2.4s" },
  { left: "88%", dur: "8.2s", delay: "1s" },
  { left: "94%", dur: "7.2s", delay: ".7s" },
];

export default function Preloader({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(false);
  const [pct, setPct] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const finish = () => {
      setDone(true);
      onDone();
      window.setTimeout(() => setHidden(true), 950);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    document.body.classList.add("noscroll", "boot");
    const t0 = performance.now();
    const DUR = 1500;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR);
      const e = 1 - Math.pow(1 - p, 3);
      setPct(Math.round(e * 100));
      if (p < 1) raf = requestAnimationFrame(tick);
      else window.setTimeout(finish, 260);
    };
    raf = requestAnimationFrame(tick);
    const bootTimer = window.setTimeout(() => document.body.classList.remove("boot"), 2700);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(bootTimer);
      document.body.classList.remove("noscroll", "boot");
    };
     
  }, []);

  if (hidden) return null;

  return (
    <div id="preloader" className={done ? "done" : ""} aria-hidden="true">
      <div className="pl-parts" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <i
            key={i}
            style={{ left: p.left, animationDuration: p.dur, animationDelay: p.delay }}
          />
        ))}
      </div>
      <div className="pl-core">
        <div className="pl-ring" />
        <div className="pl-ring r2" />
        <div className="pl-atom" aria-hidden="true">
          <div className="pl-orbit o1">
            <i />
          </div>
          <div className="pl-orbit o2" style={{ ["--r3d" as string]: "rotateY(60deg)" }}>
            <i />
          </div>
          <div className="pl-orbit o3" style={{ ["--r3d" as string]: "rotateY(-60deg)" }}>
            <i />
          </div>
        </div>
        { }
        <img className="pl-logo" src={asset("/axc/logo.webp")} alt="" />
        <div className="pl-name">
          axc<em>Games</em>
        </div>
        <div className="pl-tag">WEB · GAME · STUDIO</div>
        <div className="pl-bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="pl-pct">{pct}%</div>
      </div>
    </div>
  );
}
