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
 *   <prefix>-registry  → { v, users: { username: cuenta }, devices: { deviceId: vinculo } }
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

/** Vínculo dispositivo → cuenta: cada dispositivo puede tener SOLO 1. */
export interface CloudDeviceBinding {
  userId: string;
  username: string;
  /** epoch ms de cuándo se vinculó. */
  boundAt: number;
}

/** Documento de registro compartido. */
export interface CloudRegistry {
  v: number;
  users: Record<string, CloudAccount>;
  /** deviceId → cuenta vinculada (1 cuenta por dispositivo). */
  devices?: Record<string, CloudDeviceBinding>;
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

/** Normaliza un vínculo de dispositivo (o null si no es válido). */
function normalizeBinding(raw: unknown): CloudDeviceBinding | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.userId !== "string" || typeof b.username !== "string") return null;
  return { userId: b.userId, username: b.username, boundAt: typeof b.boundAt === "number" ? b.boundAt : 0 };
}

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
        avatarColor: typeof a.avatarColor === "string" ? a.avatarColor : "#3b82f6",
        salt: a.salt,
        hash: a.hash,
        createdAt: typeof a.createdAt === "string" ? a.createdAt : new Date().toISOString(),
        updatedAt: typeof a.updatedAt === "number" ? a.updatedAt : 0,
      };
    }
  }
  // Preservar los vínculos dispositivo→cuenta (se pierden si no se
  // reescriben al guardar el registro).
  const devices: Record<string, CloudDeviceBinding> = {};
  if (r.devices && typeof r.devices === "object") {
    for (const [deviceId, d] of Object.entries(r.devices as Record<string, unknown>)) {
      const binding = normalizeBinding(d);
      if (binding) devices[deviceId] = binding;
    }
  }
  return { v: typeof r.v === "number" ? r.v : 2, users, devices };
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
/* Vínculos dispositivo → cuenta (1 cuenta por dispositivo)             */
/* ------------------------------------------------------------------ */

/**
 * Vincula un dispositivo a una cuenta NUEVA (registro). Falla si el
 * dispositivo ya está vinculado a OTRA cuenta: así un mismo navegador no
 * puede crear varias cuentas para esquivar los límites de tiempo.
 */
export async function claimDevice(
  deviceId: string,
  account: { userId: string; username: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!deviceId) return { ok: false, error: "Sin identificador de dispositivo." };
  for (let attempt = 0; attempt < 3; attempt++) {
    const reg = (await fetchRegistry()) ?? { v: 2, users: {} };
    const prev = reg.devices?.[deviceId];
    if (prev && prev.userId !== account.userId) {
      return { ok: false, error: `Este dispositivo ya tiene la cuenta «${prev.username}».` };
    }
    reg.devices = { ...reg.devices, [deviceId]: { ...account, boundAt: Date.now() } };
    const written = await writeDoc(REGISTRY_KEY, reg);
    if (!written) continue;
    const after = await fetchRegistry();
    if (after?.devices?.[deviceId]?.userId === account.userId) return { ok: true };
  }
  return { ok: false, error: "La base de datos no respondió al vincular el dispositivo." };
}

/**
 * Vincula el dispositivo SOLO si está libre (al iniciar sesión). Si ya
 * pertenece a otra cuenta no hace nada ni falla: entrar con cuentas
 * existentes desde cualquier dispositivo sigue permitido; lo que se
 * limita es CREAR cuentas nuevas.
 */
export async function bindDeviceIfFree(
  deviceId: string,
  account: { userId: string; username: string }
): Promise<boolean> {
  if (!deviceId) return false;
  const reg = await fetchRegistry();
  if (reg?.devices?.[deviceId]) return false; // ya vinculado (a esta u otra cuenta)
  return (await claimDevice(deviceId, account)).ok;
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
/* Bandeja de entrada (entrega offline de amistad y mensajes)           */
/* ------------------------------------------------------------------ */

/** Perfil público de un usuario tal como viaja por la bandeja. */
export interface CloudPublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  createdAt: string;
  bio?: string;
}

/** Mensaje tal como viaja en la bandeja (misma forma que AxMessage). */
export interface CloudInboxMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  createdAt: string;
  sender: CloudPublicUser;
}

/** Grupo tal como viaja en una invitación de la bandeja. */
export interface CloudInboxGroup {
  id: string;
  type: "group";
  name: string | null;
  avatarColor: string;
  createdBy: string | null;
  updatedAt: string;
  members: CloudPublicUser[];
  lastMessage: unknown;
  unreadCount: number;
  lastReadAt: string;
}

