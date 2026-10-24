"use client";

/**
 * Puerta de actualización de cuenta (obligatoria para jugar).
 *
 * Si el usuario con sesión iniciada intenta jugar y su cuenta aún no está
 * registrada en la base de datos compartida, se abre este modal: no puede
 * jugar hasta actualizarla (un clic, conserva usuario, contraseña e
 * historial). Así el tiempo de juego de TODOS los jugadores queda
 * registrado para el panel de administración.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudUpload, Gamepad2, Loader2, ShieldCheck, X } from "lucide-react";
import type { Game } from "@/lib/games";
import { useAxStore } from "@/lib/store";
import { migrateAccountToCloud } from "@/lib/accounts";
import { useToast } from "@/hooks/use-toast";

type Props = {
  /** Juego pendiente que se abrirá automáticamente al actualizar. */
  game: Game | null;
  onClose: () => void;
  onMigrated: (game: Game) => void;
};

export default function MigrationGate({ game, onClose, onMigrated }: Props) {
  const me = useAxStore((s) => s.me);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const migrate = async () => {
    if (!me || busy || !game) return;
    setBusy(true);
    setError("");
    try {
      const res = await migrateAccountToCloud(me.username);
      if (res.ok) {
        toast({
          title: "Cuenta actualizada",
          description: "Tu cuenta ya está en la nube: tu tiempo de juego se registrará siempre.",
        });
        onMigrated(game);
      } else {
        setError(res.error ?? "No se pudo actualizar. Revisa tu conexión e inténtalo otra vez.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {game && me && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gate-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-blue-400/25 bg-[#0c0a06]/95 shadow-2xl shadow-black"
          >
            {/* brillo superior decorativo */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-blue-400/15 to-transparent"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar y volver a los juegos"
              className="absolute right-3.5 top-3.5 z-10 rounded-full border border-white/10 p-2 text-white/40 transition hover:border-white/30 hover:text-white active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative px-7 pb-7 pt-9 sm:px-8">
              <div className="flex flex-col items-center text-center">
                <motion.span
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-400/10 shadow-xl shadow-blue-500/20"
                >
                  <CloudUpload className="h-7 w-7 text-blue-400" />
                </motion.span>
                <h2 id="gate-title" className="mt-5 font-display text-xl font-black tracking-wide text-white">
                  Actualiza tu cuenta para jugar
                </h2>
                <p className="mt-2.5 text-sm leading-relaxed text-white/60">
                  <b className="text-white/85">{game.title}</b> te espera, pero tu cuenta todavía
                  vive solo en este navegador. Actualízala a las cuentas compartidas para que tu
                  tiempo de juego quede registrado y puedas entrar desde cualquier dispositivo.
                </p>
                <p className="mt-3 flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-1.5 text-[11px] font-semibold text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Conservas tu usuario, contraseña e historial
                </p>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-300"
                >
                  {error}
                </motion.p>
              )}

              <button
                type="button"
                onClick={() => void migrate()}
                disabled={busy}
                className="axc-shine relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-blue-500 px-6 py-3.5 font-display text-sm font-bold tracking-wide text-white shadow-xl shadow-blue-500/30 transition hover:bg-blue-400 hover:shadow-blue-500/50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Gamepad2 className="h-4 w-4" />
                )}
                {busy ? "ACTUALIZANDO…" : "ACTUALIZAR Y JUGAR"}
              </button>
              <p className="mt-3.5 text-center text-[11px] leading-relaxed text-white/35">
                Es rápido y gratuito. El administrador necesita tu cuenta en la nube para llevar
                el registro del tiempo jugado.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
