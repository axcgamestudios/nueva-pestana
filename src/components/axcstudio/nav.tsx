"use client";

/**
 * NAV del diseño axcStudios: barra fija liquid glass con marca, tabs
 * Estudio / Tienda (con candado si no hay sesión), pill de la red axc en
 * vivo (WebSocket de presencia), botón de instalación PWA y chip de cuenta
 * con menú (incluye acceso al chat de la comunidad).
 */
import { useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { MessageCircle } from "lucide-react";
import { asset } from "@/lib/paths";
import { getAxcSnapshot, subscribeAxc } from "@/lib/axc-auth";
import { useAxStore } from "@/lib/store";
import { axcToast } from "./axc-toast";
import { useInstall } from "./install";

export default function Nav({
  tab,
  onTab,
}: {
  tab: "studio" | "store";
  onTab: (t: "studio" | "store") => void;
}) {
  const axc = useSyncExternalStore(subscribeAxc, getAxcSnapshot, getAxcSnapshot);
  const me = useAxStore((s) => s.me);
  const openChat = useAxStore((s) => s.openChat);
  const openAuth = useAxStore((s) => s.openAuth);
  const logout = useAxStore((s) => s.logout);
  const { ready, promptInstall } = useInstall();
  const [menuOpen, setMenuOpen] = useState(false);
  const chipRef = useRef<HTMLDivElement | null>(null);

  // Cerrar el menú al hacer clic fuera
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen]);

  const netLabel =
    axc.ws === "online"
      ? axc.presence > 1
        ? `${axc.presence} en línea`
        : "red axc en vivo"
      : axc.ws === "connecting"
        ? "conectando…"
        : "red axc dormida";
  const netClass = axc.ws === "online" ? "on" : axc.ws === "connecting" ? "wait" : "";

  const goTab = (t: "studio" | "store") => {
    onTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="nav">
      <a
        className="brand"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          goTab("studio");
        }}
        aria-label="Inicio axcGames"
      >
        { }
        <img src={asset("/axc/logo.webp")} alt="Logo de axcGames" />
        <span className="brand-name">
          axc<em>Games</em>
        </span>
        <span className="tag">web studio</span>
      </a>

      <nav className="tabs" role="tablist" aria-label="Secciones">
        <button
          className={`tab-btn${tab === "studio" ? " active" : ""}`}
          role="tab"
          aria-selected={tab === "studio"}
          onClick={() => goTab("studio")}
        >
          Estudio
        </button>
        <button
          className={`tab-btn${tab === "store" ? " active" : ""}${me ? " unlocked" : ""}`}
          role="tab"
          aria-selected={tab === "store"}
          onClick={() => goTab("store")}
        >
          <span className="lock">🔒</span>Tienda de juegos<span className="dot-live" />
        </button>
      </nav>

      <div className="nav-right">
        <span className={`net-pill ${netClass}`} title="Red axc (WebSocket de presencia)">
          <i />
          <span>{netLabel}</span>
        </span>

        <button
          type="button"
          className={`install-btn-nav${ready ? " ready" : ""}`}
          onClick={() => void promptInstall()}
          title="Instalar axcGames como app (opcional)"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Instalar app</span>
        </button>

        <button
          type="button"
          className="install-btn-nav chat-btn-nav"
          onClick={() => openChat()}
          title="Chat de la comunidad (amigos, grupos y llamadas)"
          aria-label="Abrir el chat"
        >
          <MessageCircle size={15} strokeWidth={2.2} />
          <span>Chat</span>
        </button>

        <div id="accountChip" ref={chipRef} style={{ position: "relative" }}>
          {!me ? (
            <button
              type="button"
              className="axcui-chip"
              onClick={() => openAuth("store")}
            >
              👤 Entrar
            </button>
          ) : (
            <>
              <button
                type="button"
                className="axcui-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
              >
                <span className="axcui-ava" style={{ background: me.avatarColor }}>
                  {me.username[0]}
                </span>
                {me.username} ▾
              </button>
              {menuOpen && (
                <div className="axcui-menu open">
                  <div className="info">
                    Sesión iniciada como <b>{me.username}</b>
                    <br />
                    {axc.user?.m}
                    <br />
                    <span style={{ opacity: 0.6 }}>Cuenta válida en toda la red axc</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      openChat();
                    }}
                  >
                    💬 Abrir el chat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void logout();
                      axcToast("Sesión cerrada");
                    }}
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
