"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Game } from "@/lib/games";
import { featuredGame, games } from "@/lib/games";
import { fetchCommunityGames } from "@/lib/community-games";
import { fetchOfficialOverrides, applyOverride, type GameOverrides } from "@/lib/official-overrides";
import { fetchSiteConfig } from "@/lib/site-config";
import { useAxStore } from "@/lib/store";
import ChatApp from "@/components/axcgames/chat/chat-app";
import CallLayer from "@/components/axcgames/chat/call-overlay";
import DevPanel from "@/components/axcgames/dev-panel";
import NotificationWatcher from "@/components/axcgames/notification-watcher";
import { useToast } from "@/hooks/use-toast";

import Preloader from "@/components/axcstudio/preloader";
import Bg3d from "@/components/axcstudio/bg3d";
import Nav from "@/components/axcstudio/nav";
import Studio from "@/components/axcstudio/studio";
import StoreView from "@/components/axcstudio/store-view";
import Player from "@/components/axcstudio/player";
import AuthModal from "@/components/axcstudio/auth-modal";
import FooterAxc from "@/components/axcstudio/footer-axc";
import AxcToastPort from "@/components/axcstudio/axc-toast";
import { InstallModal, useInstall } from "@/components/axcstudio/install";
import {
  AxcSessionBridge,
  useGlow,
  useRevealScan,
  useServiceWorker,
} from "@/components/axcstudio/effects";

const FAV_KEY = "axcgames:favorites";
const RECENT_KEY = "axcgames:recent";

type Tab = "studio" | "store";

