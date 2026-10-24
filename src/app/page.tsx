"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2, SearchX, ShieldCheck, Trophy, Zap } from "lucide-react";
import { allCategories, featuredGame, games, type Game } from "@/lib/games";
import { fetchCommunityGames } from "@/lib/community-games";
import { useAxStore } from "@/lib/store";
import Header from "@/components/axcgames/header";
import Hero from "@/components/axcgames/hero";
import GameCard from "@/components/axcgames/game-card";
import GameView from "@/components/axcgames/game-view";
import Footer from "@/components/axcgames/footer";
import AuthScreen from "@/components/axcgames/auth-screen";
import AnimatedBg from "@/components/axcgames/animated-bg";
import PageIntro from "@/components/axcgames/page-intro";
import NotificationWatcher from "@/components/axcgames/notification-watcher";
import ChatApp from "@/components/axcgames/chat/chat-app";
import CallLayer from "@/components/axcgames/chat/call-overlay";
import DevPanel from "@/components/axcgames/dev-panel";
import CloudSyncBanner from "@/components/axcgames/cloud-sync-banner";
import MigrationGate from "@/components/axcgames/migration-gate";
import { useToast } from "@/hooks/use-toast";
import { pushCloudStats } from "@/lib/cloud-db";
import { isAccountCloudReady } from "@/lib/accounts";
import { readOwn } from "@/lib/playtime";

const FAV_KEY = "axcgames:favorites";
const RECENT_KEY = "axcgames:recent";

const FEATURE_STRIP = [
  { icon: Zap, title: "Al instante", sub: "Sin descargas ni instalaciones" },
  { icon: ShieldCheck, title: "100% gratis", sub: "Crea tu cuenta en segundos" },
  { icon: Gamepad2, title: "Chat en vivo", sub: "Amigos, grupos y llamadas" },
  { icon: Trophy, title: "Supera tu récord", sub: "Compite contra ti mismo" },
];

