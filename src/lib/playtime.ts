/**
 * Tiempo de juego: registro, estadísticas y límites semanales.
 *
 * Todo es 100% cliente (el sitio es estático, GitHub Pages):
 *
 *  - REGISTRO: cada navegador cuenta los segundos que su usuario juega
 *    (vista de juego abierta y pestaña visible) por día y por juego,
 *    guardados en localStorage `axcgames:playtime:<userId>`.
 *
 *  - ESTADÍSTICAS: un resumen compacto se comparte por la red P2P con cada
 *    heartbeat de presencia (acción "pstat" del lobby). Todos los navegadores
 *    cachéan la última estadística conocida de cada usuario que ven
 *    (`axcgames:pt-peers`), de modo que el panel de administración puede
 *    mostrar "cuánto juega cada persona" sin servidor central.
 *
 *  - LÍMITES: la configuración vive en el repo
 *    (`public/data/playtime-config.json`, editable desde el panel con token
 *    de GitHub). Desde `enforcementStart` cada usuario tiene un tope de
 *    minutos por SEMANA (lunes a domingo; = límite + bonus); al agotarlo
 *    no puede jugar hasta el lunes siguiente. El propio navegador del
 *    usuario lo aplica y el contador se reinicia cada lunes.
 */

import { asset } from "@/lib/paths";
import { pushCloudStats } from "./cloud-db";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Segundos jugados por juego en un día (YYYY-MM-DD). */
export type PlaytimeDayMap = Record<string, number>;

/** Datos locales de juego de un usuario (fuente de verdad en SU navegador). */
export interface PlaytimeData {
  days: Record<string, PlaytimeDayMap>;
  updatedAt: number;
}

/** Resumen compartido por P2P (claves cortas: viaja cada 20 s). */
export interface PlaytimeStats {
  /** dateKey → segundos (últimos 30 días). */
  d: Record<string, number>;
  /** gameId → segundos (últimos 30 días). */
  g: Record<string, number>;
  /** total de segundos registrados (ventana de 90 días). */
  t: number;
  /** epoch ms de cuando se generó. */
  up: number;
}

/** Entrada de la caché de estadísticas de otros usuarios. */
export interface PeerStatsEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  stats: PlaytimeStats;
  /** epoch ms de cuando se recibió. */
  seenAt: number;
}

/** Configuración por usuario dentro del JSON del repositorio. */
export interface PlaytimeUserConfig {
  username?: string;
  /** Tope semanal en minutos (lunes a domingo). null → usar el global. */
  weeklyLimitMinutes?: number | null;
  /** true → nunca se le bloquea. */
  exempt?: boolean;
  /** "YYYY-MM-DD" (lunes) → minutos extra concedidos para esa semana. */
  bonusMinutes?: Record<string, number>;
}

/** Configuración global (public/data/playtime-config.json). */
export interface PlaytimeConfig {
  version: number;
  /** Desde cuándo se analiza (YYYY-MM-DD). */
  observationStart: string;
  /** Desde cuándo se aplican los límites (YYYY-MM-DD). */
  enforcementStart: string;
  /** Tope semanal por defecto en minutos (usuarios sin valor propio). */
  defaultWeeklyLimitMinutes: number | null;
  /** Minutos sin interacción antes de pausar el contador (null → 5). */
  idleTimeoutMinutes?: number | null;
  users: Record<string, PlaytimeUserConfig>;
}

/** Resultado de evaluar el límite de un usuario ahora mismo. */
export interface LimitState {
  /** Fase actual. */
  phase: "observation" | "enforcement";
  /** ¿Se bloquea el juego al agotar el tiempo? */
  active: boolean;
  /** Tope semanal en minutos (null = sin límite). */
  limitMin: number | null;
  /** Minutos extra concedidos para la semana en curso (o la primera con límites). */
  bonusMin: number;
  /** Minutos jugados esta semana (desde el lunes). */
  usedMin: number;
  /** Minutos restantes (null = sin límite). */
  remainingMin: number | null;
  /** ¿Usuario exento? */
  exempt: boolean;
  /** Semana (lunes "YYYY-MM-DD") a la que se aplica el bonus mostrado. */
  bonusPeriod: string;
}

/* ------------------------------------------------------------------ */
/* Constantes y helpers de fecha                                       */
/* ------------------------------------------------------------------ */

const OWN_PREFIX = "axcgames:playtime:";
const PEERS_KEY = "axcgames:pt-peers";
const CONFIG_KEY = "axcgames:pt-config";

