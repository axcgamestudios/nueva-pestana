"use client";

/**
 * Efectos globales del diseño axcStudios:
 *
 * 1. GLOW que sigue el cursor — cualquier elemento con clase .glow lleva un
 *    degradado de luz que persigue al puntero (borde + interior), delegado
 *    a document para que funcione también con contenido renderizado después.
 * 2. REVEAL — IntersectionObserver que hace aparecer (.in) los .reveal al
 *    entrar en pantalla; re-escanea cuando cambian las vistas/dependencias.
 * 3. Servicio Worker (producción) para la instalación PWA opcional.
 * 4. Puente de sesión SSO axc → store del sitio (chat, playtime, panel).
 */
import { useEffect } from "react";
import { onAxc } from "@/lib/axc-auth";
import { useAxStore } from "@/lib/store";

export function useGlow() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      let el: Element | null = null;
      try {
        el = e.target instanceof Element ? e.target.closest(".glow") : null;
      } catch {
        el = null;
      }
      if (!el) return;
      const r = el.getBoundingClientRect();
      const htmlEl = el as HTMLElement;
      htmlEl.style.setProperty("--mx", e.clientX - r.left + "px");
      htmlEl.style.setProperty("--my", e.clientY - r.top + "px");
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);
}

export function useRevealScan(deps: unknown[]) {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    const scan = () => {
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    };
    scan();
    const t = window.setTimeout(scan, 400); // re-scan tras render dinámico
    return () => {
      window.clearTimeout(t);
      io.disconnect();
    };
     
  }, deps);
}

export function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
}

/**
 * Puente AXC → store: inicia el SSO una vez y sincroniza la identidad del
 * chat/playtime con la sesión axc. Con sesión nueva (login/registro/verifi-
 * cación) recarga el perfil; al cerrar sesión limpia el estado del sitio.
 */
export function AxcSessionBridge() {
  useEffect(() => {
    const st = useAxStore.getState();
    void st.fetchMe();

    const off = onAxc("auth", (u) => {
      const s = useAxStore.getState();
      if (u) {
        // login / registro / sesión restaurada
        void s.fetchMe().then(() => {
          window.dispatchEvent(new CustomEvent("axc:pulse"));
        });
      } else if (s.me) {
        // cierre de sesión (el propio logout ya limpia el store)
        void s.logout();
      }
    });
    return off;
  }, []);
  return null;
}
