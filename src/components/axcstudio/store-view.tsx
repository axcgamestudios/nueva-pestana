"use client";

/**
 * PÁGINA 2 — TIENDA del diseño axcStudios: cabecera, candado de sesión
 * (los juegos son para miembros; detrás queda el catálogo difuminado),
 * búsqueda, chips de filtro (categorías + favoritos), "sigue jugando" y
 * grid de tarjetas. El juego corre DENTRO de la página (player overlay).
 */
import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import type { Game } from "@/lib/games";
import { allCategories } from "@/lib/games";
import { useAxStore } from "@/lib/store";
import AxcGameCard from "./game-card";

const FAV_FILTER = "★ Favoritos";

export default function StoreView({
  games,
  recentGames,
  featuredId,
  favorites,
  onToggleFavorite,
  onPlay,
  onNeedAuth,
}: {
  games: Game[];
  recentGames: Game[];
  featuredId: string | null;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onPlay: (game: Game, from: HTMLElement | null) => void;
  onNeedAuth: (tab?: "login" | "signup") => void;
}) {
  const me = useAxStore((s) => s.me);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");

  const categories = useMemo(() => {
    // categorías presentes en el catálogo (orden canónico) + favoritos
    const present = new Set(games.flatMap((g) => g.categories));
    const cats = allCategories.filter((c) => c === "Todos" || present.has(c));
    const extra = [...present].filter((c) => !cats.includes(c)).sort();
    return [...cats, ...extra, FAV_FILTER];
  }, [games]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games.filter((g) => {
      const inFilter =
        filter === "Todos"
          ? true
          : filter === FAV_FILTER
            ? favorites.includes(g.id)
            : g.categories.includes(filter);
      const inQuery =
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.categories.some((c) => c.toLowerCase().includes(q)) ||
        g.tags.some((t) => t.toLowerCase().includes(q));
      return inFilter && inQuery;
    });
  }, [games, filter, query, favorites]);

  return (
    <main id="page-store" className="page active" role="tabpanel">
      <div className="store-head">
        <div>
          <div className="section-kicker">Tienda de juegos</div>
          <h2>La tienda de axcGames</h2>
          <p className="sub">
            Inicia sesión para desbloquear el catálogo. Los juegos{" "}
            <strong>corren aquí mismo</strong>, a pantalla completa con animación de
            lanzamiento — instalar la app es <strong>opcional</strong>.
          </p>
        </div>
        <div className="hero-badges">
          <span className="hbadge glow">{games.length} juegos</span>
          <span className="hbadge glow">🔒 Se requiere sesión</span>
          <span className="hbadge glow">
            🎮 <b>Juega aquí mismo</b>
          </span>
        </div>
      </div>

      {/* Candado: catálogo con sesión */}
      {!me && (
        <div className="gate show">
          <div className="gate-icon">🔐</div>
          <h3>Los juegos son para miembros</h3>
          <p>
            Crea tu cuenta axc (usuario, correo y contraseña) o inicia sesión para desbloquear
            el catálogo completo. Tu cuenta funciona en{" "}
            <strong>todas las páginas de axcStudios</strong>.
          </p>
          <div className="gate-actions">
            <button className="btn btn-primary glow" onClick={() => onNeedAuth("signup")}>
              ✨ Crear mi cuenta
            </button>
            <button className="btn btn-ghost glow" onClick={() => onNeedAuth("login")}>
              Ya tengo cuenta
            </button>
          </div>
        </div>
      )}

      <div id="storeWrap" className={me ? "" : "locked-wrap"}>
        {/* Sigue jugando */}
        {me && recentGames.length > 0 && (
          <section aria-label="Sigue jugando" className="store-recent">
            <div className="section-kicker">Sigue jugando</div>
            <div className="games-grid recent">
              {recentGames.map((g, i) => (
                <AxcGameCard
                  key={g.id}
                  game={g}
                  index={i}
                  small
                  featured={g.id === featuredId}
                  isFavorite={favorites.includes(g.id)}
                  onToggleFavorite={onToggleFavorite}
                  onPlay={onPlay}
                />
              ))}
            </div>
          </section>
        )}

        <div className="store-tools">
          <div className="search">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              placeholder="Buscar juegos…"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar juegos"
            />
          </div>
          <div className="filter-chips" role="group" aria-label="Filtrar por categoría">
            {categories.map((c) => (
              <button
                key={c}
                className={`filter-chip glow${filter === c ? " on" : ""}`}
                onClick={() => setFilter(c)}
                aria-pressed={filter === c}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="games-grid" id="gamesGrid">
            {filtered.map((g, i) => (
              <AxcGameCard
                key={g.id}
                game={g}
                index={i}
                featured={g.id === featuredId}
                isFavorite={favorites.includes(g.id)}
                onToggleFavorite={onToggleFavorite}
                onPlay={onPlay}
              />
            ))}
          </div>
        ) : (
          <div className="store-empty">
            <span
              aria-hidden
              style={{ display: "inline-flex", marginBottom: 12, opacity: 0.5 }}
            >
              <SearchX size={36} />
            </span>
            <div>Sin resultados… prueba con otra búsqueda 🎮</div>
          </div>
        )}
      </div>
    </main>
  );
}
