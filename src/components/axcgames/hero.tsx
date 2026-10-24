"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronDown, Flame, Heart, Play, Star, Users } from "lucide-react";
import type { Game } from "@/lib/games";
import { asset } from "@/lib/paths";
type Props = {
  game: Game;
  onPlay: (game: Game) => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onExplore: () => void;
};

export default function Hero({
  game,
  onPlay,
  isFavorite,
  onToggleFavorite,
  onExplore,
}: Props) {
  return (
    <section
      id="inicio"
      className="relative mx-auto w-full max-w-7xl scroll-mt-24 px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative rounded-3xl p-[1.5px]"
      >
        {/* Borde dorado giratorio (se asoma por el padding de 1.5px) */}
        <div
          aria-hidden
          className="axc-spin-slow absolute inset-[-150%]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(96,165,250,0.0) 40deg, rgba(96,165,250,0.65) 60deg, rgba(253,230,138,0.9) 70deg, rgba(96,165,250,0.65) 80deg, transparent 100deg, transparent 180deg, rgba(96,165,250,0.35) 220deg, transparent 250deg)",
          }}
        />
        {/* Base tenue del borde (siempre visible) */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-3xl border border-white/10"
        />

        <div className="relative h-[500px] w-full overflow-hidden rounded-[calc(1.5rem-1.5px)] bg-[#000] shadow-2xl shadow-black">
          <Image
            src={asset(game.cover)}
            alt={`Portada de ${game.title}`}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* Legibility overlays */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#000] via-[#000]/75 to-[#000]/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#000] via-transparent to-[#000]/40" />

          {/* Marca de agua del logo AXC GAMES (encima de los degradados) */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-[2%] top-1/2 hidden w-[300px] -translate-y-1/2 select-none md:block xl:w-[380px]"
          >
            <div className="axc-float opacity-80 mix-blend-screen">
              <Image
                src={asset("/logo-full.png")}
                alt=""
                width={380}
                height={380}
                sizes="380px"
                className="h-auto w-full drop-shadow-[0_0_35px_rgba(96,165,250,0.35)]"
              />
            </div>
          </div>

          {/* Content */}
          <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 lg:p-14">
            <div className="max-w-2xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <motion.span
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-500 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-white shadow-lg shadow-blue-500/40"
                >
                  <Flame className="h-3.5 w-3.5" fill="currentColor" />
                  Destacado
                </motion.span>
                <span className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white/80 backdrop-blur">
                  {game.categories.join(" · ")}
                </span>
              </div>

              <h1 className="font-display text-3xl font-extrabold leading-[1.08] sm:text-4xl lg:text-5xl">
                <span className="axc-text-shimmer">{game.title.toUpperCase()}</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
                {game.description}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/70">
                <span className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 text-blue-400" fill="currentColor" />
                  <b className="text-white">{game.rating}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-white/50" />
                  {game.players} jugadores
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="axc-pulse h-2 w-2 rounded-full bg-blue-500" />
                  Juega al instante
                </span>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <motion.button
                  type="button"
                  onClick={() => onPlay(game)}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className="axc-shine axc-glow relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-blue-500 px-7 py-3.5 font-display text-sm font-bold text-white"
                >
                  <Play className="h-4 w-4" fill="currentColor" />
                  JUGAR AHORA
                </motion.button>
                <motion.button
                  type="button"
                  onClick={onExplore}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/85 backdrop-blur transition hover:border-white/35 hover:bg-white/10"
                >
                  Explorar juegos
                  <motion.span
                    animate={{ y: [0, 4, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.span>
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => onToggleFavorite(game.id)}
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.88 }}
                  aria-label={
                    isFavorite
                      ? `Quitar ${game.title} de favoritos`
                      : `Añadir ${game.title} a favoritos`
                  }
                  className="rounded-full border border-white/15 bg-white/5 p-3.5 text-white/80 backdrop-blur transition hover:border-blue-400/60 hover:text-blue-400 hover:shadow-lg hover:shadow-blue-500/20"
                >
                  <Heart
                    className="h-5 w-5"
                    fill={isFavorite ? "#60a5fa" : "none"}
                    color={isFavorite ? "#60a5fa" : "currentColor"}
                  />
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
