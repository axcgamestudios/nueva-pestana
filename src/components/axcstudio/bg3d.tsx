"use client";

/**
 * FONDO 3D ÉPICO del diseño axcStudios — port de axc-bg.js (Three.js).
 * Galaxia espiral (2 capas) + marea de partículas (onda viva) + poliedros
 * wireframe + polvo estelar + ondas de choque con parallax de ratón,
 * reacción al scroll y pulsos ('axc:pulse') al iniciar sesión.
 * Si WebGL falla, queda el fondo aurora CSS como fallback elegante.
 */
import { useEffect, useRef } from "react";

const COLORS = {
  bg: 0x06070d,
  blue: 0x2e7cf6,
  cyan: 0x38e8ff,
  violet: 0x8b5cf6,
  ice: 0x9ecbff,
};

const gauss = (): number => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;


export default function Bg3d() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      let THREE: typeof import("three");
      try {
        THREE = await import("three");
      } catch {
        return; // sin three: fondo aurora CSS
      }
      if (disposed) return;

      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: !isMobile,
          powerPreference: "high-performance",
        });
      } catch {
        return; // sin WebGL: fallback CSS
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
      renderer.setSize(window.innerWidth, window.innerHeight);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(COLORS.bg, 0.026);
      const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 260);
      camera.position.set(0, 6.2, 30);

      /* textura de disco suave para los puntos */
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const x = c.getContext("2d");
      if (!x) return;
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);

      const mkMat = (size: number, opacity: number) =>
        new THREE.PointsMaterial({
          size,
          map: tex,
          transparent: true,
          opacity,
          vertexColors: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          sizeAttenuation: true,
        });

      /* ---------- GALAXIA ESPIRAL (2 capas) ---------- */
      function makeGalaxy(count: number, size: number, opacity: number) {
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        const cCore = new THREE.Color(COLORS.ice);
        const cMid = new THREE.Color(COLORS.blue);
        const cEdge = new THREE.Color(COLORS.violet);
        const cCy = new THREE.Color(COLORS.cyan);
        const tmp = new THREE.Color();
        for (let i = 0; i < count; i++) {
          const r = Math.pow(Math.random(), 2) * 16 + 0.4;
          const arm = i % 3;
          const a = arm * ((Math.PI * 2) / 3) + r * 0.34 + gauss() * 0.22;
          pos[i * 3] = Math.cos(a) * r + gauss() * 0.4;
          pos[i * 3 + 1] = gauss() * (1.15 - r / 18) * 1.6 + 2.2;
          pos[i * 3 + 2] = Math.sin(a) * r + gauss() * 0.4 - 6;
          const t = Math.min(r / 16, 1);
          if (t < 0.5) tmp.copy(cCore).lerp(cMid, t * 2);
          else tmp.copy(cMid).lerp(cEdge, (t - 0.5) * 2);
          if (Math.random() < 0.12) tmp.lerp(cCy, 0.7);
          col[i * 3] = tmp.r;
          col[i * 3 + 1] = tmp.g;
          col[i * 3 + 2] = tmp.b;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
        return new THREE.Points(geo, mkMat(size, opacity));
      }
      const galaxy = new THREE.Group();
      const N = isMobile ? 3800 : 9000;
      const galA = makeGalaxy(Math.floor(N * 0.7), 0.3, 0.75);
      const galB = makeGalaxy(Math.ceil(N * 0.3), 0.62, 0.95);
      galaxy.add(galA, galB);
      scene.add(galaxy);

      /* ---------- MAREA DE PARTÍCULAS (onda viva) ---------- */
      const COLS = isMobile ? 60 : 150;
      const ROWS = isMobile ? 30 : 62;
      const W = 62;
      const D = 34;
      const waveCount = COLS * ROWS;
      const wpos = new Float32Array(waveCount * 3);
      const wcol = new Float32Array(waveCount * 3);
      const wDeep = new THREE.Color(0x0a2b6b);
      const wCy = new THREE.Color(COLORS.cyan);
      const wTmp = new THREE.Color();
      for (let r = 0; r < ROWS; r++) {
        for (let cc = 0; cc < COLS; cc++) {
          const i = (r * COLS + cc) * 3;
          wpos[i] = (cc / (COLS - 1) - 0.5) * W;
          wpos[i + 2] = (r / (ROWS - 1) - 0.5) * D + 8;
        }
      }
      const waveGeo = new THREE.BufferGeometry();
      waveGeo.setAttribute("position", new THREE.Float32BufferAttribute(wpos, 3));
      waveGeo.setAttribute("color", new THREE.Float32BufferAttribute(wcol, 3));
      const wave = new THREE.Points(waveGeo, mkMat(0.24, 0.6));
      scene.add(wave);

      /* ---------- POLIEDROS WIREFRAME ---------- */
      const polys = new THREE.Group();
      const nPoly = isMobile ? 2 : 4;
      for (let i = 0; i < nPoly; i++) {
        const rad = 1.1 + Math.random() * 1.6;
        const geo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(rad, 0));
        const mat = new THREE.LineBasicMaterial({
          color: i % 2 ? COLORS.cyan : COLORS.blue,
          transparent: true,
          opacity: 0.16 + Math.random() * 0.12,
        });
        const m = new THREE.LineSegments(geo, mat);
        m.position.set((Math.random() - 0.5) * 34, 2 + Math.random() * 9, -4 - Math.random() * 16);
        m.userData = {
          rx: (Math.random() - 0.5) * 0.004,
          ry: (Math.random() - 0.5) * 0.006,
          ph: Math.random() * Math.PI * 2,
          y0: m.position.y,
        };
        polys.add(m);
      }
      scene.add(polys);

      /* ---------- POLVO ESTELAR ---------- */
      {
        const n = isMobile ? 500 : 1300;
        const p = new Float32Array(n * 3);
        const cl = new Float32Array(n * 3);
        const cc = new THREE.Color();
        for (let i = 0; i < n; i++) {
          const r = 46 + Math.random() * 60;
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          p[i * 3] = r * Math.sin(ph) * Math.cos(th);
          p[i * 3 + 1] = r * Math.cos(ph) * 0.6 + 4;
          p[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
          cc.setHSL(0.58 + Math.random() * 0.08, 0.5, 0.65 + Math.random() * 0.3);
          cl[i * 3] = cc.r;
          cl[i * 3 + 1] = cc.g;
          cl[i * 3 + 2] = cc.b;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3));
        scene.add(new THREE.Points(geo, mkMat(0.5, 0.55)));
      }

      /* ---------- ONDAS DE CHOQUE (pulsos) ---------- */
      const rings: {
        m: import("three").Mesh<
          import("three").RingGeometry,
          import("three").MeshBasicMaterial
        >;
        life: number;
      }[] = [];
      function pulse() {
        if (rings.filter((r) => r.life < 1).length > 3) return;
        const m = new THREE.Mesh(
          new THREE.RingGeometry(0.9, 1.02, 72),
          new THREE.MeshBasicMaterial({
            color: COLORS.cyan,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        m.rotation.x = -Math.PI / 2.25;
        m.position.set(0, 2.4, -6);
        rings.push({ m, life: 0 });
        scene.add(m);
        galB.material.opacity = 1;
      }

      /* ---------- interacción ---------- */
      let mx = 0;
      let my = 0;
      let sx = 0;
      let sy = 0;
      const onPointer = (e: PointerEvent) => {
        mx = (e.clientX / window.innerWidth - 0.5) * 2;
        my = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      /* ---------- bucle ---------- */
      /* reloj manual (THREE.Clock está deprecado en r187) */
      let clockLast = performance.now();
      let clockElapsed = 0;
      const clockDelta = () => {
        const now = performance.now();
        const dt = Math.min((now - clockLast) / 1000, 0.05);
        clockLast = now;
        clockElapsed += dt;
        return dt;
      };
      let raf = 0;
      let running = false;
      function frame() {
        raf = requestAnimationFrame(frame);
        const dt = clockDelta();
        const t = clockElapsed;

        galaxy.rotation.y += dt * 0.02;
        galA.rotation.y = Math.sin(t * 0.05) * 0.03;

        /* marea */
        const posA = waveGeo.attributes.position.array as Float32Array;
        const colA = waveGeo.attributes.color.array as Float32Array;
        for (let r = 0; r < ROWS; r++) {
          for (let cc = 0; cc < COLS; cc++) {
            const i = (r * COLS + cc) * 3;
            const px = posA[i];
            const pz = posA[i + 2];
            const y =
              Math.sin(px * 0.27 + t * 0.9) * Math.cos(pz * 0.3 + t * 0.65) * 1.45 +
              Math.sin((px + pz) * 0.15 + t * 0.42) * 0.85;
            posA[i + 1] = y - 4.2;
            const h = Math.max(0, Math.min(1, (y + 2.3) / 4.4));
            wTmp.copy(wDeep).lerp(wCy, h * h);
            colA[i] = wTmp.r;
            colA[i + 1] = wTmp.g;
            colA[i + 2] = wTmp.b;
          }
        }
        waveGeo.attributes.position.needsUpdate = true;
        waveGeo.attributes.color.needsUpdate = true;

        polys.children.forEach((p) => {
          const ud = p.userData as { rx: number; ry: number; ph: number; y0: number };
          p.rotation.x += ud.rx;
          p.rotation.y += ud.ry;
          p.position.y = ud.y0 + Math.sin(t * 0.35 + ud.ph) * 0.7;
        });

        for (let i = rings.length - 1; i >= 0; i--) {
          const rg = rings[i];
          rg.life += dt * 0.85;
          const l = rg.life;
          if (l >= 1) {
            scene.remove(rg.m);
            rg.m.geometry.dispose();
            rg.m.material.dispose();
            rings.splice(i, 1);
            continue;
          }
          const s = 0.4 + l * 22;
          rg.m.scale.set(s, s, 1);
          rg.m.material.opacity = 0.9 * (1 - l) * (1 - l);
        }
        galB.material.opacity += (0.95 - galB.material.opacity) * dt * 1.2;

        /* cámara: paralaje + balanceo + scroll */
        sx += (mx * 1.7 - sx) * 0.03;
        sy += (my * 0.9 - sy) * 0.03;
        const scroll = Math.min((window.scrollY || 0) * 0.0022, 3.4);
        camera.position.x = sx + Math.sin(t * 0.07) * 1.3;
        camera.position.y = 6.2 - sy - scroll;
        camera.position.z = 30 - Math.sin(t * 0.045) * 1.2;
        camera.lookAt(0, 1.6 - scroll * 0.5, -8);

        renderer.render(scene, camera);
      }
      function start() {
        if (!running) {
          running = true;
          clockLast = performance.now();
          frame();
        }
      }
      function stop() {
        running = false;
        cancelAnimationFrame(raf);
      }

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      const onVis = () => (document.hidden ? stop() : start());
      const onPulseEvt = () => pulse();
      window.addEventListener("resize", onResize);
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("axc:pulse", onPulseEvt);

      if (reduced) {
        frame();
        stop();
      } else start();

      cleanup = () => {
        stop();
        window.removeEventListener("resize", onResize);
        window.removeEventListener("pointermove", onPointer);
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("axc:pulse", onPulseEvt);
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <>
      <div className="bg-aurora" aria-hidden="true" />
      <canvas id="bg3d" ref={canvasRef} aria-hidden="true" />
      <div className="bg-vignette" aria-hidden="true" />
    </>
  );
}
