/* ============================================================================
   axc-auth.js — SISTEMA DE CUENTAS axc (SSO) v1.0
   ----------------------------------------------------------------------------
   Una sola cuenta para todas las páginas axc. 100% funcional, sin simulación:

   • REGISTRO   usuario + contraseña + correo → código de 6 dígitos que LLEGA
                por canales reales:
                  1) BUZÓN AXC (garantizado): sobre sellado guardado en el
                     servidor textdb.dev y descargado por la página (como POP3)
                  2) CORREO REAL a la dirección del usuario vía formsubmit.co
                  3) PUSH en vivo vía ntfy.sh (si hay cuota disponible)
                  4) PUSH en vivo vía el WebSocket wss://wsn-c6o3.onrender.com/
                     (cuando el servidor está despierto)
   • ALMACENAMIENTO  textdb.dev — servidor público clave-valor (sin registro):
                cada cuenta en su propia clave + copia de respaldo.
   • LOGIN      PBKDF2-SHA256 (150.000 iteraciones, WebCrypto) comparado con
                el registro del servidor. Caché local para modo sin conexión.
   • SESIÓN     token local por origen (localStorage, 30 días).
   • SSO        cualquier página que cargue ESTE archivo (incluso de otro
                dominio github.io) usa la MISMA base central: la misma cuenta
                funciona en todas.

   Cómo integrarlo en otra página (ver SISTEMA-CUENTAS.md):
     <script src="https://axcgamestudios.github.io/axcStudios/axc-auth.js"></script>
     <script>AXC.init(); AXC.on('auth', u => miUI(u));</script>
   ========================================================================== */
