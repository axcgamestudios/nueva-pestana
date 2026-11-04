"use client";

/**
 * SISTEMA DE CUENTAS axc (SSO) — port fiel de axc-auth.js v1.0 de
 * axcStudios (https://axcgamestudios.github.io/axcStudios/).
 *
 * EL TOKEN ES EL MISMO: se conservan sin cambios las claves del servidor
 * (textdb.dev), el pepper y el WebSocket, de modo que las cuentas creadas
 * en axcStudios funcionan aquí (y viceversa): una sola cuenta para todo
 * el universo axc.
 *
 *  • REGISTRO   usuario + contraseña + correo → código de 6 dígitos que
 *               llega por canales reales:
 *                 1) BUZÓN AXC (garantizado): sobre sellado guardado en
 *                    textdb.dev y descargado por la página (como POP3)
 *                 2) CORREO REAL vía formsubmit.co
 *                 3) PUSH en vivo vía ntfy.sh
 *                 4) PUSH en vivo vía el WebSocket wss://wsn-c6o3.onrender.com/
 *  • ALMACENAMIENTO  textdb.dev — servidor público clave-valor
 *  • LOGIN      PBKDF2-SHA256 (150.000 iteraciones, WebCrypto)
 *  • SESIÓN     token local por origen (localStorage, 30 días)
 */

/* ---------------- configuración (idéntica a axcStudios) ---------------- */
const CFG = {
  tdBase: "https://textdb.dev/api/data/", // servidor de datos clave-valor
  kUser: "axcu1:", // registro de cuenta (clave principal)
  kUserB: "axcv1:", // copia de respaldo del registro
  kMail: "axcm1:", // buzón axc: sobres con el código sellado
  wsUrl: "wss://wsn-c6o3.onrender.com/", // servidor WebSocket de axc
  ntfyBase: "https://ntfy.sh/", // red de push alternativa
  formsubmit: true, // intentar envío de correo real (formsubmit.co)
  pepper: "axc-spice-2026-v1",
  sessionDays: 30,
  codeTTL: 15 * 60 * 1000, // 15 minutos
  maxTries: 6,
  pbkdf2Iters: 150000,
} as const;

/* ---------------- tipos ---------------- */
export interface AxcUser {
  u: string;
  m: string;
}

export interface AxcState {
  ready: boolean;
  user: AxcUser | null;
  ws: "off" | "connecting" | "online";
  db: boolean | null;
  presence: number;
}

export interface AxcMail {
  from: string;
  to: string;
  subject: string;
  ts: number;
  code: string;
}

export type AxcResult<T = undefined> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

interface PendingSignup {
  u: string;
  m: string;
  s: string;
  k: string;
  i: number;
  cs: string;
  ch: string;
  ts: number;
  tries: number;
  secret: string;
  sealed: string;
}

interface AccountRecord {
  v: number;
  u: string;
  m: string;
  s: string;
  k: string;
  i: number;
  t: number;
  c?: string;
}

/* ---------------- estado + eventos ---------------- */
const state: AxcState = {
  ready: false,
  user: null,
  ws: "off",
  db: null,
  presence: 0,
};

type EvName = "auth" | "status" | "presence" | "ready" | "pulse" | "mailpush" | "sync";
const evs: Partial<Record<EvName, Array<(data: unknown) => void>>> = {};

/** Suscribe un callback; devuelve la función para desuscribirse. */
export function onAxc(ev: EvName, cb: (data: unknown) => void): () => void {
  const list = (evs[ev] = evs[ev] ?? []);
  list.push(cb);
  return () => {
    const i = list.indexOf(cb);
    if (i >= 0) list.splice(i, 1);
  };
}
function emit(ev: EvName, data?: unknown) {
  (evs[ev] ?? []).forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.warn("[axc]", ev, e);
    }
  });
  notifyListeners();
}