const REPO = "axcgamestudios/nueva-pestana";
const CONFIG_RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/public/data/playtime-config.json`;

/** Días de histórico que se conservan por usuario. */
const KEEP_DAYS = 90;
/** Días que se comparten por P2P. */
const SHARE_DAYS = 30;
/** Antigüedad máxima de una caché de par antes de descartarla (60 días). */
const PEER_TTL_MS = 60 * 24 * 60 * 60 * 1000;
/** Refresco de la configuración (2 min: límites casi en tiempo real). */
const CONFIG_TTL_MS = 2 * 60 * 1000;

/** Minutos sin interacción antes de considerar al jugador inactivo
 *  (valor por defecto cuando la configuración no lo indica). */
export const DEFAULT_IDLE_TIMEOUT_MIN = 5;

/** Milisegundos de inactividad que pausan el contador según la config.
 *  0 → detección desactivada (nunca se pausa). */
export function idleTimeoutMs(config: PlaytimeConfig | null): number {
  const min = config?.idleTimeoutMinutes;
  if (min === 0) return 0; // apagado explícitamente
  if (typeof min === "number" && Number.isFinite(min) && min > 0) return min * 60_000;
  return DEFAULT_IDLE_TIMEOUT_MIN * 60_000;
}

/** Fecha local "YYYY-MM-DD" (sv-SE da exactamente ISO). */
export function todayKey(d = new Date()): string {
  return d.toLocaleDateString("sv-SE");
}

/** Clave de mes local "YYYY-MM". */
export function monthKey(d = new Date()): string {
  return d.toLocaleDateString("sv-SE").slice(0, 7);
}

/** Lunes de la semana de una fecha, como "YYYY-MM-DD" (la semana va de
 *  lunes a domingo y los límites se reinician cada lunes). */
export function weekStartKey(d = new Date()): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = copy.getDay(); // 0 = domingo
  copy.setDate(copy.getDate() - (dow === 0 ? 6 : dow - 1));
  return todayKey(copy);
}

/** Fecha del próximo lunes (cuando se renueva el tiempo semanal). */
export function nextMondayDate(from = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const dow = d.getDay();
  d.setDate(d.getDate() + (((8 - dow) % 7) || 7));
  return d;
}

/** "YYYY-MM-DD" → Date local (para derivar el mes de una fecha de la config). */
function dateKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map((x) => Number.parseInt(x, 10));
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}

/** Mes (YYYY-MM) al que pertenece una fecha "YYYY-MM-DD". */
export function monthOfDateKey(key: string): string {
  return key.slice(0, 7);
}

/** Días transcurridos entre dos fechas "YYYY-MM-DD" (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = dateKeyToDate(a).getTime();
  const db = dateKeyToDate(b).getTime();
  return Math.max(0, Math.round((db - da) / 86_400_000));
}

/** "2h 5m" / "45m" a partir de segundos. */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** Minutos → "2 h" / "45 min" (para textos del panel). */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/* ------------------------------------------------------------------ */
/* Suscripción (UI reactiva sin store)                                 */
/* ------------------------------------------------------------------ */

type Listener = () => void;
const listeners = new Set<Listener>();

/** Suscribe a cambios de juego/estadísticas/configuración. */
export function subscribePlaytime(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emitChange(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error("[playtime] listener", err);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Registro propio (localStorage)                                       */
/* ------------------------------------------------------------------ */

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento lleno o no disponible */
  }
}

function ownKey(userId: string): string {
  return `${OWN_PREFIX}${userId}`;
}

/** Datos de juego del usuario (de su propio navegador). */
export function readOwn(userId: string): PlaytimeData {
  const data = readJSON<PlaytimeData | null>(ownKey(userId), null);
  if (!data || typeof data !== "object" || !data.days) {
    return { days: {}, updatedAt: 0 };
  }
  return data;
}

/** Elimina días fuera de la ventana de retención. */
function pruneDays(days: Record<string, PlaytimeDayMap>): Record<string, PlaytimeDayMap> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const cutoffKey = todayKey(cutoff);
  const out: Record<string, PlaytimeDayMap> = {};
  for (const [k, v] of Object.entries(days)) {
    if (k >= cutoffKey) out[k] = v;
  }
  return out;
}

/**
 * Suma `seconds` al día de hoy (y al juego indicado) del usuario.
 * Se llama cada pocos segundos mientras la vista de juego está abierta.
 * Además, con moderación (máx. 1 cada 5 min), sube los datos a la nube
 * para que el panel de administración los vea siempre.
 */
export function recordPlaytime(userId: string, gameId: string, seconds: number): void {
  if (!userId || !Number.isFinite(seconds) || seconds <= 0) return;
  const data = readOwn(userId);
  const day = todayKey();
  const perGame = data.days[day] ?? {};
  perGame[gameId] = (perGame[gameId] ?? 0) + seconds;
  data.days[day] = perGame;
  data.days = pruneDays(data.days);
  data.updatedAt = Date.now();
  writeJSON(ownKey(userId), data);
  emitChange();
  // Sincronización con la nube (fire-and-forget con throttle interno)
  void pushCloudStats(userId, data).catch(() => {
    /* sin nube: se reintenta en la próxima llamada */
  });
}

/** Segundos jugados en un día concreto. */
export function daySeconds(data: PlaytimeData, dateKey: string): number {
  const perGame = data.days[dateKey];
  if (!perGame) return 0;
  return Object.values(perGame).reduce((a, b) => a + b, 0);
}

/** Segundos jugados en todo un mes "YYYY-MM". */
export function monthSeconds(data: PlaytimeData, month: string): number {
  let total = 0;
  for (const [day, perGame] of Object.entries(data.days)) {
    if (monthOfDateKey(day) !== month) continue;
    for (const sec of Object.values(perGame)) total += sec;
  }
  return total;
}

/** Segundos jugados desde una fecha (inclusive) hasta hoy: p. ej. desde el
 *  lunes de esta semana. Es la base del límite semanal. */
export function secondsSinceKey(data: PlaytimeData, fromDateKey: string): number {
  let total = 0;
  for (const [day, perGame] of Object.entries(data.days)) {
    if (day < fromDateKey) continue;
    for (const sec of Object.values(perGame)) total += sec;
  }
  return total;
}

/** Segundos jugados en los últimos N días naturales (incluido hoy). */
export function lastDaysSeconds(data: PlaytimeData, n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    total += daySeconds(data, todayKey(d));
  }
  return total;
}

/** Resumen compacto a partir de datos ya leídos (reutilizable para la nube). */
export function statsFromData(data: PlaytimeData): PlaytimeStats {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (SHARE_DAYS - 1));
  const cutoffKey = todayKey(cutoff);

  const d: Record<string, number> = {};
  const g: Record<string, number> = {};
  let total = 0;
  for (const [day, perGame] of Object.entries(data.days)) {
    const dayTotal = Object.values(perGame).reduce((a, b) => a + b, 0);
    total += dayTotal;
    if (day < cutoffKey) continue;
    d[day] = Math.round(dayTotal);
    for (const [gameId, sec] of Object.entries(perGame)) {
      g[gameId] = (g[gameId] ?? 0) + sec;
    }
  }
  for (const [gameId, sec] of Object.entries(g)) g[gameId] = Math.round(sec);
  return { d, g, t: Math.round(total), up: Date.now() };
}

/** Resumen compacto listo para compartir por P2P. */
export function buildStatsPayload(userId: string): PlaytimeStats {
  return statsFromData(readOwn(userId));
}

/* ------------------------------------------------------------------ */
/* Caché de estadísticas de otros usuarios (recibidas por P2P)         */
/* ------------------------------------------------------------------ */

/** Todas las estadísticas conocidas de otros usuarios (sin las caducadas). */
export function getPeerStats(): PeerStatsEntry[] {
  const raw = readJSON<Record<string, PeerStatsEntry>>(PEERS_KEY, {});
  const now = Date.now();
  const out: PeerStatsEntry[] = [];
  for (const [userId, entry] of Object.entries(raw)) {
    if (!entry || !entry.stats || !entry.username) continue;
    if (now - entry.seenAt > PEER_TTL_MS) continue;
    out.push({ ...entry, userId });
  }
  return out.sort((a, b) => b.seenAt - a.seenAt);
}

/**
 * Guarda/actualiza la estadística recibida de otro usuario.
 * Devuelve true si se actualizó (para que la UI se refresque).
 */
export function ingestPeerStats(
  user: { id: string; username: string; displayName: string; avatarColor?: string },
  stats: PlaytimeStats
): boolean {
  if (!user?.id || !stats || typeof stats.up !== "number") return false;
  const raw = readJSON<Record<string, PeerStatsEntry>>(PEERS_KEY, {});
  const prev = raw[user.id];
  if (prev?.stats?.up && prev.stats.up >= stats.up) return false; // más viejo o repetido
  raw[user.id] = {
    userId: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    avatarColor: user.avatarColor || "#3b82f6",
    stats,
    seenAt: Date.now(),
  };
  writeJSON(PEERS_KEY, raw);
  emitChange();
  return true;
}

/**
 * Registra la identidad de un par visto en la red (acción "id") aunque su
 * mensaje de estadísticas ("pstat") se haya perdido: crea la entrada con
 * stats vacíos si no existía y NUNCA sobrescribe stats ya conocidos
 * (solo refresca identidad y momento del último avistamiento).
 */
export function ingestPeerIdentity(
  user: { id: string; username: string; displayName: string; avatarColor?: string }
): boolean {
  if (!user?.id || !user?.username) return false;
  const raw = readJSON<Record<string, PeerStatsEntry>>(PEERS_KEY, {});
  const prev = raw[user.id];
  const displayName = user.displayName || user.username;
  const now = Date.now();

  // Ya registrado con las mismas señas y visto hace menos de 1 min: no
  // reescribir (evita escrituras/re-renders con cada heartbeat de 20 s).
  if (
    prev &&
    prev.username === user.username &&
    prev.displayName === displayName &&
    prev.avatarColor === (user.avatarColor || prev.avatarColor) &&
    now - prev.seenAt < 60_000
  ) {
    return false;
  }

  if (prev?.stats?.up) {
    // ya conocemos sus estadísticas: mantenerlas, refrescar identidad/visto.
    // (sin este paso, un peer visto solo por "id" desaparecería del panel)
    raw[user.id] = {
      userId: user.id,
      username: user.username,
      displayName,
      avatarColor: user.avatarColor || prev.avatarColor || "#3b82f6",
      stats: prev.stats,
      seenAt: now,
    };
  } else {
    raw[user.id] = {
      userId: user.id,
      username: user.username,
      displayName,
      avatarColor: user.avatarColor || "#3b82f6",
      stats: { d: {}, g: {}, t: 0, up: 0 },
      seenAt: now,
    };
  }
  writeJSON(PEERS_KEY, raw);
  emitChange();
  return true;
}

/* ------------------------------------------------------------------ */
/* Configuración de límites (repositorio)                              */
/* ------------------------------------------------------------------ */

/** Configuración por defecto en ausencia de fichero (solo observación). */
export const FALLBACK_CONFIG: PlaytimeConfig = {
  version: 0,
  observationStart: todayKey(),
  enforcementStart: "2999-12-31", // sin fecha real → nunca bloquea
  defaultWeeklyLimitMinutes: null,
  idleTimeoutMinutes: null,
  users: {},
};

function normalizeConfig(raw: unknown): PlaytimeConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const users: Record<string, PlaytimeUserConfig> = {};
  if (r.users && typeof r.users === "object") {
    for (const [id, u] of Object.entries(r.users as Record<string, unknown>)) {
      if (!u || typeof u !== "object") continue;
      const c = u as Record<string, unknown>;
      const bonus: Record<string, number> = {};
      if (c.bonusMinutes && typeof c.bonusMinutes === "object") {
        for (const [m, v] of Object.entries(c.bonusMinutes as Record<string, unknown>)) {
          if (typeof v === "number" && Number.isFinite(v)) bonus[m] = v;
        }
      }
      users[id] = {
        username: typeof c.username === "string" ? c.username : undefined,
        // "weeklyLimitMinutes" es el campo actual; "monthlyLimitMinutes"
        // es el nombre antiguo (mensual) que se sigue aceptando para
        // configuraciones cacheadas antes del cambio a semanal.
        weeklyLimitMinutes:
          typeof c.weeklyLimitMinutes === "number"
            ? c.weeklyLimitMinutes
            : typeof c.monthlyLimitMinutes === "number"
              ? c.monthlyLimitMinutes
              : null,
        exempt: c.exempt === true,
        bonusMinutes: bonus,
      };
    }
  }
  return {
    version: typeof r.version === "number" ? r.version : 1,
    observationStart:
      typeof r.observationStart === "string" ? r.observationStart : todayKey(),
    enforcementStart:
      typeof r.enforcementStart === "string" ? r.enforcementStart : FALLBACK_CONFIG.enforcementStart,
    defaultWeeklyLimitMinutes:
      typeof r.defaultWeeklyLimitMinutes === "number"
        ? r.defaultWeeklyLimitMinutes
        : typeof r.defaultMonthlyLimitMinutes === "number"
          ? r.defaultMonthlyLimitMinutes
          : null,
    idleTimeoutMinutes:
      typeof r.idleTimeoutMinutes === "number" && Number.isFinite(r.idleTimeoutMinutes)
        ? r.idleTimeoutMinutes
        : null,
    users,
  };
}

interface CachedConfig {
  config: PlaytimeConfig;
  fetchedAt: number;
}

/** Configuración cacheada localmente (puede estar caducada). */
export function getCachedConfig(): PlaytimeConfig {
  const c = readJSON<CachedConfig | null>(CONFIG_KEY, null);
  return c?.config ?? FALLBACK_CONFIG;
}

/** Guarda la configuración en la caché local (p. ej. tras editarla en el panel). */
export function setCachedConfig(config: PlaytimeConfig): void {
  writeJSON(CONFIG_KEY, { config, fetchedAt: Date.now() });
  emitChange();
}

/**
 * Descarga la configuración fresca del repositorio (raw de main → fallback
 * al fichero desplegado). Cachea 2 minutos. Devuelve la config vigente.
 */
export async function loadPlaytimeConfig(force = false): Promise<PlaytimeConfig> {
  const cached = readJSON<CachedConfig | null>(CONFIG_KEY, null);
  if (!force && cached && Date.now() - cached.fetchedAt < CONFIG_TTL_MS) {
    return cached.config;
  }
  let fresh: PlaytimeConfig | null = null;
  try {
    const r = await fetch(`${CONFIG_RAW_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) fresh = normalizeConfig(await r.json());
  } catch {
    /* sin acceso al raw */
  }
  if (!fresh) {
    try {
      const r = await fetch(asset("/data/playtime-config.json"), { cache: "no-store" });
      if (r.ok) fresh = normalizeConfig(await r.json());
    } catch {
      /* fichero aún no publicado */
    }
  }
  const config = fresh ?? cached?.config ?? FALLBACK_CONFIG;
  writeJSON(CONFIG_KEY, { config, fetchedAt: Date.now() });
  if (fresh) emitChange();
  return config;
}