export default function Home() {
  const view = useAxStore((s) => s.view);
  const me = useAxStore((s) => s.me);
  const authOpen = useAxStore((s) => s.authOpen);
  const authContext = useAxStore((s) => s.authContext);
  const authTab = useAxStore((s) => s.authTab);
  const openChat = useAxStore((s) => s.openChat);
  const fetchMe = useAxStore((s) => s.fetchMe);
  const connect = useAxStore((s) => s.connect);
  const { toast } = useToast();

  /* ---------- pestaña activa (Estudio / Tienda) con URL ?tab= ---------- */
  const [tab, setTab] = useState<Tab>("studio");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidrata la pestaña desde la URL al montar
    if (t === "studio" || t === "store") setTab(t);
  }, []);
  const goTab = useCallback((t: Tab) => {
    setTab(t);
    try {
      window.history.replaceState(null, "", window.location.pathname + "?tab=" + t);
    } catch {
      /* sin history */
    }
  }, []);

  /* ---------- efectos globales del diseño ---------- */
  useGlow();
  useServiceWorker();
  useRevealScan([tab, view]);

  /* ---------- catálogo: oficiales (con ediciones) + comunidad ---------- */
  const [communityGames, setCommunityGames] = useState<Game[]>([]);
  const [officialOverrides, setOfficialOverrides] = useState<GameOverrides>({});
  const [featuredId, setFeaturedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCommunityGames()
      .then((list) => {
        if (alive) setCommunityGames(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchSiteConfig()
      .then((cfg) => {
        if (alive) setFeaturedId(cfg.featuredId);
      })
      .catch(() => undefined);
    fetchOfficialOverrides()
      .then((o) => {
        if (alive) setOfficialOverrides(o);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const allGames = useMemo(() => {
    const official = games.map((g) => applyOverride(g, officialOverrides));
    return [...official, ...communityGames];
  }, [officialOverrides, communityGames]);

  /* ---------- favoritos y recientes ---------- */
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
      const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratar preferencias persistidas al montar
      if (Array.isArray(f)) setFavorites(f);
      if (Array.isArray(r)) setRecent(r);
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  const recentGames = useMemo(
    () =>
      recent
        .map((id) => allGames.find((g) => g.id === id))
        .filter((g): g is Game => Boolean(g))
        .slice(0, 4),
    [recent, allGames],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      setFavorites((prev) => {
        const isFav = prev.includes(id);
        const next = isFav ? prev.filter((x) => x !== id) : [...prev, id];
        try {
          localStorage.setItem(FAV_KEY, JSON.stringify(next));
        } catch {
          /* ignorar */
        }
        const g = allGames.find((x) => x.id === id);
        toast({
          description: isFav
            ? `${g?.title ?? "Juego"} eliminado de favoritos`
            : `${g?.title ?? "Juego"} añadido a favoritos`,
        });
        return next;
      });
    },
    [toast, allGames],
  );

  /* ---------- sesión SSO axc + red ---------- */
  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);
  useEffect(() => {
    if (me) connect();
  }, [me, connect]);

  /* ---------- reproductor (overlay) ---------- */
  const [playing, setPlaying] = useState<{ game: Game; from: HTMLElement | null } | null>(null);

  const handlePlay = useCallback(
    (game: Game, from: HTMLElement | null) => {
      const meNow = useAxStore.getState().me;
      if (!meNow) {
        // sin sesión: pedir cuenta y recordar el juego para abrirlo después
        useAxStore.setState({ activeGame: game });
        useAxStore.getState().openAuth("play");
        return;
      }
      setPlaying({ game, from });
      setRecent((prev) => {
        const next = [game.id, ...prev.filter((r) => r !== game.id)].slice(0, 4);
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        } catch {
          /* ignorar */
        }
        return next;
      });
    },
    [],
  );

  const closePlayer = useCallback(() => {
    setPlaying(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  /* ---------- tras iniciar sesión: retomar lo pendiente ---------- */
  const wasAuthOpen = useRef(false);
  useEffect(() => {
    if (authOpen) {
      wasAuthOpen.current = true;
      return;
    }
    if (!wasAuthOpen.current) return;
    wasAuthOpen.current = false;
    if (!me) return;
    const pending = useAxStore.getState().activeGame;
    if (pending) {
      useAxStore.setState({ activeGame: null });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lanza el juego pendiente tras el login (flujo único de reanudación)
      handlePlay(pending, null);
    } else if (authContext === "chat") {
      openChat();
    }
     
  }, [authOpen, me, authContext, openChat, handlePlay]);

  /* ---------- instalación PWA ---------- */
  const { promptInstall, modalOpen, closeModal } = useInstall();

  /* ---------- render ---------- */
  const featured = allGames.find((g) => g.id === featuredId) ?? featuredGame;

  return (
    <div className="axc-app">
      {/* Fondo 3D épico (galaxia + marea + poliedros) con aurora y viñeta */}
      <Bg3d />

      {/* Preloader de motion graphics (una vez por carga) */}
      <Preloader onDone={() => undefined} />

      {/* Puente de sesión SSO axc ↔ chat */}
      <AxcSessionBridge />

      {/* Notificaciones del chat activas en TODAS las vistas */}
      <NotificationWatcher />

      {/* NAV con tabs Estudio / Tienda + red + install + cuenta */}
      <Nav tab={tab} onTab={goTab} />

      {view === "chat" ? (
        <ChatApp />
      ) : (
        <>
          {tab === "studio" ? (
            <Studio
              gamesCount={allGames.length}
              onGoStore={() => goTab("store")}
              onInstall={() => void promptInstall()}
            />
          ) : (
            <StoreView
              games={allGames}
              recentGames={recentGames}
              featuredId={featured.id}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onPlay={handlePlay}
              onNeedAuth={(tab) => useAxStore.getState().openAuth("store", tab)}
            />
          )}
          <FooterAxc onGoStudio={() => goTab("studio")} onGoStore={() => goTab("store")} />
        </>
      )}

      {/* Reproductor: el juego corre DENTRO de la página (overlay FLIP) */}
      {playing && (
        <Player key={playing.game.id} game={playing.game} from={playing.from} onClose={closePlayer} />
      )}

      {/* Modal de cuentas axc (liquid glass, SSO compartido con axcStudios) */}
      <AuthModal
        open={authOpen}
        initialTab={authTab}
        onClose={() => useAxStore.getState().closeAuth()}
      />

      {/* Modal de instalación PWA (opcional) */}
      <InstallModal open={modalOpen} onClose={closeModal} />

      {/* Toast liquid glass del diseño */}
      <AxcToastPort />

      {/* Llamadas activas (sobre cualquier vista) */}
      {me && <CallLayer />}

      {/* Panel de administración (jkl) */}
      <DevPanel />
    </div>
  );
}