/**
 * Ítem pendiente de entregar a un usuario que quizá no está conectado.
 * Se ingestiona en cuanto el destinatario abre la web (poll cada 20 s)
 * y se elimina del documento una vez consumido.
 */
export interface CloudInboxItem {
  id: string;
  /** epoch ms de creación. */
  at: number;
  kind: "friend-request" | "friend-accept" | "message" | "group-invite";
  /** quien lo envía. */
  from: CloudPublicUser;
  /** solo kind=message. */
  message?: CloudInboxMessage;
  /** solo kind=group-invite. */
  group?: CloudInboxGroup;
}

interface InboxDoc {
  v: number;
  items: CloudInboxItem[];
}

/** Antigüedad máxima de un ítem (14 días). */
const INBOX_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Máximo de ítems por bandeja (se descartan los más viejos). */
const INBOX_CAP = 40;

/** Clave del documento de bandeja de un usuario. */
export function inboxDocKey(userId: string): string {
  return `${DB_PREFIX}-inbox-${userId}`;
}

function normalizeItem(raw: unknown): CloudInboxItem | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Record<string, unknown>;
  const from = it.from as Record<string, unknown> | undefined;
  if (
    typeof it.id !== "string" ||
    typeof it.at !== "number" ||
    typeof it.kind !== "string" ||
    !from ||
    typeof from.id !== "string" ||
    typeof from.username !== "string" ||
    typeof from.displayName !== "string" ||
    typeof from.avatarColor !== "string"
  ) {
    return null;
  }
  const item: CloudInboxItem = {
    id: it.id,
    at: it.at,
    kind: it.kind as CloudInboxItem["kind"],
    from: {
      id: from.id,
      username: from.username,
      displayName: from.displayName,
      avatarColor: from.avatarColor,
      createdAt: typeof from.createdAt === "string" ? from.createdAt : new Date().toISOString(),
      bio: typeof from.bio === "string" ? from.bio : "",
    },
  };
  if (it.message && typeof it.message === "object") item.message = it.message as CloudInboxMessage;
  if (it.group && typeof it.group === "object") item.group = it.group as CloudInboxGroup;
  return item;
}

function normalizeInbox(raw: unknown): InboxDoc {
  const items: CloudInboxItem[] = [];
  if (raw && typeof raw === "object" && Array.isArray((raw as InboxDoc).items)) {
    for (const x of (raw as InboxDoc).items) {
      const it = normalizeItem(x);
      if (it) items.push(it);
    }
  }
  return { v: 1, items };
}

/** Descarga la bandeja pendiente de un usuario ([] si está vacía o falla). */
export async function fetchInbox(userId: string): Promise<CloudInboxItem[]> {
  const raw = await readDoc<unknown>(inboxDocKey(userId));
  if (!raw) return [];
  return normalizeInbox(raw).items.filter((it) => Date.now() - it.at < INBOX_TTL_MS);
}

/**
 * Añade ítems a la bandeja de un usuario (leer → fusionar → escribir →
 * verificar, con reintentos ante carreras de otros navegadores).
 */
export async function pushInboxItems(
  userId: string,
  newItems: CloudInboxItem[]
): Promise<boolean> {
  if (!userId || newItems.length === 0) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = normalizeInbox(await readDoc<unknown>(inboxDocKey(userId)));
    const cutoff = Date.now() - INBOX_TTL_MS;
    const fresh = newItems.filter((n) => !doc.items.some((x) => x.id === n.id));
    doc.items = [...doc.items, ...fresh]
      .filter((it) => it.at > cutoff)
      .sort((a, b) => a.at - b.at)
      .slice(-INBOX_CAP);
    const written = await writeDoc(inboxDocKey(userId), doc);
    if (!written) continue;
    const after = normalizeInbox(await readDoc<unknown>(inboxDocKey(userId)));
    if (newItems.every((n) => after.items.some((x) => x.id === n.id))) return true;
  }
  return false;
}

/** Reemplaza el contenido de la bandeja (p. ej. vaciarla tras ingestar). */
export async function replaceInbox(userId: string, items: CloudInboxItem[]): Promise<boolean> {
  const doc: InboxDoc = { v: 1, items };
  return writeDoc(inboxDocKey(userId), doc);
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
