"use client";

/**
 * Instalación PWA del diseño axcStudios (OPCIONAL):
 * - Captura beforeinstallprompt y expone promptInstall()
 * - Modal liquid glass con pasos por dispositivo (desktop/android/ios)
 * - Registra el service worker en producción
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { asset } from "@/lib/paths";
import { axcToast } from "./axc-toast";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function uaDevice(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

const INSTALL_STEPS: Record<"desktop" | "android" | "ios", string[]> = {
  desktop: [
    "Es <strong>opcional</strong>: en <strong>Chrome</strong> o <strong>Edge</strong>, pulsa el icono ⤓ de la barra de direcciones y elige <strong>«Instalar página como app»</strong>.",
    "¿No lo ves? Menú <strong>⋮</strong> → <strong>«Apps» / «Instalar página como app»</strong>.",
    "La app queda en tu escritorio y menú de inicio. Todo funciona igual sin instalar: los juegos corren en la página.",
  ],
  android: [
    "Es <strong>opcional</strong>: en <strong>Chrome</strong>, toca el menú <strong>⋮</strong> arriba a la derecha.",
    "Toca <strong>«Instalar app»</strong> (o «Añadir a pantalla de inicio»).",
    "El icono se une a tus demás apps. Sin instalar, todo sigue funcionando en la página.",
  ],
  ios: [
    "Es <strong>opcional</strong>: abre la página en <strong>Safari</strong>.",
    "Toca el botón <strong>Compartir</strong> (cuadrado con flecha hacia arriba).",
    "Elige <strong>«Añadir a pantalla de inicio»</strong>. Todo funciona igual en la página sin instalar.",
  ],
};

/** Hook de instalación: estado listo + prompt nativo con fallback al modal. */
export function useInstall() {
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const [ready, setReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setReady(true);
    };
    const onInstalled = () => {
      deferred.current = null;
      setReady(false);
      setModalOpen(false);
      axcToast("🎉 App instalada. ¡Búscala en tu escritorio o pantalla de inicio!");
      window.dispatchEvent(new CustomEvent("axc:pulse"));
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const e = deferred.current;
    if (e) {
      e.prompt();
      try {
        const { outcome } = await e.userChoice;
        if (outcome === "accepted") axcToast("Instalando axcGames…");
      } catch {
        /* el usuario cerró el diálogo */
      }
      deferred.current = null;
      setReady(false);
      return;
    }
    setModalOpen(true); // sin prompt nativo: pasos manuales
  }, []);

  return { ready, promptInstall, modalOpen, closeModal: () => setModalOpen(false) };
}

/** Modal liquid glass con los pasos de instalación por dispositivo. */
export function InstallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [dev, setDev] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- detecta el dispositivo al abrir el modal
      setDev(uaDevice());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="axcui-root open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="axcui-card">
        <button className="axcui-x" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <div className="axcui-logo">
          { }
          <img src={asset("/axc/icon-512.png")} alt="" />
          <div>
            <b>Instalar axcGames</b>
            <span>opcional · app nativa del navegador</span>
          </div>
        </div>
        <div className="axcui-ok">
          Instalar es <strong>opcional</strong>: añade la página a tu escritorio como un
          programa, pero los juegos corren perfectamente aquí mismo, en la página.
        </div>
        <div className="axcui-steps">
          {INSTALL_STEPS[dev].map((t, i) => (
            <div className="axcui-step" key={i}>
              <div className="axcui-step-n">{i + 1}</div>
              { }
              <p dangerouslySetInnerHTML={{ __html: t }} />
            </div>
          ))}
        </div>
        <a
          className="axcui-btn"
          href="https://axcgamestudios.github.io/axcStudios/store.html?install=1"
          target="_blank"
          rel="noopener noreferrer"
        >
          ⚡ Ver la tienda como app independiente
        </a>
      </div>
    </div>
  );
}