/* ---------------- snapshot para useSyncExternalStore ---------------- */
let snapshot: AxcState = { ...state };
const listeners = new Set<() => void>();
function notifyListeners() {
  snapshot = { ...state };
  listeners.forEach((l) => l());
}
function subscribeAxc(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getAxcSnapshot(): AxcState {
  return snapshot;
}
export { getAxcSnapshot, subscribeAxc };

/* ---------------- utilidades base ---------------- */
const enc = new TextEncoder();
const dec = new TextDecoder();
const randHex = (n: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const b64e = (u8: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  }
  return btoa(s);
};
const b64d = (s: string): Uint8Array => {
  const b = atob(s);
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function sha256hex(str: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function pbkdf2b64(pass: string, saltB64: string, iters: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new Uint8Array(b64d(saltB64)), iterations: iters, hash: "SHA-256" },
    key,
    256,
  );
  return b64e(new Uint8Array(bits));
}
/* sello: XOR con secreto + base64 (sella el código del buzón) */
function seal(txt: string, secretHex: string): string {
  const d = enc.encode(txt);
  const k = enc.encode(secretHex);
  const o = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) o[i] = d[i] ^ k[i % k.length];
  return b64e(o);
}
function unseal(b64: string, secretHex: string): string | null {
  try {
    const d = b64d(b64);
    const k = enc.encode(secretHex);
    const o = new Uint8Array(d.length);
    for (let i = 0; i < d.length; i++) o[i] = d[i] ^ k[i % k.length];
    return dec.decode(o);
  } catch {
    return null;
  }
}
export const normUser = (u: string): string => String(u ?? "").trim().toLowerCase();
export const validUser = (u: string): boolean => /^[a-z0-9_]{3,16}$/.test(u);
export const validMail = (m: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(m ?? "").trim());

/* ---------------- capa del servidor de datos (textdb.dev) ---------------- */
const TD = {
  async get(key: string): Promise<string | null> {
    const r = await fetch(CFG.tdBase + encodeURIComponent(key), { cache: "no-store" });
    if (!r.ok) throw new Error("textdb HTTP " + r.status);
    const t = (await r.text()).trim();
    return t === "" ? null : t;
  },
  async set(key: string, text: string): Promise<boolean> {
    let last: unknown = null;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(CFG.tdBase + encodeURIComponent(key), {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: text,
        });
        if (r.ok) return true;
        last = new Error("textdb HTTP " + r.status);
      } catch (e) {
        last = e;
      }
      await sleep(400 * (i + 1));
    }
    throw last ?? new Error("textdb unreachable");
  },
};

async function dbHealth(): Promise<boolean> {
  try {
    await TD.get("axc_ping_v1");
    state.db = true;
  } catch {
    state.db = false;
  }
  emit("status");
  return state.db;
}

/* ---------------- registro de cuenta ---------------- */
const userKey = (u: string): string => CFG.kUser + u;
const userKeyB = (u: string): string => CFG.kUserB + u;
const recCheck = (u: string, k: string): Promise<string> =>
  sha256hex(u + ":" + k + ":" + CFG.pepper);

async function getRecord(u: string): Promise<AccountRecord | null> {
  const t = await TD.get(userKey(u));
  if (t) {
    try {
      return JSON.parse(t) as AccountRecord;
    } catch {
      /* registro corrupto: probar respaldo */
    }
  }
  const tb = await TD.get(userKeyB(u));
  if (tb) {
    try {
      return JSON.parse(tb) as AccountRecord;
    } catch {
      /* respaldo corrupto */
    }
  }
  return null;
}
async function putRecord(rec: AccountRecord): Promise<void> {
  rec.c = await recCheck(rec.u, rec.k);
  const txt = JSON.stringify(rec);
  await TD.set(userKey(rec.u), txt);
  await TD.set(userKeyB(rec.u), txt).catch(() => undefined);
  try {
    localStorage.setItem("axc_rec_" + rec.u, txt);
  } catch {
    /* almacenamiento no disponible */
  }
}

/* ---------------- sesión local (por origen) ---------------- */
async function saveSession(u: string, m: string): Promise<void> {
  const t = Date.now() + CFG.sessionDays * 864e5;
  const mac = await sha256hex(u + ":" + t + ":" + CFG.pepper);
  localStorage.setItem("axc_session", JSON.stringify({ u, m, t, mac }));
  state.user = { u, m };
  emit("auth", state.user);
}
async function restoreSession(): Promise<AxcUser | null> {
  try {
    const s = JSON.parse(localStorage.getItem("axc_session") ?? "null") as
      | { u?: string; m?: string; t?: number; mac?: string }
      | null;
    if (!s?.u) return null;
    if (Date.now() > (s.t ?? 0)) {
      localStorage.removeItem("axc_session");
      return null;
    }
    const mac = await sha256hex(s.u + ":" + s.t + ":" + CFG.pepper);
    if (mac !== s.mac) {
      localStorage.removeItem("axc_session");
      return null;
    }
    state.user = { u: s.u, m: s.m ?? "" };
    emit("auth", state.user);
    return state.user;
  } catch {
    return null;
  }
}
function logout(broadcast = true): void {
  localStorage.removeItem("axc_session");
  state.user = null;
  emit("auth", null);
  if (broadcast !== false) Net.send({ axc: 1, t: "sync", user: null });
}

