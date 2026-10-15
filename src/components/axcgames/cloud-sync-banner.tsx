"use client";

/**
 * Banner de migración a la base de datos compartida.
 *
 * Con el nuevo sistema de cuentas compartidas, cada jugador debe estar
 * registrado en la nube para que el panel de administración vea su tiempo
 * de juego. Las cuentas creadas ANTES de este sistema solo existían en el
 * navegador donde se crearon, así que al detectar una sesión local que
 * aún no está en la nube se muestra este aviso con un botón para migrar
 * (mantiene usuario, contraseña y todo el tiempo jugado).
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CloudUpload, Loader2, X } from "lucide-react";
import { useAxStore } from "@/lib/store";
import { migrateAccountToCloud } from "@/lib/accounts";
import { fetchRegistry } from "@/lib/cloud-db";
import { useToast } from "@/hooks/use-toast";

const DISMISS_KEY = "axcgames:cloud-banner-dismissed";

export default function CloudSyncBanner() {
  const me = useAxStore((s) => s.me);
  const { toast } = useToast();

  type Visibility = "checking" | "needed" | "hidden";
  const [visibility, setVisibility] = useState<Visibility>("hidden");
  const [busy, setBusy] = useState(false);

  // Comprobar (una vez por usuario) si la cuenta con sesión está en la nube
  useEffect(() => {
    if (!me) {
      setVisibility("hidden");
      return;
    }
    let alive = true;
    setVisibility("checking");
    fetchRegistry(8000).then((reg) => {
      if (!alive) return;
      // Si la nube no responde no molestar: se reintenta en la próxima visita
      if (!reg) {
        setVisibility("hidden");
        return;
      }
      if (reg.users[me.username]) {
        setVisibility("hidden");
        return;
      }
      // ¿El usuario lo descartó ya en esta sesión del navegador?
      let dismissed = false;
      try {
        dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        /* sin sessionStorage */
      }
      setVisibility(dismissed ? "hidden" : "needed");
    });
    return () => {
      alive = false;
    };
  }, [me?.id]);

  const migrate = useCallback(async () => {
    if (!me || busy) return;
    setBusy(true);
    try {
      const res = await migrateAccountToCloud(me.username);
      if (res.ok) {
        setVisibility("hidden");
        toast({
          title: "Cuenta migrada",
          description:
            "Tu cuenta y tu tiempo de juego ya están en la nube: el panel de administración te verá siempre, y puedes entrar desde cualquier dispositivo.",
        });
      } else {
        toast({
          title: "No se pudo migrar",
          description: res.error ?? "Revisa tu conexión e inténtalo de nuevo.",
        });
      }
    } finally {
      setBusy(false);
    }
  }, [me, busy, toast]);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sin sessionStorage */
    }
    setVisibility("hidden");
  }, []);

  if (visibility !== "needed" || !me) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 260 }}
        className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-3 sm:px-4 sm:pb-4"
        role="alert"
      >
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-[#161006]/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-400">
            <CloudUpload className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-200">
              {me.displayName}, actualiza tu cuenta al nuevo sistema
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-white/60">
              Ahora hay cuentas compartidas: tu tiempo de juego se registra para todos y podrás
              entrar desde cualquier dispositivo. Migra en un clic (conservas tu usuario,
              contraseña e historial de juego).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void migrate()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold tracking-wide text-black shadow-lg shadow-amber-400/20 transition hover:bg-amber-300 active:scale-95 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {busy ? "Migrando…" : "Migrar cuenta"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Recordarme más tarde"
              className="rounded-xl border border-white/10 p-2.5 text-white/45 transition hover:border-white/25 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
