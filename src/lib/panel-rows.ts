"use client";

/**
 * Lógica pura del panel de estadísticas: construcción de la lista de
 * jugadores combinando TODAS las fuentes disponibles.
 *
 *  1. NUBE — cuentas registradas en la base de datos compartida
 *     (textdb.dev): aparecen siempre, jueguen desde donde jueguen.
 *  2. LOCAL — cuentas creadas en este navegador (con o sin sesión):
 *     sus datos de juego se leen directamente del almacenamiento local.
 *  3. P2P — jugadores de otros navegadores vistos alguna vez conectados.
 *  4. CONFIG — usuarios que solo existen en la configuración de límites.
 *
 * Las identidades se fusionan por nombre de usuario y sus tiempos de
 * juego se combinan tomando el máximo por día (el tiempo solo crece).
 * Módulo separado del componente para poder probarlo sin React.
 */

import type { AxUser } from "@/lib/store";
import { loadAccounts } from "@/lib/accounts";
import {
  buildStatsPayload,
  daysBetween,
  getPeerStats,
  monthKey,
  monthOfDateKey,
  readOwn,
  statsFromData,
  todayKey,
  weekStartKey,
  type PlaytimeConfig,
  type PlaytimeStats,
} from "@/lib/playtime";
import type { CloudSnapshot } from "@/lib/cloud-db";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface StatRow {
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  isMe: boolean;
  online: boolean;
  lastSeen: number | null;
  stats: PlaytimeStats;
  todaySec: number;
  weekSec: number;
  monthSec: number;
  avgDailySec: number;
  totalSec: number;
  /** De dónde conocemos a este jugador. */
  source: "cloud" | "local" | "p2p" | "config";
}

/** Etiqueta corta del origen de cada fila (para la UI). */
export function sourceLabel(source: StatRow["source"], isMe: boolean): string {
  if (isMe) return "sesión actual";
  if (source === "cloud") return "cuenta en la nube";
  if (source === "local") return "cuenta en este navegador";
  if (source === "p2p") return "visto en la red P2P";
  return "solo en la configuración";
}

const EMPTY_STATS: PlaytimeStats = { d: {}, g: {}, t: 0, up: 0 };

/** Prioridad de origen al fusionar identidades: nube > local > P2P > config. */
const SOURCE_RANK: Record<StatRow["source"], number> = {
  cloud: 3,
  local: 2,
  p2p: 1,
  config: 0,
};

/** Combina dos resúmenes tomando el máximo por día/juego (el tiempo solo crece). */
export function unionStats(a: PlaytimeStats | null, b: PlaytimeStats | null): PlaytimeStats {
  if (!a) return b ?? EMPTY_STATS;
  if (!b) return a;
  const d: Record<string, number> = { ...a.d };
  for (const [k, v] of Object.entries(b.d)) d[k] = Math.max(d[k] ?? 0, v);
  const g: Record<string, number> = { ...a.g };
  for (const [k, v] of Object.entries(b.g)) g[k] = Math.max(g[k] ?? 0, v);
  // El total conocido es el máximo entre los totales previos y la suma de la
  // ventana de 30 días fusionada (los totales previos cubren hasta 90 días).
  let sum30 = 0;
  for (const v of Object.values(d)) sum30 += v;
  return { d, g, t: Math.max(a.t ?? 0, b.t ?? 0, sum30), up: Math.max(a.up ?? 0, b.up ?? 0) };
}

/* ------------------------------------------------------------------ */
/* Construcción de filas                                               */
/* ------------------------------------------------------------------ */

function summarize(
  ident: { id: string; username: string; displayName: string; avatarColor: string },
  stats: PlaytimeStats,
  isMe: boolean,
  online: boolean,
  lastSeen: number | null,
  config: PlaytimeConfig,
  source: StatRow["source"]
): StatRow {
  const today = todayKey();
  const month = monthKey();
  const from = config.observationStart > today ? today : config.observationStart;
  const observedDays = Math.max(1, Math.min(30, daysBetween(from, today) + 1));
  // Semana de calendario real: desde el lunes (igual que el límite semanal).
  const weekStart = weekStartKey();

  let monthSec = 0;
  let fromSec = 0;
  let weekSec = 0;
  for (const [day, sec] of Object.entries(stats.d)) {
    if (monthOfDateKey(day) === month) monthSec += sec;
    if (day >= from && day <= today) fromSec += sec;
    if (day >= weekStart && day <= today) weekSec += sec;
  }
  return {
    userId: ident.id,
    username: ident.username,
    displayName: ident.displayName || ident.username,
    avatarColor: ident.avatarColor || "#3b82f6",
    isMe,
    online,
    lastSeen,
    stats,
    todaySec: stats.d[today] ?? 0,
    weekSec,
    monthSec,
    avgDailySec: fromSec / observedDays,
    totalSec: stats.t,
    source,
  };
}