/* ------------------------------------------------------------------ */
/* Evaluación del límite                                               */
/* ------------------------------------------------------------------ */

/** ¿La aplicación de límites ya comenzó? */
export function enforcementActive(config: PlaytimeConfig): boolean {
  return todayKey() >= config.enforcementStart;
}

/**
 * Semana (lunes "YYYY-MM-DD") a la que se aplica un bonus concedido HOY:
 * si ya hay límites activos, la semana en curso; si aún estamos en
 * observación, la semana en que arrancan los límites.
 */
export function activeBonusPeriod(config: PlaytimeConfig): string {
  return enforcementActive(config)
    ? weekStartKey()
    : weekStartKey(dateKeyToDate(config.enforcementStart));
}

/**
 * Evalúa la situación de un usuario respecto a su límite SEMANAL
 * (lunes a domingo). `ownData` son SUS datos locales; se recomienda
 * readOwn(userId). El contador se reinicia solo cada lunes.
 */
export function evaluateLimit(
  config: PlaytimeConfig,
  userId: string,
  ownData: PlaytimeData
): LimitState {
  const phase = enforcementActive(config) ? "enforcement" : "observation";
  const uc = config.users[userId];
  const exempt = uc?.exempt === true;
  const limitMin =
    typeof uc?.weeklyLimitMinutes === "number"
      ? uc.weeklyLimitMinutes
      : config.defaultWeeklyLimitMinutes;

  const usedMin = secondsSinceKey(ownData, weekStartKey()) / 60;
  const bonusPeriod = activeBonusPeriod(config);
  const bonusMin = Math.max(0, uc?.bonusMinutes?.[bonusPeriod] ?? 0);

  const remainingMin =
    limitMin === null || limitMin === undefined
      ? null
      : limitMin + (phase === "enforcement" ? bonusMin : 0) - usedMin;

  return {
    phase,
    active: phase === "enforcement" && !exempt && limitMin != null,
    limitMin: limitMin ?? null,
    bonusMin,
    usedMin,
    remainingMin: remainingMin === null ? null : Math.max(0, remainingMin),
    exempt,
    bonusPeriod,
  };
}
