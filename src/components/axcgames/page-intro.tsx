"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const KEY = "axcg:intro-v1";

/** useLayoutEffect en cliente (antes del paint) / useEffect en SSR sin warning */
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Fase de la intro:
 * - check  → decidiendo si toca reproducirla (antes del primer paint)
 * - play   → animación en curso
 * - exit   → apertura de paneles (revela la página)
 * - gone   → desmontada
 */
type Phase = "check" | "play" | "exit" | "gone";

/** Puntitos de la fila (misma identidad visual que el fondo) */
const DOT_COUNT = 13;
const LETTERS = "AXC GAMES".split("");

/**
 * Animación de entrada de la página (motion graphics):
 * 0.0s  fila de puntos azules/blancos que brotan y ondulan
 * 0.45s marca "AXC GAMES" sube letra a letra
 * 0.95s línea azul que se dibuja + lema
 * 1.95s el contenido se disuelve y dos paneles negros se abren
 *       revelando la página, cuyo contenido asciende a continuación.
 *
 * - Se reproduce UNA vez por sesión (sessionStorage)
 * - Se salta con clic / tecla / toque
 * - Respeta prefers-reduced-motion (no se reproduce)
 */
export default function PageIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("check");
  const doneRef = useRef(false);
  const timers = useRef<number[]>([]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      /* modo privado: se reproduce de nuevo, no pasa nada */
    }
    for (const id of timers.current) window.clearTimeout(id);
    onDone();
  }, [onDone]);

  // Decide ANTES del primer paint (evita un parpadeo de la página trasera)
  useIsoLayoutEffect(() => {
    let already = false;
    try {
      already = window.sessionStorage.getItem(KEY) !== null;
    } catch {
      already = false;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (already || reduced) {
      finish();
      return;
    }
    setPhase("play");
    timers.current.push(
      window.setTimeout(() => setPhase("exit"), 1950),
      window.setTimeout(() => {
        setPhase("gone");
        finish();
      }, 2580)
    );
  }, [finish]);

  // Salto interactivo: clic, tecla o toque
  useEffect(() => {
    if (phase !== "play" && phase !== "exit") return;
    const skip = () => {
      setPhase("gone");
      finish();
    };
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [phase, finish]);

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    []
  );

  if (phase === "check" || phase === "gone") return null;

  const exiting = phase === "exit";

  return (
    <div className="fixed inset-0 z-[100] select-none" aria-hidden>
      {/* Paneles negro puro que se abren como cortinas al final */}
      <motion.div
        className="absolute inset-x-0 top-0 h-[50.5%] bg-black"
        initial={false}
        animate={{ y: exiting ? "-101%" : "0%" }}
        transition={{ duration: 0.62, ease: [0.83, 0, 0.17, 1] }}
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 h-[50.5%] bg-black"
        initial={false}
        animate={{ y: exiting ? "101%" : "0%" }}
        transition={{ duration: 0.62, ease: [0.83, 0, 0.17, 1] }}
      />

      {/* Contenido central */}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center gap-7 px-6"
        initial={false}
        animate={
          exiting
            ? { opacity: 0, y: -18, scale: 1.05, filter: "blur(8px)" }
            : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
        }
        transition={{ duration: 0.32, ease: "easeIn" }}
      >
        {/* Fila de puntitos que brotan del centro y ondulan */}
        <div className="flex items-center gap-2.5">
          {Array.from({ length: DOT_COUNT }, (_, i) => (
            <motion.span
              key={i}
              className="block"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.06 + Math.abs(i - (DOT_COUNT - 1) / 2) * 0.05, duration: 0.32, ease: [0.22, 0.68, 0.32, 1] }}
            >
              <motion.span
                className="block h-1.5 w-1.5 rounded-full"
                style={{ background: i % 4 === 2 ? "#ffffff" : "#60a5fa" }}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 1.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.07 }}
              />
            </motion.span>
          ))}
        </div>

        {/* Marca letra a letra, enmascarada para que "suba" */}
        <div className="overflow-hidden py-1">
          <div className="flex">
            {LETTERS.map((ch, i) => (
              <motion.span
                key={i}
                className={`font-display text-2xl font-extrabold tracking-[0.16em] sm:text-4xl ${
                  i > 3 ? "text-blue-400" : "text-white"
                }`}
                initial={{ y: "115%" }}
                animate={{ y: 0 }}
                transition={{ delay: 0.42 + i * 0.05, duration: 0.55, ease: [0.22, 0.68, 0.32, 1] }}
              >
                {ch === " " ? "\u00A0" : ch}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Línea azul que se dibuja desde el centro */}
        <motion.div
          className="h-px w-44 bg-gradient-to-r from-transparent via-blue-400 to-transparent"
          style={{ transformOrigin: "center" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.95, duration: 0.55, ease: [0.22, 0.68, 0.32, 1] }}
        />

        {/* Lema */}
        <motion.p
          className="font-mono text-[10px] uppercase tracking-[0.45em] text-blue-200/70 sm:text-xs"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.45, ease: "easeOut" }}
        >
          juegos · chat · amigos
        </motion.p>
      </motion.div>

      {/* Pista de salto */}
      <motion.span
        className="absolute bottom-8 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3, duration: 0.5 }}
      >
        toca para saltar
      </motion.span>
    </div>
  );
}
