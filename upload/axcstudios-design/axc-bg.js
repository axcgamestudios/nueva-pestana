/* axc-bg.js — FONDO 3D ÉPICO de axcStudios (Three.js r128)
   Galaxia espiral + marea de partículas + poliedros wireframe + ondas de choque
   con parallax de ratón, reacción al scroll y pulsos al iniciar sesión.
   Fallback elegante: si THREE no carga, queda el fondo aurora CSS. */
window.AXC_BG = (function () {
  'use strict';
  const COLORS = { bg: 0x06070d, blue: 0x2e7cf6, cyan: 0x38e8ff, violet: 0x8b5cf6, ice: 0x9ecbff };

  function softDisc() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); return t;
  }
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

  function init(canvas, opts) {
    if (!window.THREE || !canvas) return null;
    opts = opts || {};
    const isMobile = matchMedia('(max-width: 768px)').matches;
    const lite = !!opts.lite;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isMobile, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 2));
    renderer.setSize(innerWidth, innerHeight);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(COLORS.bg, 0.026);
    const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 260);
    camera.position.set(0, 6.2, 30);

    const tex = softDisc();
    const mkMat = (size, opacity) => new THREE.PointsMaterial({
      size, map: tex, transparent: true, opacity, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });

    /* ---------- GALAXIA ESPIRAL (2 capas) ---------- */
    function makeGalaxy(count, size, opacity) {
      const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
      const cCore = new THREE.Color(COLORS.ice), cMid = new THREE.Color(COLORS.blue),
        cEdge = new THREE.Color(COLORS.violet), cCy = new THREE.Color(COLORS.cyan), tmp = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const r = Math.pow(Math.random(), 2) * 16 + 0.4;
        const arm = i % 3;
        const a = arm * Math.PI * 2 / 3 + r * 0.34 + gauss() * 0.22;
        pos[i * 3] = Math.cos(a) * r + gauss() * 0.4;
        pos[i * 3 + 1] = gauss() * (1.15 - r / 18) * 1.6 + 2.2;
        pos[i * 3 + 2] = Math.sin(a) * r + gauss() * 0.4 - 6;
        const t = Math.min(r / 16, 1);
        if (t < 0.5) tmp.copy(cCore).lerp(cMid, t * 2); else tmp.copy(cMid).lerp(cEdge, (t - 0.5) * 2);
        if (Math.random() < 0.12) tmp.lerp(cCy, 0.7);
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return new THREE.Points(g, mkMat(size, opacity));
    }
    const galaxy = new THREE.Group();
    const N = lite ? 4200 : (isMobile ? 3800 : 9000);
    const galA = makeGalaxy(Math.floor(N * 0.7), 0.30, 0.75);
    const galB = makeGalaxy(Math.ceil(N * 0.3), 0.62, 0.95);
    galaxy.add(galA, galB);
    scene.add(galaxy);

    /* ---------- MAREA DE PARTÍCULAS (onda viva) ---------- */
    const COLS = lite ? 88 : (isMobile ? 60 : 150), ROWS = lite ? 38 : (isMobile ? 30 : 62);
    const W = 62, D = 34;
    const waveCount = COLS * ROWS;
    const wpos = new Float32Array(waveCount * 3), wcol = new Float32Array(waveCount * 3);
    const wDeep = new THREE.Color(0x0a2b6b), wCy = new THREE.Color(COLORS.cyan), wTmp = new THREE.Color();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = (r * COLS + c) * 3;
      wpos[i] = (c / (COLS - 1) - 0.5) * W;
      wpos[i + 2] = (r / (ROWS - 1) - 0.5) * D + 8;
    }
    const waveGeo = new THREE.BufferGeometry();
    waveGeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    waveGeo.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
    const wave = new THREE.Points(waveGeo, mkMat(0.24, 0.6));
    scene.add(wave);

    /* ---------- POLIEDROS WIREFRAME ---------- */
    const polys = new THREE.Group();
    const nPoly = lite ? 2 : (isMobile ? 2 : 4);
    for (let i = 0; i < nPoly; i++) {
      const rad = 1.1 + Math.random() * 1.6;
      const geo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(rad, 0));
      const mat = new THREE.LineBasicMaterial({
        color: i % 2 ? COLORS.cyan : COLORS.blue,
        transparent: true, opacity: 0.16 + Math.random() * 0.12
      });
      const m = new THREE.LineSegments(geo, mat);
      m.position.set((Math.random() - 0.5) * 34, 2 + Math.random() * 9, -4 - Math.random() * 16);
      m.userData = { rx: (Math.random() - .5) * .004, ry: (Math.random() - .5) * .006, ph: Math.random() * Math.PI * 2, y0: m.position.y };
      polys.add(m);
    }
    scene.add(polys);

    /* ---------- POLVO ESTELAR ---------- */
    (function stars() {
      const n = isMobile ? 500 : 1300;
      const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
      const cc = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const r = 46 + Math.random() * 60, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        p[i * 3] = r * Math.sin(ph) * Math.cos(th);
        p[i * 3 + 1] = r * Math.cos(ph) * 0.6 + 4;
        p[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        cc.setHSL(0.58 + Math.random() * 0.08, 0.5, 0.65 + Math.random() * 0.3);
        c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      scene.add(new THREE.Points(g, mkMat(0.5, 0.55)));
    })();

    /* ---------- ONDAS DE CHOQUE (pulsos) ---------- */
    const rings = [];
    function pulse() {
      if (rings.filter(r => r.life < 1).length > 3) return;
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.02, 72),
        new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2.25;
      m.position.set(0, 2.4, -6);
      m.userData = { life: 0 };
      scene.add(m); rings.push(m);
      galB.material.opacity = 1;
    }

    /* ---------- interacción ---------- */
    let mx = 0, my = 0, sx = 0, sy = 0;
    addEventListener('pointermove', e => {
      mx = (e.clientX / innerWidth - 0.5) * 2;
      my = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });

    /* ---------- bucle ---------- */
    const clock = new THREE.Clock();
    let raf = 0, running = false;
    function frame() {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

      galaxy.rotation.y += dt * 0.02;
      galA.rotation.y = Math.sin(t * 0.05) * 0.03;

      /* marea */
      const posA = waveGeo.attributes.position.array, colA = waveGeo.attributes.color.array;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const i = (r * COLS + c) * 3;
        const x = posA[i], z = posA[i + 2];
        const y = Math.sin(x * 0.27 + t * 0.9) * Math.cos(z * 0.3 + t * 0.65) * 1.45
          + Math.sin((x + z) * 0.15 + t * 0.42) * 0.85;
        posA[i + 1] = y - 4.2;
        const h = Math.max(0, Math.min(1, (y + 2.3) / 4.4));
        wTmp.copy(wDeep).lerp(wCy, h * h);
        colA[i] = wTmp.r; colA[i + 1] = wTmp.g; colA[i + 2] = wTmp.b;
      }
      waveGeo.attributes.position.needsUpdate = true;
      waveGeo.attributes.color.needsUpdate = true;

      polys.children.forEach(p => {
        p.rotation.x += p.userData.rx; p.rotation.y += p.userData.ry;
        p.position.y = p.userData.y0 + Math.sin(t * 0.35 + p.userData.ph) * 0.7;
      });

      for (let i = rings.length - 1; i >= 0; i--) {
        const m = rings[i]; m.userData.life += dt * 0.85;
        const l = m.userData.life;
        if (l >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); rings.splice(i, 1); continue; }
        const s = 0.4 + l * 22; m.scale.set(s, s, 1);
        m.material.opacity = 0.9 * (1 - l) * (1 - l);
      }
      galB.material.opacity += (0.95 - galB.material.opacity) * dt * 1.2;

      /* cámara: paralaje + balanceo + scroll */
      sx += (mx * 1.7 - sx) * 0.03;
      sy += (my * 0.9 - sy) * 0.03;
      const scroll = Math.min((scrollY || 0) * 0.0022, 3.4);
      camera.position.x = sx + Math.sin(t * 0.07) * 1.3;
      camera.position.y = 6.2 - sy - scroll;
      camera.position.z = 30 - Math.sin(t * 0.045) * 1.2;
      camera.lookAt(0, 1.6 - scroll * 0.5, -8);

      renderer.render(scene, camera);
    }
    function start() { if (!running) { running = true; clock.getDelta(); frame(); } }
    function stop() { running = false; cancelAnimationFrame(raf); }

    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
    addEventListener('axc:pulse', pulse);
    addEventListener('online', () => { }); /* la red de cuentas ya se gestiona en axc-auth */

    if (reduced) { /* un solo fotograma estático para accesibilidad */
      frame(); stop();
    } else start();

    return { pulse, renderer, scene, camera };
  }

  return { init, pulse: () => dispatchEvent(new CustomEvent('axc:pulse')) };
})();