/* ---------------- registro (signup) + código ---------------- */
function pending(): PendingSignup | null {
  try {
    return JSON.parse(localStorage.getItem("axc_pending") ?? "null") as PendingSignup | null;
  } catch {
    return null;
  }
}
function setPending(p: PendingSignup | null): void {
  if (p) localStorage.setItem("axc_pending", JSON.stringify(p));
  else localStorage.removeItem("axc_pending");
}
export function getPendingMail(): string | null {
  return pending()?.m ?? null;
}

async function signup(input: {
  user: string;
  mail: string;
  pass: string;
}): Promise<AxcResult<{ step: "code"; user: string; mail: string }>> {
  const u = normUser(input.user);
  const m = String(input.mail ?? "").trim();
  const p = String(input.pass ?? "");
  if (!validUser(u))
    return { ok: false, error: "El usuario debe tener 3-16 caracteres (letras, números o _)" };
  if (!validMail(m)) return { ok: false, error: "Escribe un correo válido" };
  if (p.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres" };
  if (state.db === null) await dbHealth();
  let rec: AccountRecord | null = null;
  try {
    rec = await getRecord(u);
  } catch {
    return {
      ok: false,
      error: "No se pudo contactar con el servidor de cuentas. Revisa tu conexión e inténtalo de nuevo.",
    };
  }
  if (rec) return { ok: false, error: "Ese nombre de usuario ya está tomado. Prueba con otro." };

  const salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
  const k = await pbkdf2b64(p, salt, CFG.pbkdf2Iters);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const cs = randHex(12);
  const ch = await sha256hex(code + ":" + cs);
  const secret = randHex(32);
  setPending({
    u,
    m,
    s: salt,
    k,
    i: CFG.pbkdf2Iters,
    cs,
    ch,
    ts: Date.now(),
    tries: 0,
    secret,
    sealed: seal(code, secret),
  });
  const sent = await sendCode();
  if (!sent.ok) return sent;
  return { ok: true, step: "code", user: u, mail: m };
}

/* entrega del código por todos los canales reales disponibles */
async function sendCode(): Promise<AxcResult<{ sent: true; mail: string }>> {
  const p = pending();
  if (!p) return { ok: false, error: "No hay un registro en curso" };
  if (Date.now() - p.ts > CFG.codeTTL)
    return { ok: false, error: "El código expiró. Crea tu cuenta de nuevo." };
  const env = {
    v: 1,
    f: "cuentas@axc.st",
    to: p.m,
    sub: "Tu código de verificación de axcGames",
    ts: Date.now(),
    exp: p.ts + CFG.codeTTL,
    d: p.sealed,
  };
  const jobs: Promise<unknown>[] = [];

  /* canal 1 — BUZÓN AXC (principal, garantizado, textdb.dev) */
  const mailJob = TD.set(CFG.kMail + p.u, JSON.stringify(env))
    .then(() => true)
    .catch(() => false);
  jobs.push(mailJob);

  /* canal 2 — correo real al buzón del usuario (formsubmit.co) */
  if (CFG.formsubmit && validMail(p.m)) {
    const body =
      "_subject=" +
      encodeURIComponent("axcGames — Código de verificación") +
      "&message=" +
      encodeURIComponent(
        "Hola " +
          p.u +
          ", tu código de verificación es " +
          unseal(p.sealed, p.secret) +
          ". Expira en 15 minutos. Si no creaste esta cuenta, ignora este correo.",
      ) +
      "&_captcha=false";
    for (const ep of ["https://formsubmit.co/ajax/", "https://formsubmit.co/"]) {
      jobs.push(
        fetch(ep + encodeURIComponent(p.m), {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain" },
          body,
        }).catch(() => undefined),
      );
    }
  }

  /* canal 3 — push en vivo vía ntfy.sh */
  void (async () => {
    try {
      const topic = "axcnet-" + (await sha256hex(p.u)).slice(0, 12);
      await fetch(CFG.ntfyBase + topic, {
        method: "POST",
        body: "axcGames — código de verificación: " + p.sealed,
      });
    } catch {
      /* mejor esfuerzo */
    }
  })();

  /* canal 4 — push por el WebSocket de axc (si está despierto) */
  Net.send({ axc: 1, t: "code", to: p.u, seal: p.sealed });

  await Promise.allSettled(jobs);
  const mailOk = await mailJob;
  if (!mailOk) {
    return {
      ok: false,
      error: "El servidor de correo axc no respondió. Espera unos segundos y pulsa Reenviar código.",
    };
  }
  return { ok: true, sent: true, mail: p.m };
}

/* descarga del buzón axc: devuelve el último sobre sin expirar */
async function fetchMail(): Promise<AxcMail | null> {
  const p = pending();
  if (!p) return null;
  try {
    const t = await TD.get(CFG.kMail + p.u);
    if (!t) return null;
    const env = JSON.parse(t) as { d?: string; exp?: number; f?: string; to?: string; sub?: string; ts?: number };
    if (!env?.d || Date.now() > (env.exp ?? 0)) return null;
    const code = unseal(env.d, p.secret);
    if (!code) return null;
    return {
      from: env.f ?? "cuentas@axc.st",
      to: env.to ?? p.m,
      subject: env.sub ?? "",
      ts: env.ts ?? Date.now(),
      code,
    };
  } catch {
    return null;
  }
}

async function verify(codeIn: string): Promise<AxcResult<{ user: string }>> {
  const p = pending();
  if (!p) return { ok: false, error: "No hay un registro en curso" };
  if (Date.now() - p.ts > CFG.codeTTL)
    return { ok: false, error: "El código expiró. Crea tu cuenta de nuevo." };
  const code = String(codeIn ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Escribe el código de 6 dígitos" };
  const h = await sha256hex(code + ":" + p.cs);
  if (h !== p.ch) {
    p.tries++;
    setPending(p);
    if (p.tries >= CFG.maxTries)
      return { ok: false, error: "Demasiados intentos. Crea tu cuenta de nuevo." };
    return {
      ok: false,
      error: "Código incorrecto. Te quedan " + (CFG.maxTries - p.tries) + " intentos.",
    };
  }
  /* el usuario sigue libre (nadie lo tomó mientras tanto) */
  try {
    const rec = await getRecord(p.u);
    if (rec) {
      setPending(null);
      return {
        ok: false,
        error: "Alguien registró ese nombre mientras tanto. Empieza de nuevo con otro.",
      };
    }
    await putRecord({ v: 1, u: p.u, m: p.m, s: p.s, k: p.k, i: p.i, t: Date.now() });
  } catch {
    return {
      ok: false,
      error: "No se pudo guardar tu cuenta en el servidor. Revisa tu conexión y pulsa Verificar de nuevo.",
    };
  }
  const u = p.u;
  const m = p.m;
  setPending(null);
  await saveSession(u, m);
  Net.send({ axc: 1, t: "sync", user: u });
  Net.pulse();
  emit("pulse");
  return { ok: true, user: u };
}

/* ---------------- inicio de sesión ---------------- */
async function login(input: {
  user: string;
  pass: string;
}): Promise<AxcResult<{ user: string; offline?: boolean }>> {
  const u = normUser(input.user);
  const p = String(input.pass ?? "");
  if (!u || !p) return { ok: false, error: "Escribe tu usuario y contraseña" };
  let rec: AccountRecord | null = null;
  let fromCache = false;
  try {
    rec = await getRecord(u);
  } catch {
    /* sin acceso al servidor */
  }
  if (!rec) {
    try {
      const t = localStorage.getItem("axc_rec_" + u);
      rec = t ? (JSON.parse(t) as AccountRecord) : null;
      fromCache = !!rec;
    } catch {
      rec = null;
    }
  }
  if (!rec)
    return { ok: false, error: "Ese usuario no existe. ¿Quieres crear una cuenta?" };
  let k: string;
  try {
    k = await pbkdf2b64(p, rec.s, rec.i || CFG.pbkdf2Iters);
  } catch {
    return {
      ok: false,
      error: "Tu navegador no soporta el cifrado necesario (WebCrypto).",
    };
  }
  if (k !== rec.k) return { ok: false, error: "Contraseña incorrecta" };
  const chk = await recCheck(rec.u, rec.k);
  if (rec.c && chk !== rec.c)
    return {
      ok: false,
      error: "La cuenta está dañada o fue manipulada. Contacta con axcStudios.",
    };
  if (!fromCache) {
    try {
      localStorage.setItem("axc_rec_" + rec.u, JSON.stringify(rec));
    } catch {
      /* caché no disponible */
    }
  }
  await saveSession(rec.u, rec.m);
  Net.send({ axc: 1, t: "sync", user: rec.u });
  Net.pulse();
  emit("pulse");
  return { ok: true, user: rec.u, offline: fromCache };
}

/* ---------------- red en vivo (WebSocket de axc + presencia) ---------------- */
const Net = {
  ws: null as WebSocket | null,
  id: null as string | null,
  seen: {} as Record<string, number>,
  timer: null as ReturnType<typeof setTimeout> | null,
  hb: null as ReturnType<typeof setInterval> | null,
  tries: 0,
  send(obj: Record<string, unknown>): void {
    try {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    } catch {
      /* sin conexión */
    }
  },
  pulse(): void {
    this.send({ axc: 1, t: "pulse" });
    emit("pulse");
  },
  presence(): number {
    const now = Date.now();
    let n = 0;
    for (const id in this.seen) {
      if (now - this.seen[id] < 65000) n++;
      else delete this.seen[id];
    }
    return Math.max(n, state.user ? 1 : 0);
  },
  connect(): void {
    if (typeof WebSocket === "undefined") return;
    state.ws = "connecting";
    emit("status");
    let ws: WebSocket;
    try {
      ws = new WebSocket(CFG.wsUrl);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      Net.tries = 0;
      state.ws = "online";
      emit("status");
      Net.hello();
      Net.hb = setInterval(() => Net.hello(), 25000);
      if (state.user) Net.send({ axc: 1, t: "sync", user: state.user.u });
    };
    ws.onmessage = (m) => {
      let d: { axc?: number; t?: string; id?: string; user?: string | null; seal?: string } | null =
        null;
      try {
        d = JSON.parse(m.data as string);
      } catch {
        return;
      }
      if (!d || d.axc !== 1) return;
      if (d.t === "hi" && d.id) {
        Net.seen[d.id] = Date.now();
        state.presence = Net.presence();
        emit("presence");
      }
      if (d.t === "bye" && d.id) {
        delete Net.seen[d.id];
        state.presence = Net.presence();
        emit("presence");
      }
      if (d.t === "sync") emit("sync", d.user);
      if (d.t === "pulse") emit("pulse");
      if (d.t === "code" && d.seal) emit("mailpush", d);
    };
    ws.onclose = () => Net.retry();
    ws.onerror = () => undefined;
  },
  hello(): void {
    if (!this.id) this.id = randHex(6);
    this.seen[this.id] = Date.now();
    this.send({ axc: 1, t: "hi", id: this.id, user: state.user ? state.user.u : null });
    state.presence = this.presence();
    emit("presence");
  },
  retry(): void {
    if (this.hb) clearInterval(this.hb);
    if (this.timer) clearTimeout(this.timer);
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        /* ya cerrado */
      }
      this.ws = null;
    }
    state.ws = "off";
    state.presence = this.presence();
    emit("status");
    const wait = Math.min(60000, 4000 * Math.pow(1.6, this.tries++)) + Math.random() * 3000;
    this.timer = setTimeout(() => this.connect(), wait);
  },
};

/* ---------------- helpers PWA ---------------- */
export function standalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    typeof matchMedia !== "undefined" &&
      (matchMedia("(display-mode: standalone)").matches ||
        matchMedia("(display-mode: fullscreen)").matches ||
        matchMedia("(display-mode: minimal-ui)").matches) ||
    nav.standalone === true
  );
}

/* ---------------- init ---------------- */
let initPromise: Promise<AxcState> | null = null;

/** Arranca el SSO axc (idempotente): restaura sesión, salud del servidor y red. */
export function axcInit(): Promise<AxcState> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await restoreSession();
    void dbHealth();
    Net.connect();
    state.ready = true;
    emit("ready");
    return getAxcSnapshot();
  })();
  return initPromise;
}

/* ---------------- API pública ---------------- */
export const AXC = {
  signup,
  login,
  logout,
  verify,
  sendCode,
  fetchMail,
  state: getAxcSnapshot,
  net: Net,
  version: "1.0.0-ts",
};
