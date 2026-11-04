"use client";

/**
 * Tarjeta de juego del diseño axcStudios: portada con badge "axc Badge"
 * para el destacado, género, título, descripción, botón Jugar + tag GRATIS
 * y corazón de favoritos. La portada se pasa al player para la animación
 * FLIP (vuela de aquí al centro).
 */
import { forwardRef, useMemo, type RefObject } from "react";
import { Heart } from "lucide-react";
import type { Game } from "@/lib/games";
import { asset } from "@/lib/paths";

const AxcGameCard = forwardRef<
  HTMLDivElement,
  {
    game: Game;
    index: number;
    featured?: boolean;
    isFavorite: boolean;
    onToggleFavorite: (id: string) => void;
    onPlay: (game: Game, from: HTMLElement | null) => void;
    small?: boolean;
  }
>(function AxcGameCard(
  { game, index, featured, isFavorite, onToggleFavorite, onPlay, small },
  ref,
) {
  const genre = useMemo(
    () => game.categories.slice(0, 2).join(" · ") || "Comunidad",
    [game.categories],
  );

  return (
    <article
      className="game-card glow"
      data-cat={game.categories[0] ?? ""}
      ref={ref}
      style={{
        animation: `axc-in .6s cubic-bezier(.16,1,.3,1) ${Math.min(index * 0.04, 0.5)}s backwards`,
      }}
    >
      <div className="game-cover">
        {featured && (
          <span className="badge">
            <svg viewBox="0 0 24 24">
              <path d="M12 2l2.9 6.26L21.5 9.3l-4.75 4.4 1.15 6.55L12 17.1l-5.9 3.15L7.25 13.7 2.5 9.3l6.6-1.04L12 2z" />
            </svg>
            axc Badge
          </span>
        )}
        <button
          type="button"
          className={`fav-btn${isFavorite ? " on" : ""}`}
          onClick={() => onToggleFavorite(game.id)}
          title={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
          aria-label={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
        >
          <Heart size={14} strokeWidth={2.4} fill={isFavorite ? "currentColor" : "none"} />
        </button>
        { }
        <img
          src={asset(game.cover)}
          alt={`Portada de ${game.title}`}
          loading={index < 4 ? "eager" : "lazy"}
          width={675}
          height={900}
        />
      </div>
      <div className="game-body">
        <div className="game-genre">{genre}</div>
        <div className="game-title">{game.title}</div>
        {!small && (
          <p className="game-desc">{game.description || game.tagline}</p>
        )}
        <div className="game-actions">
          <button
            className="btn-play glow"
            title={`Jugar a ${game.title}`}
            onClick={(e) => onPlay(game, e.currentTarget.closest(".game-card"))}
          >
            <svg viewBox="0 0 24 24">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>{" "}
            Jugar
          </button>
          <span className="free-tag">GRATIS</span>
        </div>
      </div>
    </article>
  );
});

export default AxcGameCard;