export function buildRows(
  me: AxUser | null,
  onlineIds: Set<string>,
  config: PlaytimeConfig,
  cloud: CloudSnapshot | null
): StatRow[] {
  /* Identidades acumuladas por username (la clave humana estable entre
   * nube / navegador / P2P / configuración). Cada identidad fusiona los
   * datos de juego conocidos por todas las fuentes. */
  const byName = new Map<
    string,
    {
      id: string;
      username: string;
      displayName: string;
      avatarColor: string;
      isMe: boolean;
      online: boolean;
      lastSeen: number | null;
      source: StatRow["source"];
      stats: PlaytimeStats | null;
    }
  >();
  const byId = new Map<string, string>(); // userId → username

  const touch = (entry: {
    id: string;
    username: string;
    displayName: string;
    avatarColor?: string;
    isMe?: boolean;
    online?: boolean;
    lastSeen?: number | null;
    source?: StatRow["source"];
    stats?: PlaytimeStats | null;
  }) => {
    const name = entry.username;
    const prev = byName.get(name);
    if (!prev) {
      byName.set(name, {
        id: entry.id,
        username: name,
        displayName: entry.displayName || name,
        avatarColor: entry.avatarColor || "#3b82f6",
        isMe: entry.isMe === true,
        online: entry.online === true,
        lastSeen: entry.lastSeen ?? null,
        source: entry.source ?? "local",
        stats: entry.stats ?? null,
      });
    } else {
      // Fusionar: gana la fuente con mayor prioridad (nube > local > P2P > config)
      if (entry.source && SOURCE_RANK[entry.source] > SOURCE_RANK[prev.source]) {
        prev.source = entry.source;
      }
      if (entry.isMe) prev.isMe = true;
      if (entry.online) prev.online = true;
      if (entry.lastSeen != null) {
        prev.lastSeen = prev.lastSeen == null ? entry.lastSeen : Math.max(prev.lastSeen, entry.lastSeen);
      }
      prev.stats = unionStats(prev.stats, entry.stats ?? null);
    }
    if (!byId.has(entry.id)) byId.set(entry.id, name);
  };

  // 1) Cuentas registradas en la nube (TODAS, estén donde estén).
  if (cloud) {
    for (const a of cloud.accounts) {
      const data = cloud.stats[a.id];
      touch({
        id: a.id,
        username: a.username,
        displayName: a.displayName,
        avatarColor: a.avatarColor,
        isMe: me?.id === a.id || me?.username === a.username,
        online: onlineIds.has(a.id) || me?.id === a.id,
        lastSeen: data?.updatedAt || null,
        source: "cloud",
        stats: data ? statsFromData(data) : EMPTY_STATS,
      });
    }
  }

  // 2) TODAS las cuentas creadas en este navegador (con o sin sesión
  // iniciada). Si también están en la nube, sus datos se fusionan.
  for (const account of Object.values(loadAccounts())) {
    const u = account?.user;
    if (!u?.id) continue;
    const own = readOwn(u.id);
    touch({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarColor: u.avatarColor,
      isMe: me?.id === u.id,
      online: me?.id === u.id,
      lastSeen: own.updatedAt || Date.parse(u.createdAt) || null,
      source: undefined, // no degrada la fuente si ya está "cloud"
      stats: buildStatsPayload(u.id),
    });
  }

  // Red de seguridad: la sesión actual siempre presente.
  if (me && !byName.has(me.username)) {
    touch({
      id: me.id,
      username: me.username,
      displayName: me.displayName,
      avatarColor: me.avatarColor,
      isMe: true,
      online: true,
      lastSeen: Date.now(),
      source: "local",
      stats: buildStatsPayload(me.id),
    });
  }

  // 3) Jugadores de otros navegadores vistos alguna vez por la red P2P
  // (los ya listados solo aportan datos frescos: la prioridad de fuente
  // la resuelve SOURCE_RANK, nube > local > P2P).
  for (const p of getPeerStats()) {
    touch({
      id: p.userId,
      username: p.username,
      displayName: p.displayName,
      avatarColor: p.avatarColor,
      online: onlineIds.has(p.userId),
      lastSeen: p.seenAt,
      source: "p2p",
      stats: p.stats,
    });
  }

  // 4) Usuarios que solo existen en la configuración de límites.
  for (const [userId, uc] of Object.entries(config.users)) {
    const username = uc.username ?? userId;
    if (byId.has(userId) || byName.has(username)) continue;
    touch({
      id: userId,
      username,
      displayName: username,
      source: "config",
      stats: EMPTY_STATS,
    });
  }

  const rows: StatRow[] = [];
  for (const ident of byName.values()) {
    rows.push(
      summarize(
        {
          id: ident.id,
          username: ident.username,
          displayName: ident.displayName,
          avatarColor: ident.avatarColor,
        },
        ident.stats ?? EMPTY_STATS,
        ident.isMe,
        ident.online,
        ident.lastSeen,
        config,
        ident.source
      )
    );
  }

  rows.sort(
    (a, b) =>
      Number(b.online) - Number(a.online) ||
      Number(b.isMe) - Number(a.isMe) ||
      b.monthSec - a.monthSec ||
      a.username.localeCompare(b.username)
  );
  return rows;
}
