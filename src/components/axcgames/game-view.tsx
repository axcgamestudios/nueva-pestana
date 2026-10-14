"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { asset } from "@/lib/paths";
import { motion } from "framer-motion";
import {
  AlarmClock,
  ArrowLeft,
  CalendarClock,
  Clock,
  Gamepad2,
  Heart,
  Hourglass,
  Keyboard,
  Maximize2,
  Minimize,
  RotateCcw,
  Star,
  Users,
  Wrench,
} from "lucide-react";
import type { Game } from "@/lib/games";
import GameCard from "./game-card";
import { useAxStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  evaluateLimit,
  formatDuration,
  loadPlaytimeConfig,
  readOwn,
  recordPlaytime,
  subscribePlaytime,
  todayKey,
  type LimitState,
  type PlaytimeConfig,
} from "@/lib/playtime";

type Props = {
  game: Game;
  others: Game[];
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onClose: () => void;
  onPlay: (game: Game) => void;
};

/** Intervalo del contador de tiempo jugado. */
const TRACK_TICK_MS = 5_000;

/** Colores del chip según lo que queda de tiempo (en minutos). */
function remainingChipClass(remainingMin: number | null): string {
  if (remainingMin === null) return "border-white/10 bg-white/5 text-white/55";
  if (remainingMin > 60) return "border-white/10 bg-white/5 text-white/70";
  if (remainingMin > 15) return "border-amber-400/40 bg-amber-400/10 text-amber-300";
  if (remainingMin > 0) return "border-orange-400/50 bg-orange-400/10 text-orange-300";
  return "border-red-500/50 bg-red-500/10 text-red-400";
}

function ControlButton({
  children,
  label,
  onClick,
  active = false,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const className = `flex h-9 w-9 items-center justify-center rounded-full border transition active:scale-90 ${
    active
      ? "border-amber-400/60 bg-amber-400/15 text-amber-400"
      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
  }`;
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={className}>
      {children}
    </button>
  );
}