export default function Home() {
  // Vista global (store) + estado local de juegos
  const view = useAxStore((s) => s.view);
  const activeGame = useAxStore((s) => s.activeGame);
  const openGame = useAxStore((s) => s.openGame);
  const goHome = useAxStore((s) => s.goHome);
  const openChat = useAxStore((s) => s.openChat);
  const fetchMe = useAxStore((s) => s.fetchMe);
  const connect = useAxStore((s) => s.connect);
  const me = useAxStore((s) => s.me);
  const meLoaded = useAxStore((s) => s.meLoaded);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [communityGames, setCommunityGames] = useState<Game[]>([]);
  // Coreografía de entrada: el contenido asciende al terminar la intro
  const [introDone, setIntroDone] = useState(false);
  const { toast } = useToast();

  // Cargar sesión al arrancar
  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  // Red de seguridad: nunca dejar el contenido oculto si la intro fallara
  useEffect(() => {
    const t = window.setTimeout(() => setIntroDone(true), 4000);
    return () => window.clearTimeout(t);
  }, []);

  // Conectar socket cuando hay usuario
  useEffect(() => {
    if (me) connect();
  }, [me, connect]);

  // Sincronización con la nube: subir datos de juego al entrar y al salir
  // (pagehide + keepalive para que no se pierda la última partida)
  useEffect(() => {
    if (!me) return;
    void pushCloudStats(me.id, readOwn(me.id), { force: true }).catch(() => {
      /* sin nube: se reintenta al jugar */
    });
    const onHide = () => {
      void pushCloudStats(me.id, readOwn(me.id), { force: true, keepalive: true }).catch(() => {
        /* última oportunidad */
      });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [me?.id]);

  // Tras login/registro desde la vista auth: si intentaba jugar a algo, abrirlo;
  // si no, ir al chat (definido tras handleOpenGame, ver más abajo)

  // Catálogo comunitario (juegos publicados desde el panel interno)
  useEffect(() => {
    let alive = true;
    fetchCommunityGames()
      .then((list) => {
        if (alive) setCommunityGames(list);
      })
      .catch(() => {
        /* sin catálogo comunitario disponible */
      });
    return () => {
      alive = false;
    };
  }, []);

  const allGames = useMemo(
    () => [...games, ...communityGames],
    [communityGames]
  );

  // Cargar favoritos y recientes desde localStorage (tras el montaje)
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
    [toast, allGames]
  );

  const openGameNow = useCallback(
    (game: Game) => {
      openGame(game);
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
    [openGame]
  );

  // Puerta de cuenta actualizada: no se juega sin estar registrado en la
  // nube (el tiempo de juego debe quedar registrado para el admin).
  const [gateGame, setGateGame] = useState<Game | null>(null);
  const gateChecking = useRef(false);

  const handleOpenGame = useCallback(
    (game: Game) => {
      // Cuenta obligatoria: sin sesión se pide entrar/registrarse y se
      // recuerda el juego para abrirlo justo después del login
      const meNow = useAxStore.getState().me;
      if (!meNow) {
        useAxStore.setState({ activeGame: game });
        useAxStore.getState().openAuth();
        return;
      }
      if (gateChecking.current) return;
      gateChecking.current = true;
      void isAccountCloudReady(meNow.username)
        .then((ready) => {
          if (ready) openGameNow(game);
          else setGateGame(game);
        })
        .catch(() => openGameNow(game))
        .finally(() => {
          gateChecking.current = false;
        });
    },
    [openGameNow]
  );

  // Tras login/registro desde la vista auth: si intentaba jugar a algo,
  // abrirlo justo después; si no, ir al chat
  useEffect(() => {
    if (me && view === "auth") {
      const pending = useAxStore.getState().activeGame;
      if (pending) {
        handleOpenGame(pending);
      } else {
        openChat();
      }
    }
  }, [me, view, openChat, handleOpenGame]);

  // ESC cierra el juego (cuando no está en pantalla completa)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && view === "game" && !document.fullscreenElement) goHome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, goHome]);

  const navigate = useCallback(
    (sectionId: string) => {
      goHome();
      window.setTimeout(() => {
        const el = document.getElementById(sectionId);
        el?.scrollIntoView({ behavior: "smooth" });
      }, 240);
    },
    [goHome]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allGames.filter((g) => {
      const inCategory = category === "Todos" || g.categories.includes(category);
      const inQuery =
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.categories.some((c) => c.toLowerCase().includes(q)) ||
        g.tags.some((t) => t.toLowerCase().includes(q));
      return inCategory && inQuery;
    });
  }, [category, query, allGames]);

  const recentGames = useMemo(
    () =>
      recent
        .map((id) => allGames.find((g) => g.id === id))
        .filter((g): g is Game => Boolean(g)),
    [recent, allGames]
  );

  const favoriteGames = useMemo(
    () =>
      favorites
        .map((id) => allGames.find((g) => g.id === id))
        .filter((g): g is Game => Boolean(g)),
    [favorites, allGames]
  );

  return (
    // bg transparente: el fondo animado (-z-10) aporta el negro base.
    // Un bg opaco aquí pintaría encima y escondería los puntos.
    <div className="flex min-h-dvh flex-col text-white">
      <AnimatedBg dim={view === "game"} />

      {/* Motion graphics de entrada (una vez por sesión) */}
      <PageIntro onDone={() => setIntroDone(true)} />

      {/* Notificaciones del chat activas en TODAS las vistas (home, juego, chat) */}
      <NotificationWatcher />

      {/* Aviso para migrar la cuenta al nuevo sistema compartido */}
      <CloudSyncBanner />

      {/* Puerta: obliga a actualizar la cuenta antes de jugar */}
      <MigrationGate
        game={gateGame}
        onClose={() => setGateGame(null)}
        onMigrated={(g) => {
          setGateGame(null);
          openGameNow(g);
        }}
      />

      <Header
        query={query}
        onQueryChange={(q) => {
          setQuery(q);
          if (view === "game") goHome();
        }}
        onGoHome={goHome}
        onNavigate={navigate}
        favoritesCount={favorites.length}
      />

      <AnimatePresence mode="wait">
        {view === "auth" ? (
          <AuthScreen key="auth" />
        ) : view === "chat" ? (
          <ChatApp key="chat" />
        ) : view === "game" && activeGame ? (
          <GameView
            key={activeGame.id}
            game={activeGame}
            others={allGames.filter((g) => g.id !== activeGame.id)}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onClose={goHome}
            onPlay={handleOpenGame}
          />
        ) : (
          <motion.main
            key="home"
            initial={{ opacity: 0, y: 22 }}
            animate={introDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 0.68, 0.32, 1] }}
            className="relative z-10 flex flex-1 flex-col"
          >
            {/* Juego destacado */}
            <Hero
              game={featuredGame}
              onPlay={handleOpenGame}
              isFavorite={favorites.includes(featuredGame.id)}
              onToggleFavorite={toggleFavorite}
              onExplore={() =>
                document.getElementById("juegos")?.scrollIntoView({ behavior: "smooth" })
              }
            />

            {/* Marquesina de juegos */}
            <section
              aria-hidden
              className="mt-8 overflow-hidden border-y border-white/5 bg-white/[0.02] py-3.5"
            >
              <div className="axc-marquee flex w-max items-center gap-12">
                {[...allGames, ...allGames].map((g, i) => (
                  <span
                    key={`${g.id}-mq-${i}`}
                    className="flex items-center gap-12 whitespace-nowrap font-display text-xs font-bold uppercase tracking-[0.2em] text-white/40"
                  >
                    {g.title}
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400/60" />
                  </span>
                ))}
              </div>
            </section>

            {/* Ventajas */}
            <section
              aria-label="Ventajas de axcgames"
              className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:px-8"
            >
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {FEATURE_STRIP.map(({ icon: Icon, title, sub }) => (
                  <motion.div
                    key={title}
                    whileHover={{ y: -5, scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 320, damping: 20 }}
                    className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition-colors hover:border-blue-400/30 hover:bg-white/[0.06] hover:shadow-lg hover:shadow-blue-500/10"
                  >
                    <motion.span
                      whileHover={{ rotate: -8, scale: 1.12 }}
                      transition={{ type: "spring", stiffness: 320, damping: 14 }}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-400/10 text-blue-400 shadow-inner shadow-blue-500/10 transition-colors group-hover:bg-blue-400/20"
                    >
                      <Icon className="h-5 w-5" />
                    </motion.span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{title}</p>
                      <p className="truncate text-xs text-white/45">{sub}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* Continúa jugando */}
            {recentGames.length > 0 && (
              <section
                aria-labelledby="recent-heading"
                className="mx-auto w-full max-w-7xl px-4 pt-10 sm:px-6 lg:px-8"
              >
                <h2
                  id="recent-heading"
                  className="flex items-center gap-3 font-display text-lg font-bold tracking-wide"
                >
                  <span
                    aria-hidden
                    className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-300 to-blue-500 shadow-md shadow-blue-500/40"
                  />
                  CONTINÚA JUGANDO
                </h2>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {recentGames.map((g, i) => (
                    <GameCard
                      key={g.id}
                      game={g}
                      index={i}
                      onPlay={handleOpenGame}
                      isFavorite={favorites.includes(g.id)}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Favoritos */}
            {favoriteGames.length > 0 && (
              <section
                id="favoritos"
                aria-labelledby="favorites-heading"
                className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pt-10 sm:px-6 lg:px-8"
              >
                <h2
                  id="favorites-heading"
                  className="flex items-center gap-3 font-display text-lg font-bold tracking-wide"
                >
                  <span
                    aria-hidden
                    className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-300 to-blue-500 shadow-md shadow-blue-500/40"
                  />
                  TUS FAVORITOS
                </h2>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {favoriteGames.map((g, i) => (
                    <GameCard
                      key={g.id}
                      game={g}
                      index={i}
                      onPlay={handleOpenGame}
                      isFavorite={favorites.includes(g.id)}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Catálogo */}
            <section
              id="juegos"
              aria-labelledby="games-heading"
              className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pb-16 pt-12 sm:px-6 lg:px-8"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id="games-heading"
                    className="flex items-center gap-3 font-display text-xl font-bold tracking-wide sm:text-2xl"
                  >
                    <span
                      aria-hidden
                      className="h-6 w-1 rounded-full bg-gradient-to-b from-blue-300 to-blue-500 shadow-md shadow-blue-500/40"
                    />
                    TODOS LOS JUEGOS
                  </h2>
                  <p className="mt-1 text-sm text-white/45">
                    {filtered.length} {filtered.length === 1 ? "juego" : "juegos"}
                    {category !== "Todos" ? ` en ${category.toLowerCase()}` : ""}
                    {query.trim() ? ` para «${query.trim()}»` : ""}
                  </p>
                </div>
                {!me && meLoaded && (
                  <button
                    type="button"
                    onClick={() => useAxStore.getState().openAuth()}
                    className="rounded-full border border-blue-400/40 bg-blue-400/10 px-4 py-2 text-xs font-bold text-blue-300 transition hover:bg-blue-400/20"
                  >
                    Crea tu cuenta para jugar y chatear
                  </button>
                )}
              </div>

              {/* Categorías */}
              <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
                {allCategories.map((cat) => (
                  <motion.button
                    key={cat}
                    type="button"
                    layout
                    onClick={() => setCategory(cat)}
                    aria-pressed={category === cat}
                    whileTap={{ scale: 0.94 }}
                    className={`relative rounded-full border px-4 py-2 text-sm font-semibold ${
                      category === cat
                        ? "border-transparent text-white"
                        : "border-white/10 bg-white/5 text-white/65 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    {category === cat && (
                      <motion.span
                        layoutId="cat-pill"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-full bg-blue-500 shadow-lg shadow-blue-500/30"
                      />
                    )}
                    <span className="relative">{cat}</span>
                  </motion.button>
                ))}
              </div>

              {/* Grid de juegos */}
              {filtered.length > 0 ? (
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {filtered.map((g, i) => (
                    <GameCard
                      key={g.id}
                      game={g}
                      index={i}
                      onPlay={handleOpenGame}
                      isFavorite={favorites.includes(g.id)}
                      onToggleFavorite={toggleFavorite}
                      priority={i < 2}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                    <SearchX className="h-8 w-8 text-white/40" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold tracking-wide">
                    SIN RESULTADOS
                  </h3>
                  <p className="mt-2 max-w-sm text-sm text-white/50">
                    No encontramos juegos para «{query.trim()}». Prueba con otro término o
                    explora todas las categorías.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setCategory("Todos");
                    }}
                    className="mt-5 rounded-full bg-blue-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-400 active:scale-95"
                  >
                    Ver todos los juegos
                  </button>
                </div>
              )}
            </section>

            <Footer onNavigate={navigate} />
          </motion.main>
        )}
      </AnimatePresence>

      {/* Llamadas activas (sobre cualquier vista) */}
      {me && <CallLayer />}

      <DevPanel />
    </div>
  );
}
