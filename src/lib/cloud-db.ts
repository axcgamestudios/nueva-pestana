"use client";

/**
 * Base de datos compartida y gratuita para axcgames (textdb.dev).
 *
 * El sitio es estático (GitHub Pages) y hasta ahora cada cuenta vivía solo
 * en el navegador donde se creó: el panel de administración no veía a nadie
 * a menos que coincidiera conectado por la red P2P.
 *
 * Esta módulo añade un registro compartido en la nube usando textdb.dev
 * (servicio gratuito, sin cuenta, con CORS abierto):
 *
 *   GET  https://textdb.dev/api/data/<clave>/  → lee el documento
 *   POST https://textdb.dev/api/data/<clave>/  → reemplaza el documento
 *
 * Claves (con prefijo aleatorio para que no sean adivinables):
 *   <prefix>-registry  → { v, users: { username: cuenta } }
 *   <prefix>-u-<uid>   → datos de juego (PlaytimeData) de cada jugador
 *
 * - REGISTRO: al crear una cuenta se escribe aquí (usuario, hash PBKDF2,
 *   color, etc.). Permite iniciar sesión desde cualquier dispositivo y
 *   da visibilidad total al panel de administración.
 * - ESTADÍSTICAS: cada navegador sube sus datos de juego con moderación
 *   (máx. 1 escritura cada 5 min mientras juega + al cerrar la pestaña).
 * - Sin dependencias externas: fetch + text/plain (sin preflight CORS).
 */

import type { PlaytimeData } from "./playtime";

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

/** Prefijo aleatorio de la base (compartido por todos los documentos). */
const DB_PREFIX = "axcg-db-ad177030591d3cecc0ddbc51043cc50b0b3c4376";
const API_ROOT = "https://textdb.dev/api/data";
const REGISTRY_KEY = `${DB_PREFIX}-registry`;

const REGISTRY_CACHE = "axcgames:cloud-registry";
const SNAPSHOT_CACHE = "axcgames:cloud-snapshot";

/** Antigüedad máxima de la caché local del panel (30 s). */
export const SNAPSHOT_TTL_MS = 30_000;
/** Intervalo mínimo entre subidas de estadísticas por usuario. */
export const PUSH_MIN_INTERVAL_MS = 5 * 60_000;

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Cuenta registrada en la nube (equivale a Account local + marca de tiempo). */
export interface CloudAccount {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  salt: string;
  hash: string;
  createdAt: string;
  /** epoch ms de la última actualización del registro. */
  updatedAt: number;
}

/** Documento de registro compartido. */
export interface CloudRegistry {
  v: number;
  users: Record<string, CloudAccount>;
}

/** Instantánea para el panel: cuentas + datos de juego de cada una. */
export interface CloudSnapshot {
  fetchedAt: number;
  accounts: CloudAccount[];
  stats: Record<string, PlaytimeData>;
}

/* ------------------------------------------------------------------ */
/* Primitivas HTTP (text/plain → simple request, sin preflight)         */
/* ------------------------------------------------------------------ */

