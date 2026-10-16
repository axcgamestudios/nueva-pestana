"use client";

/**
 * Panel de administración — Estadísticas y Límites de tiempo de juego.
 *
 * ESTADÍSTICAS: cuánto juega cada persona (hoy, media diaria, mes, total),
 * con detalle de los últimos 14 días y sus juegos favoritos. Los datos se
 * recogen automáticamente: cada navegador cuenta el tiempo de su usuario y
 * lo comparte por la red P2P (acción "pstat"); aquí se muestran los conocidos.
 *
 * LÍMITES: cada usuario tiene un tope mensual de minutos desde
 * `enforcementStart`. Aquí se editan manualmente y se conceden horas
 * extra (+1 h, +2 h…) para el mes; todo se guarda en el repositorio
 * (public/data/playtime-config.json) con un commit atómico, igual que
 * el gestor de juegos.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  Clock,
  Gift,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useAxStore, type AxUser } from "@/lib/store";
import { games as builtinGames, type Game } from "@/lib/games";
import { fetchCommunityGames } from "@/lib/community-games";
import {
  activeBonusMonth,
  enforcementActive,
  formatDuration,
  formatMinutes,
  getCachedConfig,
  loadPlaytimeConfig,
  monthKey,
  setCachedConfig,
  subscribePlaytime,
  todayKey,
  type PlaytimeConfig,
  type PlaytimeUserConfig,
} from "@/lib/playtime";
import {
  buildRows,
  sourceLabel,
  type StatRow,
} from "@/lib/panel-rows";
import {
  fetchCloudSnapshot,
  getCachedSnapshot,
  type CloudSnapshot,
} from "@/lib/cloud-db";
import { PT_JSON_PATH, TOKEN_KEY, commitFiles, createBlob, utf8ToBase64 } from "./dev-panel";

type Mode = "stats" | "limits";

/* ------------------------------------------------------------------ */
/* Utilidades de presentación                                          */
/* ------------------------------------------------------------------ */