export default function GameView({
  game,
  others,
  favorites,
  onToggleFavorite,
  onClose,
  onPlay,
}: Props) {
  const [iframeKey, setIframeKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  // Tiempo de juego: usuario actual, configuración de límites y estado vivo.
  // `limit` y `todaySec` se DERIVAN en cada render de los datos locales
  // (localStorage) + config; se re-renderiza al registrarse tiempo
  // (subscribePlaytime) y al llegar config nueva.
  const me = useAxStore((s) => s.me);
  const { toast } = useToast();
  const [config, setConfig] = useState<PlaytimeConfig | null>(null);
  const warnedRef = useRef<Set<string>>(new Set());

  // Re-render cuando cambia cualquier dato de juego (propio o de pares)
  const [, setPlaytimeTick] = useState(0);
  useEffect(() => subscribePlaytime(() => setPlaytimeTick((v) => v + 1)), []);

  const ownData = me ? readOwn(me.id) : null;
  const limit: LimitState | null =
    me && config ? evaluateLimit(config, me.id, ownData ?? { days: {}, updatedAt: 0 }) : null;
  const todaySec = ownData
    ? Object.values(ownData.days[todayKey()] ?? {}).reduce((a, b) => a + b, 0)
    : 0;

  const blocked =
    limit !== null && limit.active && limit.remainingMin !== null && limit.remainingMin <= 0;

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const reloadGame = () => {
    setLoaded(false);
    setIframeKey((k) => k + 1);
  };

  // Cargar configuración de límites (raw del repo → caché local) y refrescarla
  // cada minuto (si el admin concede horas extra o cambia límites se aplican
  // solos; la caché interna refresca del repo cada ~2 min).
  useEffect(() => {
    let alive = true;
    const apply = (cfg: PlaytimeConfig) => {
      if (!alive) return;
      setConfig((prev) => (prev && prev.version === cfg.version ? prev : cfg));
    };
    void loadPlaytimeConfig().then(apply);
    const id = setInterval(() => {
      void loadPlaytimeConfig().then(apply);
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Contador de tiempo jugado: suma mientras la pestaña está VISIBLE.
  // Cada 5 s se añade el tiempo transcurrido; si la pestaña está oculta no
  // cuenta (no es juego real). recordPlaytime notifica a los suscriptores
  // y el límite (derivado) se agota en vivo.
  useEffect(() => {
    if (!me) return;
    let lastTick = Date.now();
    const tick = () => {
      const now = Date.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;
      if (document.hidden) return; // tiempo oculto: no cuenta
      if (delta <= 0 || delta > 60) return; // descartar saltos raros (suspensión)
      recordPlaytime(me.id, game.id, delta);
    };
    const onVis = () => {
      // Al volver a ser visible, reanudar el conteo desde ahora
      lastTick = Date.now();
    };
    const id = setInterval(tick, TRACK_TICK_MS);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [me?.id, game.id]);

  // Avisos únicos al acercarse al límite (15 y 5 minutos)
  useEffect(() => {
    if (!limit?.active || limit.remainingMin === null) return;
    const r = limit.remainingMin;
    const warn = (key: string, msg: string) => {
      if (warnedRef.current.has(key)) return;
      warnedRef.current.add(key);
      toast({ description: msg });
    };
    if (r <= 15 && r > 5) warn("15", "Te quedan menos de 15 minutos de juego este mes ⏳");
    if (r <= 5 && r > 0) warn("5", "Últimos minutos de juego del mes ⏳");
  }, [limit, toast]);

  const toggleFullscreen = () => {
    if (!frameRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void frameRef.current.requestFullscreen();
    }
  };

  const isFavorite = favorites.includes(game.id);

  const chipLabel = useMemo(() => {
    if (!limit) return "";
    if (limit.exempt) return "Sin límite";
    if (!limit.active) return `Hoy: ${formatDuration(todaySec)}`;
    if (limit.remainingMin === null) return `Hoy: ${formatDuration(todaySec)}`;
    return `Restan ${formatDuration(limit.remainingMin * 60)} este mes`;
  }, [limit, todaySec]);

  return (
    <motion.main
      key="game-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="relative z-10 flex flex-1 flex-col"
    >
      {/* Game toolbar */}
      <div className="sticky top-16 z-40 border-b border-white/10 bg-[#050505]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Volver</span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold tracking-wide text-white sm:text-base">
              {game.title.toUpperCase()}
            </p>
            <p className="truncate text-xs text-white/45">{game.tagline}</p>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Chip de tiempo jugado / restante */}
            {me && chipLabel && (
              <span
                className={`mr-1 hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold sm:inline-flex ${remainingChipClass(
                  limit?.active ? limit.remainingMin : null
                )}`}
                title={
                  limit?.active && limit.limitMin != null
                    ? `Límite mensual: ${Math.round(limit.limitMin + limit.bonusMin)} min · jugados ${Math.round(limit.usedMin)} min`
                    : "Fase de observación: se está midiendo cuánto juegas"
                }
              >
                {limit?.active ? (
                  limit.remainingMin !== null && limit.remainingMin <= 15 ? (
                    <AlarmClock className="h-3.5 w-3.5" />
                  ) : (
                    <Hourglass className="h-3.5 w-3.5" />
                  )
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
                {chipLabel}
              </span>
            )}
            <ControlButton
              label={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              onClick={() => onToggleFavorite(game.id)}
              active={isFavorite}
            >
              <Heart className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} />
            </ControlButton>
            <ControlButton label="Reiniciar juego" onClick={reloadGame}>
              <RotateCcw className="h-4 w-4" />
            </ControlButton>
            <ControlButton
              label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </ControlButton>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-4 sm:px-6">
        {/* Game frame: el juego se abre DENTRO de la página */}
        <div
          ref={frameRef}
          className="relative h-[calc(100dvh-215px)] min-h-[430px] w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black"
        >
          {blocked ? (
            /* Pantalla de tiempo agotado: sustituye al iframe (el juego se
               detiene de verdad porque se desmonta) */
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 overflow-hidden bg-[#080808] px-6 text-center">
              <Image
                src={asset(game.cover)}
                alt=""
                fill
                sizes="100vw"
                aria-hidden
                className="object-cover opacity-10 blur-md"
              />
              <div className="relative flex flex-col items-center gap-4">
                <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-red-500/30 bg-red-500/10 text-red-400 shadow-xl shadow-red-500/10">
                  <Hourglass className="h-10 w-10" />
                </span>
                <h2 className="font-display text-2xl font-bold tracking-wide text-white">
                  SE ACABÓ TU TIEMPO DE ESTE MES
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-white/60">
                  Has jugado <b className="text-white">{formatDuration(limit?.usedMin * 60 ?? 0)}</b>{" "}
                  de tu tope mensual de{" "}
                  <b className="text-white">
                    {formatDuration((limit?.limitMin ?? 0) * 60)}
                    {limit?.bonusMin ? ` (+${formatDuration(limit.bonusMin * 60)} extra)` : ""}
                  </b>
                  . Vuelve el próximo mes para seguir jugando.
                </p>
                <p className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/50">
                  <CalendarClock className="h-3.5 w-3.5 text-amber-400/80" />
                  Tu tiempo se renueva el{" "}
                  {new Date(
                    Number(new Date().getFullYear()),
                    new Date().getMonth() + 1,
                    1
                  ).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300 active:scale-95"
                >
                  Volver al inicio
                </button>
              </div>
            </div>
          ) : (
            <>
              <iframe
                key={iframeKey}
                src={game.url}
                title={game.title}
                onLoad={() => setLoaded(true)}
                className="h-full w-full border-0"
                allow="fullscreen; autoplay; gamepad *; clipboard-write"
                allowFullScreen
              />

              {/* Loading overlay */}
              {!loaded && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 overflow-hidden bg-[#080808]">
                  <Image
                    src={asset(game.cover)}
                    alt=""
                    fill
                    sizes="100vw"
                    aria-hidden
                    className="object-cover opacity-15 blur-md"
                  />
                  <div className="relative flex flex-col items-center gap-4">
                    <span className="relative h-16 w-16 overflow-hidden rounded-2xl border border-amber-400/40 shadow-xl shadow-amber-500/25">
                      <Image
                        src={asset("/logo-emblem.png")}
                        alt="Logotipo de AXC GAMES"
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </span>
                    <div className="h-1 w-44 overflow-hidden rounded-full bg-white/10">
                      <div className="axc-loading-bar h-full w-1/3 rounded-full bg-amber-400" />
                    </div>
                    <p className="text-sm text-white/60">
                      Cargando <b className="text-white">{game.title}</b>…
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Game info */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="font-display text-lg font-bold tracking-wide">
              ACERCA DE {game.title.toUpperCase()}
            </h2>
            <p className="mt-3 leading-relaxed text-white/70">{game.longDescription}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {game.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60"
                >
                  #{tag}
                </span>
              ))}
            </div>
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
              <Keyboard className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/80" />
              <p>
                Juega con teclado y ratón; en dispositivos táctiles, simplemente toca la
                pantalla. El juego se ejecuta dentro de axcgames: si ves la pantalla oscura un
                momento, es que todavía se está cargando.
              </p>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="font-display text-sm font-bold tracking-wide text-white/90">
                FICHA DEL JUEGO
              </h3>
              <ul className="mt-4 space-y-3.5 text-sm">
                <li className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-white/50">
                    <Star className="h-4 w-4 text-amber-400" fill="currentColor" />
                    Valoración
                  </span>
                  <b className="text-white">{game.rating} / 5</b>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-white/50">
                    <Users className="h-4 w-4" />
                    Jugadores
                  </span>
                  <b className="text-white">{game.players}</b>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-white/50">
                    <Wrench className="h-4 w-4" />
                    Dificultad
                  </span>
                  <b className="text-white">{game.difficulty}</b>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-white/50">
                    <Gamepad2 className="h-4 w-4" />
                    Géneros
                  </span>
                  <b className="text-right text-white">{game.categories.join(", ")}</b>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5">
              <h3 className="font-display text-sm font-bold tracking-wide text-amber-300">
                CONSEJO PRO
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-white/65">
                Usa el botón de pantalla completa para una experiencia totalmente inmersiva y
                el de reinicio si quieres empezar la partida de cero. Todos los juegos se
                juegan aquí dentro, sin salir de axcgames.
              </p>
            </div>
          </aside>
        </div>

        {/* Related games */}
        <section className="mt-10 pb-14" aria-labelledby="related-heading">
          <h2 id="related-heading" className="mb-4 font-display text-lg font-bold tracking-wide">
            SIGUE JUGANDO
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((g, i) => (
              <GameCard
                key={g.id}
                game={g}
                index={i}
                onPlay={onPlay}
                isFavorite={favorites.includes(g.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      </div>
    </motion.main>
  );
}