async function readDoc<T>(key: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(`${API_ROOT}/${key}/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return JSON.parse(await res.text()) as T;
  } catch {
    return null;
  }
}

async function writeDoc(
  key: string,
  value: unknown,
  timeoutMs = 10_000,
  keepalive = false
): Promise<boolean> {
  try {
    const res = await fetch(`${API_ROOT}/${key}/`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(value),
      keepalive,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Registro de cuentas                                                  */
/* ------------------------------------------------------------------ */

function normalizeRegistry(raw: unknown): CloudRegistry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const users: Record<string, CloudAccount> = {};
  if (r.users && typeof r.users === "object") {
    for (const [username, u] of Object.entries(r.users as Record<string, unknown>)) {
      if (!u || typeof u !== "object") continue;
      const a = u as Record<string, unknown>;
      if (
        typeof a.id !== "string" ||
        typeof a.username !== "string" ||
        typeof a.salt !== "string" ||
        typeof a.hash !== "string"
      ) {
        continue;
      }
      users[username] = {
        id: a.id,
        username: a.username,
        displayName: typeof a.displayName === "string" ? a.displayName : a.username,
        avatarColor: typeof a.avatarColor === "string" ? a.avatarColor : "#f59e0b",
        salt: a.salt,
        hash: a.hash,
        createdAt: typeof a.createdAt === "string" ? a.createdAt : new Date().toISOString(),
        updatedAt: typeof a.updatedAt === "number" ? a.updatedAt : 0,
      };
    }
  }
  return { v: typeof r.v === "number" ? r.v : 2, users };
}

/** Descarga el registro compartido (null si la nube no responde). */
export async function fetchRegistry(timeoutMs = 8000): Promise<CloudRegistry | null> {
  const raw = await readDoc<unknown>(REGISTRY_KEY, timeoutMs);
  const reg = raw ? normalizeRegistry(raw) : null;
  if (reg) {
    try {
      localStorage.setItem(REGISTRY_CACHE, JSON.stringify(reg));
    } catch {
      /* ignorar */
    }
  }
  return reg;
}

/** Registro en caché local (para render instantáneo del panel). */
export function getCachedRegistry(): CloudRegistry | null {
  try {
    const raw = localStorage.getItem(REGISTRY_CACHE);
    return raw ? (JSON.parse(raw) as CloudRegistry) : null;
  } catch {
    return null;
  }
}

/**
 * Registra/actualiza una cuenta en la nube con reintento ante carreras
 * (leer → fusionar → escribir → verificar que mi entrada quedó).
 */
export async function registerCloudAccount(
  entry: CloudAccount
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const reg = (await fetchRegistry()) ?? { v: 2, users: {} };
    const prev = reg.users[entry.username];
    if (prev && prev.id !== entry.id) {
      return { ok: false, error: "Ese nombre de usuario ya existe en la nube." };
    }
    reg.users[entry.username] = { ...entry, updatedAt: Date.now() };
    const written = await writeDoc(REGISTRY_KEY, reg);
    if (!written) continue;
    // Verificar que mi entrada sobrevivió (otro navegador pudo ganar la carrera)
    const after = await fetchRegistry();
    if (after?.users[entry.username]?.id === entry.id) return { ok: true };
  }
  return { ok: false, error: "La base de datos no respondió. Inténtalo de nuevo en un momento." };
}

/* ------------------------------------------------------------------ */
/* Estadísticas de juego por usuario                                    */
/* ------------------------------------------------------------------ */

/** Clave del documento de juego de un usuario. */
export function statsDocKey(userId: string): string {
  return `${DB_PREFIX}-u-${userId}`;
}

/** Última vez (epoch ms) que se subieron stats por usuario (throttle). */
const lastPush = new Map<string, number>();

/**
 * Sube los datos de juego del usuario a la nube.
 * `force` ignora el throttle (login, migración, cierre de pestaña).
 */
export async function pushCloudStats(
  userId: string,
  data: PlaytimeData,
  opts: { force?: boolean; keepalive?: boolean } = {}
): Promise<boolean> {
  if (!userId) return false;
  const now = Date.now();
  if (!opts.force) {
    const last = lastPush.get(userId) ?? 0;
    if (now - last < PUSH_MIN_INTERVAL_MS) return false;
  }
  lastPush.set(userId, now);
  return writeDoc(statsDocKey(userId), data, 10_000, opts.keepalive);
}

/** Descarga los datos de juego de un usuario (null si no existen). */
export async function fetchCloudStats(userId: string): Promise<PlaytimeData | null> {
  const raw = await readDoc<PlaytimeData | null>(statsDocKey(userId));
  if (!raw || typeof raw !== "object" || !raw.days) return null;
  return raw;
}

/* ------------------------------------------------------------------ */
/* Instantánea completa para el panel                                    */
/* ------------------------------------------------------------------ */

/**
 * Descarga el registro + las estadísticas de TODOS los usuarios en paralelo.
 * Guarda una caché local para render instantáneo la próxima vez.
 */
export async function fetchCloudSnapshot(): Promise<CloudSnapshot | null> {
  const reg = await fetchRegistry(10_000);
  if (!reg) return null;
  const accounts = Object.values(reg.users);
  const entries = await Promise.allSettled(
    accounts.map((a) => fetchCloudStats(a.id))
  );
  const stats: Record<string, PlaytimeData> = {};
  accounts.forEach((a, i) => {
    const r = entries[i];
    if (r.status === "fulfilled" && r.value) stats[a.id] = r.value;
  });
  const snapshot: CloudSnapshot = { fetchedAt: Date.now(), accounts, stats };
  try {
    localStorage.setItem(SNAPSHOT_CACHE, JSON.stringify(snapshot));
  } catch {
    /* ignorar */
  }
  return snapshot;
}

/** Instantánea en caché (para abrir el panel al instante). */
export function getCachedSnapshot(): CloudSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_CACHE);
    if (!raw) return null;
    const snap = JSON.parse(raw) as CloudSnapshot;
    if (!snap || !Array.isArray(snap.accounts)) return null;
    return snap;
  } catch {
    return null;
  }
}

/** ¿Está fresca la caché de la instantánea? */
export function snapshotFresh(snap: CloudSnapshot): boolean {
  return Date.now() - snap.fetchedAt < SNAPSHOT_TTL_MS;
}