function timeAgo(ts: number | null): string {
  if (!ts) return "sin datos";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "ahora";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function prettyDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function monthName(month: string): string {
  const [y, m] = month.split("-").map((x) => Number.parseInt(x, 10));
  return new Date(y, m - 1, 1).toLocaleDateString("es-MX", { month: "long" });
}

/** Gráfico de barras de los últimos 14 días (CSS puro). */
function DayBars({ days }: { days: Record<string, number> }) {
  const bars: { key: string; sec: number; dow: string }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    bars.push({
      key,
      sec: days[key] ?? 0,
      dow: d.toLocaleDateString("es-MX", { weekday: "narrow" }),
    });
  }
  const max = Math.max(1, ...bars.map((b) => b.sec));
  return (
    <div className="flex h-24 items-end gap-1.5" role="img" aria-label="Minutos jugados por día">
      {bars.map((b) => (
        <div key={b.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <div
            className={`w-full rounded-[3px] ${b.sec > 0 ? "bg-amber-400/80" : "bg-white/8"}`}
            style={{ height: `${Math.max(4, (b.sec / max) * 82)}%` }}
            title={`${prettyDate(b.key)}: ${formatDuration(b.sec)}`}
          />
          <span className="text-[9px] uppercase text-white/30">{b.dow}</span>
        </div>
      ))}
    </div>
  );
}

function TopGames({
  games,
  titles,
}: {
  games: Record<string, number>;
  titles: Record<string, string>;
}) {
  const top = Object.entries(games)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (top.length === 0) return <p className="text-xs text-white/35">Sin juegos registrados.</p>;
  return (
    <ul className="space-y-1.5">
      {top.map(([id, sec]) => (
        <li key={id} className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-white/70">{titles[id] ?? id}</span>
          <b className="shrink-0 text-amber-300">{formatDuration(sec)}</b>
        </li>
      ))}
    </ul>
  );
}

function UserChip({ row, size = "md" }: { row: StatRow; size?: "md" | "sm" }) {
  const s = size === "md" ? "h-8 w-8 text-sm" : "h-6 w-6 text-[10px]";
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`inline-flex ${s} items-center justify-center rounded-full font-bold text-black/80`}
        style={{ backgroundColor: row.avatarColor }}
        aria-hidden
      >
        {row.displayName.slice(0, 1).toUpperCase()}
      </span>
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0a0a] ${
          row.online ? "bg-emerald-400" : "bg-white/25"
        }`}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

export default function DevPanelPlaytime({ mode }: { mode: Mode }) {
  const me = useAxStore((s) => s.me);
  const onlineIds = useAxStore((s) => s.onlineIds);

  // Refresco en vivo: cualquier cambio de juego/stats/config re-renderiza
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => subscribePlaytime(bump), [bump]);

  // Configuración local (para fechas de fase en la pestaña de estadísticas)
  const config = useMemo(() => getCachedConfig(), [tick]);

  // Instantánea de la nube: TODAS las cuentas registradas + sus datos de
  // juego. Se muestra la caché al instante y se refresca cada 60 s.
  const [cloud, setCloud] = useState<CloudSnapshot | null>(() => getCachedSnapshot());
  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchCloudSnapshot().then((snap) => {
        if (alive && snap) setCloud(snap);
      });
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Nombres de juego (catálogo completo) para el desglose por juego
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void fetchCommunityGames().then((list) => {
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const g of [...builtinGames, ...list] as Game[]) map[g.id] = g.title;
      setTitles(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(
    () => buildRows(me, onlineIds, config, cloud),
    [me, onlineIds, config, cloud]
  );

  /* ------------------------- Pestaña ESTADÍSTICAS ------------------------ */

  const [expanded, setExpanded] = useState<string | null>(null);

  /* ------------------------- Pestaña LÍMITES ---------------------------- */

  const [draft, setDraft] = useState<PlaytimeConfig | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(mode === "limits");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [dirty, setDirty] = useState(false);
  const [reloadCfg, setReloadCfg] = useState(0);

  useEffect(() => {
    if (mode !== "limits") return;
    let alive = true;
    setLoadingCfg(true);
    void loadPlaytimeConfig(true)
      .then((cfg) => {
        if (!alive) return;
        setDraft(cfg);
        setLoadingCfg(false);
      })
      .catch(() => {
        if (!alive) return;
        setDraft(getCachedConfig());
        setLoadingCfg(false);
      });
    return () => {
      alive = false;
    };
  }, [mode, reloadCfg]);

  const targetMonth = draft ? activeBonusMonth(draft) : "";
  const enforcing = draft ? enforcementActive(draft) : false;

  /** Usuarios visibles en la pestaña de límites: con stats o ya en la config. */
  const listed = useMemo(() => {
    if (!draft) return [];
    const ids = new Set<string>();
    for (const r of rows) ids.add(r.userId);
    for (const id of Object.keys(draft.users)) ids.add(id);
    return Array.from(ids)
      .map((id) => {
        const row = rows.find((r) => r.userId === id) ?? null;
        const uc = draft.users[id] ?? {};
        return {
          id,
          row,
          uc,
          username: row?.username ?? uc.username ?? "desconocido",
        };
      })
      .sort((a, b) => {
        const online = Number(Boolean(b.row?.online)) - Number(Boolean(a.row?.online));
        return online || a.username.localeCompare(b.username);
      });
  }, [rows, draft]);

  const updateUser = useCallback(
    (userId: string, patch: Partial<PlaytimeUserConfig>, username?: string) => {
      setDraft((d) => {
        if (!d) return d;
        const prev: PlaytimeUserConfig = d.users[userId] ?? { username };
        return {
          ...d,
          users: { ...d.users, [userId]: { ...prev, ...patch, username: prev.username ?? username } },
        };
      });
      setDirty(true);
    },
    []
  );

  const addBonus = useCallback(
    (userId: string, min: number, username?: string) => {
      setDraft((d) => {
        if (!d) return d;
        const month = activeBonusMonth(d);
        const prev = d.users[userId] ?? { username };
        const bm = { ...(prev.bonusMinutes ?? {}) };
        bm[month] = (bm[month] ?? 0) + min;
        return {
          ...d,
          users: { ...d.users, [userId]: { ...prev, username: prev.username ?? username, bonusMinutes: bm } },
        };
      });
      setDirty(true);
    },
    []
  );

  const save = useCallback(async () => {
    const t = localStorage.getItem(TOKEN_KEY) ?? "";
    if (!t) {
      setError("Falta el token de GitHub. Cierra el panel y vuelve a entrar para configurarlo.");
      return;
    }
    if (!draft) return;
    setBusy("Guardando límites…");
    setError("");
    setOk("");
    try {
      const next: PlaytimeConfig = { ...draft, version: (draft.version || 0) + 1 };
      const b64 = utf8ToBase64(JSON.stringify(next, null, 2) + "\n");
      await commitFiles(t, "panel: actualizar límites de tiempo", [
        {
          path: PT_JSON_PATH,
          mode: "100644",
          type: "blob",
          sha: await createBlob(t, b64),
        },
      ]);
      setCachedConfig(next); // aplica los cambios aquí mismo
      setDraft(next);
      setDirty(false);
      setOk(
        "Límites guardados. GitHub Pages reconstruye el sitio en ~2 min y los jugadores lo aplican al refrescar."
      );
    } catch (err) {
      setError((err as Error).message || "No se pudo guardar la configuración.");
    } finally {
      setBusy("");
    }
  }, [draft]);

  /* ------------------------------ Render ------------------------------- */

  if (mode === "stats") {
    return (
      <div className="space-y-4">
        {/* Estado de la fase */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-200/90">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span>
            {enforcementActive(config) ? (
              <>
                <b>Límites activos</b> desde {prettyDate(config.enforcementStart)}. Observación iniciada el{" "}
                {prettyDate(config.observationStart)}.
              </>
            ) : (
              <>
                <b>Fase de observación</b> desde {prettyDate(config.observationStart)}: midiendo cuánto
                juega cada persona. Los límites se activan el {prettyDate(config.enforcementStart)}.
              </>
            )}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center">
            <Users className="mx-auto h-8 w-8 text-white/30" />
            <p className="mt-3 text-sm font-bold text-white/70">Todavía no hay jugadores conocidos</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-white/40">
              En cuanto alguien cree su cuenta (ahora compartida en la nube) aparecerá aquí
              automáticamente, aunque nunca coincidan conectados contigo. También se listan las
              cuentas creadas en este navegador.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-widest text-white/40">
                  <th className="px-3 py-2.5 font-bold">Jugador</th>
                  <th className="px-2 py-2.5 text-right font-bold">Hoy</th>
                  <th className="px-2 py-2.5 text-right font-bold">Media/día</th>
                  <th className="px-2 py-2.5 text-right font-bold">Este mes</th>
                  <th className="px-2 py-2.5 text-right font-bold">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.userId}>
                    <tr
                      onClick={() => setExpanded(expanded === r.userId ? null : r.userId)}
                      className="cursor-pointer border-b border-white/5 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <UserChip row={r} />
                          <span className="min-w-0">
                            <span className="block truncate font-bold text-white">
                              {r.displayName}
                              {r.isMe && <span className="ml-1.5 text-[10px] font-bold text-amber-400/80">(tú)</span>}
                            </span>
                            <span className="block truncate text-[11px] text-white/40">
                              @{r.username}
                              <span className="text-white/25"> · {sourceLabel(r.source, r.isMe)}</span>
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold text-white/85">
                        {formatDuration(r.todaySec)}
                      </td>
                      <td className="px-2 py-2.5 text-right text-white/70">
                        {formatDuration(r.avgDailySec)}
                      </td>
                      <td className="px-2 py-2.5 text-right text-white/85">
                        {formatDuration(r.monthSec)}
                      </td>
                      <td className="px-2 py-2.5 text-right text-white/50">
                        {formatDuration(r.totalSec)}
                      </td>
                      <td className="pr-2">
                        <ChevronDown
                          className={`h-4 w-4 text-white/30 transition ${expanded === r.userId ? "rotate-180" : ""}`}
                        />
                      </td>
                    </tr>
                    {expanded === r.userId && (
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
                            <div>
                              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">
                                <BarChart3 className="h-3.5 w-3.5" /> Últimos 14 días
                              </p>
                              <DayBars days={r.stats.d} />
                              <p className="mt-2 text-[11px] text-white/35">
                                Esta semana: {formatDuration(r.weekSec)} ·{" "}
                                {r.source === "local"
                                  ? `últ. partida ${timeAgo(r.lastSeen)}`
                                  : `visto ${timeAgo(r.lastSeen)}`}
                              </p>
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                                Juegos favoritos (30 d)
                              </p>
                              <TopGames games={r.stats.g} titles={titles} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-white/30">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          El tiempo se cuenta solo con la vista de juego abierta y la pestaña visible. Las cuentas
          están registradas en una base de datos compartida en la nube, de modo que cada jugador
          aparece siempre (los datos se suben cada ~5 min mientras juega y al cerrar la pestaña);
          se listan además las cuentas de este navegador y las vistas por la red P2P.
        </p>
      </div>
    );
  }

  /* --------------------------- Render LÍMITES --------------------------- */

  return (
    <div className="space-y-4">
      {busy && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          {busy}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {ok}
        </div>
      )}

      {loadingCfg || !draft ? (
        <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
        </div>
      ) : (
        <>
          {/* Estado */}
          <div
            className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-xs ${
              enforcing
                ? "border-orange-400/25 bg-orange-400/5 text-orange-200/90"
                : "border-amber-400/20 bg-amber-400/5 text-amber-200/90"
            }`}
          >
            <CalendarClock className="h-4 w-4 shrink-0" />
            {enforcing ? (
              <span>
                <b>Límites activos</b> desde {prettyDate(draft.enforcementStart)} — se bloquea el
                juego al agotar el tiempo mensual.
              </span>
            ) : (
              <span>
                <b>Fase de observación</b> — nadie es bloqueado todavía. Los límites se activan el{" "}
                {prettyDate(draft.enforcementStart)}.
              </span>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setDraft({
                  ...draft,
                  enforcementStart: enforcing ? "2999-12-31" : todayKey(),
                });
                setDirty(true);
              }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition active:scale-95 ${
                enforcing
                  ? "border border-white/15 bg-white/5 text-white/55 hover:border-red-500/50 hover:text-red-400"
                  : "bg-amber-400 text-black shadow-lg shadow-amber-400/20 hover:bg-amber-300"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {enforcing ? "Desactivar (solo observar)" : "Activar límites AHORA"}
            </button>
          </div>

          {/* Global + acciones */}
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <label
                htmlFor="pt-default"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-white/45"
              >
                Límite general (min/mes, usuarios sin valor propio)
              </label>
              <input
                id="pt-default"
                type="number"
                min={0}
                max={43200}
                value={draft.defaultMonthlyLimitMinutes ?? ""}
                placeholder="sin límite"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setDraft({ ...draft, defaultMonthlyLimitMinutes: v === "" ? null : Number(v) });
                  setDirty(true);
                }}
                className="w-40 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setReloadCfg((n) => n + 1)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/55 transition hover:border-white/25 hover:text-white active:scale-95"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Descartar cambios
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || Boolean(busy)}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 font-display text-xs font-bold tracking-widest text-black shadow-lg shadow-amber-400/20 transition hover:bg-amber-300 active:scale-95 disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                GUARDAR EN EL REPO
              </button>
            </div>
          </div>

          {/* Lista de usuarios */}
          {listed.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center">
              <Users className="mx-auto h-8 w-8 text-white/30" />
              <p className="mt-3 text-sm font-bold text-white/70">Todavía no hay jugadores</p>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-white/40">
                En cuanto alguien cree su cuenta (ahora compartida en la nube) aparecerá aquí para
                configurar su límite. También se listan las cuentas de este navegador.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {listed.map(({ id, row, uc, username }) => {
                const bonus = uc.bonusMinutes?.[targetMonth] ?? 0;
                return (
                  <li key={id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {row ? (
                          <UserChip row={row} />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm text-white/40">
                            ?
                          </span>
                        )}
                        <div>
                          <p className="text-sm font-bold text-white">{row?.displayName ?? username}</p>
                          <p className="text-[11px] text-white/40">
                            @{username}
                            {row
                              ? row.online
                                ? " · en línea"
                                : ` · ${timeAgo(row.lastSeen)}`
                              : " · solo en config"}
                            {row && !row.isMe && (
                              <span className="text-white/25"> · {sourceLabel(row.source, false)}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {row && (
                        <p className="text-[11px] text-white/40">
                          Media {formatDuration(row.avgDailySec)}/día · este mes{" "}
                          <b className="text-white/70">{formatDuration(row.monthSec)}</b>
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
                      {/* Límite mensual */}
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-white/45">
                          Límite de {monthName(targetMonth)} (min)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={43200}
                          value={uc.monthlyLimitMinutes ?? ""}
                          placeholder="usa el general"
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            updateUser(id, { monthlyLimitMinutes: v === "" ? null : Number(v) }, username);
                          }}
                          className="w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
                        />
                      </div>

                      {/* Exento */}
                      <label className="flex cursor-pointer select-none items-center gap-2 pb-2 text-xs text-white/60">
                        <input
                          type="checkbox"
                          checked={uc.exempt === true}
                          onChange={(e) => updateUser(id, { exempt: e.target.checked }, username)}
                          className="h-4 w-4 accent-amber-400"
                        />
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Exento (sin bloqueo)
                      </label>
                    </div>

                    {/* Bonus de horas extra */}
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs text-white/55">
                          <Gift className="h-3.5 w-3.5 text-amber-400/80" />
                          Horas extra de {monthName(targetMonth)}
                          {enforcing ? "" : " (se aplicarán al activarse los límites)"}:
                          <b className="text-amber-300">+{formatMinutes(bonus)}</b>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            [30, "+30 m"],
                            [60, "+1 h"],
                            [120, "+2 h"],
                          ].map(([min, label]) => (
                            <button
                              key={label as string}
                              type="button"
                              onClick={() => addBonus(id, min as number, username)}
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-400/20 active:scale-95"
                            >
                              <Plus className="h-3 w-3" />
                              {label as string}
                            </button>
                          ))}
                          {bonus > 0 && (
                            <button
                              type="button"
                              onClick={() => updateUser(id, { bonusMinutes: {} }, username)}
                              title="Quitar todas las horas extra"
                              className="inline-flex items-center rounded-full border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white/45 transition hover:border-red-500/50 hover:text-red-400 active:scale-95"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="flex items-start gap-2 text-xs leading-relaxed text-white/30">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            El límite de cada jugador es su tope mensual; las horas extra se suman solo al mes
            indicado. Al guardar, el navegador de cada jugador aplicará el bloqueo cuando agote su
            tiempo (comprueba los cambios cada ~2 min mientras juega).
          </p>
        </>
      )}
    </div>
  );
}
