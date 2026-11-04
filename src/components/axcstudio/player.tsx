"use client";

/**
 * REPRODUCTOR EN PÁGINA del diseño axcStudios: los juegos corren DENTRO de
 * la página, a pantalla completa, con animación FLIP desde la tarjeta y
 * pantalla de carga con motion graphics (partículas, anillos, portada,
 * progreso y mensajes rotativos). Integra el registro de tiempo de juego
 * y los límites semanales del panel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hourglass } from "lucide-react";
import type { Game } from "@/lib/games";
import { asset } from "@/lib/paths";
import { useAxStore } from "@/lib/store";
import {
  evaluateLimit,
  formatMinutes,
  idleTimeoutMs,
  loadPlaytimeConfig,
  readOwn,
  recordPlaytime,
  subscribePlaytime,
  type LimitState,
  type PlaytimeConfig,
} from "@/lib/playtime";
import { axcToast } from "./axc-toast";

const TRACK_TICK_MS = 15000;

const LOAD_MSGS = [
  "Despertando el motor del juego",
  "Calibrando controles",
  "Cargando sprites y sonido",
  "Sincronizando con la red axc",
  "Últimos ajustes",
];

const PARTS = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 7.3 + 3) % 100}%`,
  dur: `${5 + (i % 5) * 1.4}s`,
  delay: `${(i * 0.45) % 4}s`,
}));

export default function Player({
  game,
  from,
  onClose,
}: {
  game: Game;
  from: HTMLElement | null;
  onClose: () => void;
}) {
  const me = useAxStore((s) => s.me);
  const [ready, setReady] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);
  const [pct, setPct] = useState(4);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  /* ---------- tiempo de juego: config + límites ---------- */
  const [config, setConfig] = useState<PlaytimeConfig | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => subscribePlaytime(() => setTick((v) => v + 1)), []);
  useEffect(() => {
    let alive = true;
    const load = () => {
      void loadPlaytimeConfig().then((cfg) => {
        if (alive) setConfig(cfg);
      });
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  const ownData = me ? readOwn(me.id) : null;
  // Derivado en cada render de los datos vivos (localStorage + config): se
  // reevalúa al registrarse tiempo (subscribePlaytime → setTick) y con config nueva.
  const limit: LimitState | null =
    me && config ? evaluateLimit(config, me.id, ownData ?? { days: {}, updatedAt: 0 }) : null;
  const blocked =
    limit !== null && limit.active && limit.remainingMin !== null && limit.remainingMin <= 0;
  usePlaytimeWarnings(limit);

  /* ---------- mensajes rotativos + progreso ---------- */
  useEffect(() => {
    const mi = window.setInterval(() => setMsgIdx((v) => (v + 1) % LOAD_MSGS.length), 1400);
    const t0 = Date.now();
    const pi = window.setInterval(() => {
      const e = Date.now() - t0;
      setPct(Math.min(92, (e / 2100) * 92 + 4));
    }, 120);
    return () => {
      window.clearInterval(mi);
      window.clearInterval(pi);
    };
  }, []);

  const finish = useCallback(() => {
    setPct(100);
    setMsgIdx(-1);
    window.setTimeout(() => setReady(true), 420);
    window.dispatchEvent(new CustomEvent("axc:pulse"));
  }, []);

  useEffect(() => {
    const to = window.setTimeout(finish, 11000); // por si el load del iframe no dispara
    return () => window.clearTimeout(to);
  }, [finish]);

  const onFrameLoad = useCallback(() => {
    window.setTimeout(finish, 1700); // tiempo mínimo de coreografía
  }, [finish]);

  /* ---------- FLIP: la portada vuela de la tarjeta al centro ---------- */
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const heroImg = hero.querySelector("img") as HTMLImageElement | null;
    if (!heroImg) return;
    const srcImg = from?.querySelector(".game-cover img") as HTMLImageElement | null;
    if (!srcImg) {
      heroImg.style.opacity = "1";
      return;
    }
    heroImg.style.opacity = "0";
    const r = srcImg.getBoundingClientRect();
    const flip = srcImg.cloneNode() as HTMLImageElement;
    flip.className = "axcplay-flip";
    flip.style.left = r.left + "px";
    flip.style.top = r.top + "px";
    flip.style.width = r.width + "px";
    flip.style.height = r.height + "px";
    document.body.appendChild(flip);
    let cancelled = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        const t = hero.getBoundingClientRect();
        flip.style.left = t.left + "px";
        flip.style.top = t.top + "px";
        flip.style.width = t.width + "px";
        flip.style.height = t.height + "px";
      }),
    );
    const rm = window.setTimeout(() => {
      flip.remove();
      heroImg.style.transition = "opacity .3s";
      heroImg.style.opacity = "1";
    }, 780);
    return () => {
      cancelled = true;
      flip.remove();
      window.clearTimeout(rm);
    };
  }, [from]);

  /* ---------- bloquear scroll del body ---------- */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ---------- ESC + pantalla completa ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleFullscreen = useCallback(() => {
    const st = stageRef.current;
    if (!st) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void st.requestFullscreen?.().catch(() => undefined);
  }, []);

  /* ---------- registro de tiempo jugado (visible + activo) ---------- */
  const idleMs = useMemo(() => idleTimeoutMs(config), [config]);
  useEffect(() => {
    if (!me) return;
    let lastTick = Date.now();
    let lastActivity = Date.now();
    const touch = () => {
      lastActivity = Date.now();
    };
    const EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const ev of EVENTS) document.addEventListener(ev, touch, { passive: true, capture: true });
    let frameDoc: Document | null = null;
    const attachFrame = () => {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (!doc || doc === frameDoc) return;
        for (const ev of EVENTS) doc.addEventListener(ev, touch, { passive: true, capture: true });
        frameDoc = doc;
      } catch {
        /* juego cross-origin: interior no observable */
      }
    };
    attachFrame();
    const tick = () => {
      const now = Date.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;
      if (document.hidden) return;
      if (delta <= 0 || delta > 60) return;
      if (idleMs > 0 && now - lastActivity >= idleMs) return; // ausente: pausa
      if (blocked) return; // límite agotado: no seguir contando
      recordPlaytime(me.id, game.id, delta);
    };
    const onVis = () => {
      lastTick = Date.now();
      lastActivity = Date.now();
    };
    const id = window.setInterval(tick, TRACK_TICK_MS);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      for (const ev of EVENTS) document.removeEventListener(ev, touch, true);
      try {
        if (frameDoc) for (const ev of EVENTS) frameDoc.removeEventListener(ev, touch, true);
      } catch {
        /* el documento interno ya no existe */
      }
    };
  }, [me?.id, game.id, idleMs, blocked, ready]);

  const genre = game.categories.slice(0, 2).join(" · ") || "Comunidad";
  const remaining =
    limit?.active && limit.remainingMin !== null ? formatMinutes(limit.remainingMin) : null;

  return (
    <div
      className={`axcplay open${ready ? " ready" : ""}`}
      role="dialog"
      aria-label={`Jugando a ${game.title}`}
    >
      <div className="axcplay-bar">
        <button className="axcplay-back glow" onClick={onClose}>
          ← Volver
        </button>
        <div className="axcplay-gt">
          { }
          <img src={asset(game.cover)} alt="" />
          <b>{game.title}</b>
          <span>{genre}</span>
        </div>
        {remaining && (
          <span
            className="axcplay-remaining"
            title="Tiempo de juego restante hoy (límite del estudio)"
          >
            <Hourglass size={13} /> {remaining}
          </span>
        )}
        <button
          className="axcplay-act glow"
          title="Pantalla completa"
          aria-label="Pantalla completa"
          onClick={toggleFullscreen}
        >
          ⛶
        </button>
      </div>
      <div className="axcplay-stage" ref={stageRef}>
        <div className={`axcplay-load${ready ? " done" : ""}`}>
          <div className="axcplay-parts" aria-hidden="true">
            {PARTS.map((p, i) => (
              <i
                key={i}
                style={{ left: p.left, animationDuration: p.dur, animationDelay: p.delay }}
              />
            ))}
          </div>
          <div className="axcplay-rings" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="axcplay-hero" ref={heroRef}>
            { }
            <img src={asset(game.cover)} alt={`Portada de ${game.title}`} />
          </div>
          <div className="axcplay-title">{game.title}</div>
          <div className="axcplay-sub">{genre} · cargando</div>
          <div className="axcplay-prog">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="axcplay-msg">
            {msgIdx === -1 ? (
              "✓ ¡Listo! ¡A jugar!"
            ) : (
              <>
                {LOAD_MSGS[msgIdx]}
                <b>…</b>
              </>
            )}
          </div>
        </div>
        <iframe
          ref={iframeRef}
          src={game.url}
          title={game.title}
          onLoad={onFrameLoad}
          allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write; microphone"
        />
        {blocked && (
          <div className="axcplay-blocked">
            <div className="axcplay-blocked-icon">⏳</div>
            <h3>Se acabó tu tiempo de juego</h3>
            <p>
              Alcanzaste tu tope semanal. Vuelve el lunes para seguir jugando, o pide minutos
              extra al estudio desde el panel.
            </p>
            <button className="btn btn-primary glow" onClick={onClose}>
              ← Volver a la tienda
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


/* aviso único al acercarse al límite (15 y 5 minutos) */
export function usePlaytimeWarnings(limit: LimitState | null) {
  const warned = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!limit?.active || limit.remainingMin === null) return;
    const key = limit.remainingMin <= 15 ? "15" : limit.remainingMin <= 5 ? "5" : "";
    if (key && !warned.current.has(key)) {
      warned.current.add(key);
      axcToast(`⏳ Te quedan ${formatMinutes(limit.remainingMin)} de juego`);
    }
  }, [limit?.remainingMin, limit?.active]);
}