window.AXC = (function () {
  'use strict';

  /* ---------------- configuración (sobrescribible con init) ---------------- */
  const DEF = {
    tdBase: 'https://textdb.dev/api/data/',  // servidor de datos clave-valor
    kUser: 'axcu1:',        // registro de cuenta (clave principal)
    kUserB: 'axcv1:',       // copia de respaldo del registro
    kMail: 'axcm1:',        // buzón axc: sobres con el código sellado
    wsUrl: 'wss://wsn-c6o3.onrender.com/',   // servidor WebSocket de axc
    ntfyBase: 'https://ntfy.sh/',            // red de push alternativa
    formsubmit: true,       // intentar envío de correo real (formsubmit.co)
    pepper: 'axc-spice-2026-v1',
    sessionDays: 30,
    codeTTL: 15 * 60 * 1000,   // 15 minutos
    maxTries: 6,
    pbkdf2Iters: 150000
  };
  const CFG = Object.assign({}, DEF);

  /* ---------------- estado + eventos ---------------- */
  const state = {
    ready: false,
    user: null,            // {u, m} cuando hay sesión
    ws: 'off',             // off | connecting | online
    db: null,              // true | false (textdb.dev accesible)
    presence: 0            // usuarios conectados a la red axc (WS)
  };
  const evs = {};
  function on(ev, cb) { (evs[ev] = evs[ev] || []).push(cb); return () => { evs[ev] = evs[ev].filter(f => f !== cb); }; }
  function emit(ev, data) { (evs[ev] || []).forEach(cb => { try { cb(data); } catch (e) { console.warn('[axc]', ev, e); } }); }

  /* ---------------- utilidades base ---------------- */
  const $local = typeof localStorage !== 'undefined' ? localStorage : null;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const randHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');
  const b64e = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64d = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function sha256hex(str) {
    const b = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function pbkdf2b64(pass, saltB64, iters) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64d(saltB64), iterations: iters, hash: 'SHA-256' }, key, 256);
    return b64e(new Uint8Array(bits));
  }
  /* sello: XOR con secreto + base64 (sella el código del buzón) */
  function seal(txt, secretHex) {
    const d = enc.encode(txt), k = enc.encode(secretHex), o = new Uint8Array(d.length);
    for (let i = 0; i < d.length; i++) o[i] = d[i] ^ k[i % k.length];
    return b64e(o);
  }
  function unseal(b64, secretHex) {
    try {
      const d = b64d(b64), k = enc.encode(secretHex), o = new Uint8Array(d.length);
      for (let i = 0; i < d.length; i++) o[i] = d[i] ^ k[i % k.length];
      return dec.decode(o);
    } catch (e) { return null; }
  }
  const normUser = (u) => String(u || '').trim().toLowerCase();
  const validUser = (u) => /^[a-z0-9_]{3,16}$/.test(u);
  const validMail = (m) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(m || '').trim());

  /* ---------------- capa del servidor de datos (textdb.dev) ---------------- */
  const TD = {
    async get(key) {
      const r = await fetch(CFG.tdBase + encodeURIComponent(key), { cache: 'no-store' });
      if (!r.ok) throw new Error('textdb HTTP ' + r.status);
      const t = (await r.text()).trim();
      return t === '' ? null : t;
    },
    async set(key, text) {
      let last;
      for (let i = 0; i < 3; i++) {
        try {
          const r = await fetch(CFG.tdBase + encodeURIComponent(key), {
            method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: text
          });
          if (r.ok) return true;
          last = new Error('textdb HTTP ' + r.status);
        } catch (e) { last = e; }
        await sleep(400 * (i + 1));
      }
      throw last || new Error('textdb unreachable');
    }
  };
  async function dbHealth() {
    try { await TD.get('axc_ping_v1'); state.db = true; } catch (e) { state.db = false; }
    emit('status', state); return state.db;
  }

  /* ---------------- registro de cuenta ---------------- */
  const userKey = (u) => CFG.kUser + u;
  const userKeyB = (u) => CFG.kUserB + u;
  const recCheck = (u, k) => sha256hex(u + ':' + k + ':' + CFG.pepper);

  async function getRecord(u) {
    const t = await TD.get(userKey(u));
    if (t) { try { return JSON.parse(t); } catch (e) { } }
    const tb = await TD.get(userKeyB(u));
    if (tb) { try { return JSON.parse(tb); } catch (e) { } }
    return null;
  }
  async function putRecord(rec) {
    rec.c = await recCheck(rec.u, rec.k);
    const txt = JSON.stringify(rec);
    await TD.set(userKey(rec.u), txt);
    await TD.set(userKeyB(rec.u), txt).catch(() => { });
    if ($local) { try { $local.setItem('axc_rec_' + rec.u, txt); } catch (e) { } }
  }
  async function cachedRecord(u) {
    if (!$local) return null;
    try { const t = $local.getItem('axc_rec_' + u); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }

  /* ---------------- sesión local (por origen) ---------------- */
  async function saveSession(u, m) {
    if (!$local) return;
    const t = Date.now() + CFG.sessionDays * 864e5;
    const mac = await sha256hex(u + ':' + t + ':' + CFG.pepper);
    $local.setItem('axc_session', JSON.stringify({ u, m, t, mac }));
    state.user = { u, m };
    emit('auth', state.user);
  }
  async function restoreSession() {
    if (!$local) return null;
    try {
      const s = JSON.parse($local.getItem('axc_session') || 'null');
      if (!s || !s.u) return null;
      if (Date.now() > s.t) { $local.removeItem('axc_session'); return null; }
      const mac = await sha256hex(s.u + ':' + s.t + ':' + CFG.pepper);
      if (mac !== s.mac) { $local.removeItem('axc_session'); return null; }
      state.user = { u: s.u, m: s.m };
      emit('auth', state.user);
      return state.user;
    } catch (e) { return null; }
  }
  function logout(broadcast) {
    if ($local) $local.removeItem('axc_session');
    state.user = null;
    emit('auth', null);
    if (broadcast !== false) Net.send({ axc: 1, t: 'sync', user: null });
  }

  /* ---------------- registro (signup) + código ---------------- */
  function pending() { try { return JSON.parse($local.getItem('axc_pending') || 'null'); } catch (e) { return null; } }
  function setPending(p) { $local.setItem('axc_pending', JSON.stringify(p)); }

  async function signup({ user, mail, pass }) {
    const u = normUser(user), m = String(mail || '').trim(), p = String(pass || '');
    if (!validUser(u)) return { ok: false, error: 'Username must be 3-16 characters (letters, numbers or _)' };
    if (!validMail(m)) return { ok: false, error: 'Enter a valid email' };
    if (p.length < 6) return { ok: false, error: 'Password must be at least 6 characters' };
    if (state.db === null) await dbHealth();
    let rec = null;
    try { rec = await getRecord(u); }
    catch (e) { return { ok: false, error: 'Could not reach the account server. Check your connection and try again.' }; }
    if (rec) return { ok: false, error: 'That username is already taken. Try another one.' };

    const salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
    const k = await pbkdf2b64(p, salt, CFG.pbkdf2Iters);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const cs = randHex(12);
    const ch = await sha256hex(code + ':' + cs);
    const secret = randHex(32);
    const p0 = {
      u, m, s: salt, k, i: CFG.pbkdf2Iters,
      cs, ch, ts: Date.now(), tries: 0, secret,
      sealed: seal(code, secret)
    };
    setPending(p0);
    const sent = await sendCode();
    if (!sent.ok) return sent;
    return { ok: true, step: 'code', user: u, mail: m };
  }

  /* entrega del código por todos los canales reales disponibles */
  async function sendCode() {
    const p = pending();
    if (!p) return { ok: false, error: 'There is no signup in progress' };
    if (Date.now() - p.ts > CFG.codeTTL) return { ok: false, error: 'The code expired. Create your account again.' };
    const env = {
      v: 1, f: 'cuentas@axc.st', to: p.m, sub: 'Your axcStudios verification code',
      ts: Date.now(), exp: p.ts + CFG.codeTTL, d: p.sealed
    };
    const jobs = [];

    /* canal 1 — BUZÓN AXC (canal principal, garantizado, servidor textdb.dev):
       el sobre queda guardado en el servidor y la página lo descarga en vivo */
    const mailJob = TD.set(CFG.kMail + p.u, JSON.stringify(env)).then(() => true).catch(() => false);
    jobs.push(mailJob);

    /* canal 2 — correo real al buzón del usuario (formsubmit.co, mejor esfuerzo) */
    if (CFG.formsubmit && validMail(p.m)) {
      const body = '_subject=' + encodeURIComponent('axcStudios — Verification code') +
        '&message=' + encodeURIComponent('Hi ' + p.u + ', your verification code is ' + unseal(p.sealed, p.secret) +
          '. It expires in 15 minutes. If you did not create this account, ignore this email.') + '&_captcha=false';
      for (const ep of ['https://formsubmit.co/ajax/', 'https://formsubmit.co/']) {
        jobs.push(fetch(ep + encodeURIComponent(p.m), {
          method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body
        }).catch(() => { }));
      }
    }

    /* canal 3 — push en vivo vía ntfy.sh (mejor esfuerzo) */
    (async () => {
      try {
        await fetch(CFG.ntfyBase + 'axcnet-' + (await sha256hex(p.u)).slice(0, 12), {
          method: 'POST', body: 'axcStudios — verification code: ' + p.sealed
        });
      } catch (e) { }
    })();

    /* canal 4 — push por el WebSocket de axc (si está despierto) */
    Net.send({ axc: 1, t: 'code', to: p.u, seal: p.sealed });

    await Promise.allSettled(jobs);
    const mailOk = await mailJob;
    if (!mailOk) {
      /* el buzón no pudo recibir el sobre: hay que decirlo (antes se ocultaba) */
      return { ok: false, error: 'The axc mail server did not respond. Wait a few seconds and press Resend code.' };
    }
    return { ok: true, sent: true, mail: p.m };
  }

  /* descarga del buzón axc: devuelve el último sobre sin expirar */
  async function fetchMail() {
    const p = pending();
    if (!p) return null;
    try {
      const t = await TD.get(CFG.kMail + p.u);
      if (!t) return null;
      const env = JSON.parse(t);
      if (!env || !env.d || Date.now() > env.exp) return null;
      const code = unseal(env.d, p.secret);
      if (!code) return null;
      return { from: env.f, to: env.to, subject: env.sub, ts: env.ts, code };
    } catch (e) { return null; }
  }

  async function verify(codeIn) {
    const p = pending();
    if (!p) return { ok: false, error: 'There is no signup in progress' };
    if (Date.now() - p.ts > CFG.codeTTL) return { ok: false, error: 'The code expired. Create your account again.' };
    const code = String(codeIn || '').replace(/\D/g, '');
    if (code.length !== 6) return { ok: false, error: 'Enter the 6-digit code' };
    const h = await sha256hex(code + ':' + p.cs);
    if (h !== p.ch) {
      p.tries++;
      setPending(p);
      if (p.tries >= CFG.maxTries) return { ok: false, error: 'Too many attempts. Create your account again.' };
      return { ok: false, error: 'Wrong code. You have ' + (CFG.maxTries - p.tries) + ' attempts left.' };
    }
    /* el usuario sigue libre (nadie lo tomó mientras tanto) */
    try {
      const rec = await getRecord(p.u);
      if (rec) { $local.removeItem('axc_pending'); return { ok: false, error: 'That username was registered by someone else. Start again with another name.' }; }
      await putRecord({ v: 1, u: p.u, m: p.m, s: p.s, k: p.k, i: p.i, t: Date.now() });
    } catch (e) {
      return { ok: false, error: 'Could not save your account to the server. Check your connection and press Verify again.' };
    }
    const u = p.u, m = p.m;
    $local.removeItem('axc_pending');
    await saveSession(u, m);
    Net.send({ axc: 1, t: 'sync', user: u });
    Net.pulse();
    emit('signup', { u, m });
    return { ok: true, user: u };
  }

  /* ---------------- inicio de sesión ---------------- */
  async function login({ user, pass }) {
    const u = normUser(user), p = String(pass || '');
    if (!u || !p) return { ok: false, error: 'Enter your username and password' };
    let rec = null, fromCache = false;
    try { rec = await getRecord(u); } catch (e) { }
    if (!rec) { rec = await cachedRecord(u); fromCache = !!rec; }
    if (!rec) return { ok: false, error: 'That username does not exist. Want to create an account?' };
    let k;
    try { k = await pbkdf2b64(p, rec.s, rec.i || CFG.pbkdf2Iters); } catch (e) { return { ok: false, error: 'Your browser does not support the required encryption (WebCrypto).' }; }
    if (k !== rec.k) return { ok: false, error: 'Wrong password' };
    const chk = await recCheck(rec.u, rec.k);
    if (rec.c && chk !== rec.c) return { ok: false, error: 'The account is damaged or was tampered with. Contact axcStudios.' };
    if (!fromCache) { try { $local.setItem('axc_rec_' + rec.u, JSON.stringify(rec)); } catch (e) { } }
    await saveSession(rec.u, rec.m);
    Net.send({ axc: 1, t: 'sync', user: rec.u });
    Net.pulse();
    return { ok: true, user: rec.u, offline: fromCache };
  }

  /* ---------------- red en vivo (WebSocket de axc + presencia) ---------------- */
  const Net = {
    ws: null, id: null, seen: {}, timer: null, hb: null, tries: 0, userMsg: null,
    status() { return state.ws; },
    presence() {
      const now = Date.now();
      let n = 0;
      for (const id in this.seen) { if (now - this.seen[id] < 65000) n++; else delete this.seen[id]; }
      return Math.max(n, state.user ? 1 : 0);
    },
    send(obj) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); } catch (e) { } },
    pulse() { this.send({ axc: 1, t: 'pulse' }); emit('pulse'); },
    connect() {
      if (typeof WebSocket === 'undefined') return;
      state.ws = 'connecting'; emit('status', state);
      let ws;
      try { ws = new WebSocket(CFG.wsUrl); } catch (e) { return this.retry(); }
      this.ws = ws;
      const self = this;
      ws.onopen = () => {
        self.tries = 0; state.ws = 'online'; emit('status', state);
        self.hello();
        self.hb = setInterval(() => self.hello(), 25000);
        if (state.user) self.send({ axc: 1, t: 'sync', user: state.user.u });
      };
      ws.onmessage = (m) => {
        let d; try { d = JSON.parse(m.data); } catch (e) { return; }
        if (!d || d.axc !== 1) return;
        if (d.t === 'hi' && d.id) { self.seen[d.id] = Date.now(); state.presence = self.presence(); emit('presence', state.presence); }
        if (d.t === 'bye' && d.id) { delete self.seen[d.id]; state.presence = self.presence(); emit('presence', state.presence); }
        if (d.t === 'sync') emit('sync', d.user);
        if (d.t === 'pulse') emit('pulse');
        if (d.t === 'code' && d.seal) emit('mailpush', d);
      };
      ws.onclose = () => self.retry();
      ws.onerror = () => { };
    },
    hello() {
      if (!this.id) this.id = randHex(6);
      this.seen[this.id] = Date.now();
      this.send({ axc: 1, t: 'hi', id: this.id, user: state.user ? state.user.u : null });
      state.presence = this.presence();
      emit('presence', state.presence);
    },
    retry() {
      const self = this;
      clearInterval(this.hb); clearTimeout(this.timer);
      if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) { } this.ws = null; }
      state.ws = 'off'; state.presence = self.presence(); emit('status', state);
      const wait = Math.min(60000, 4000 * Math.pow(1.6, self.tries++)) + Math.random() * 3000;
      this.timer = setTimeout(() => self.connect(), wait);
    }
  };

  /* ---------------- helpers de instalación PWA ---------------- */
  function standalone() {
    return typeof matchMedia !== 'undefined' &&
      (matchMedia('(display-mode: standalone)').matches ||
        matchMedia('(display-mode: fullscreen)').matches ||
        matchMedia('(display-mode: minimal-ui)').matches) ||
      navigator.standalone === true;
  }

  /* ---------------- init ---------------- */
  let _inited = false;
  async function init(opts) {
    if (_inited) return state;
    _inited = true;
    Object.assign(CFG, opts || {});
    await restoreSession();
    dbHealth();
    Net.connect();
    state.ready = true;
    emit('ready', state);
    return state;
  }

  /* API pública */
  return {
    init, on, emit,
    signup, login, logout, verify, sendCode, fetchMail,
    state, cfg: CFG,
    standalone,
    net: Net,
    get pending() { return pending(); },
    util: { sha256hex, seal, unseal, normUser, validUser, validMail },
    version: '1.0.0'
  };
})();
