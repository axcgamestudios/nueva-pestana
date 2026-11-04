"use client";

/**
 * FOOTER del diseño axcStudios: marca + copyright + navegación por pestañas.
 */
import { asset } from "@/lib/paths";

export default function FooterAxc({
  onGoStudio,
  onGoStore,
}: {
  onGoStudio: () => void;
  onGoStore: () => void;
}) {
  return (
    <footer>
      <a
        className="brand"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onGoStudio();
        }}
      >
        { }
        <img src={asset("/axc/logo.webp")} alt="Logo de axcGames" />
        axc<em>Games</em>
      </a>
      <p>© 2026 axcGames · Una cuenta para todo el universo axc</p>
      <nav>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onGoStudio();
          }}
        >
          Estudio
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onGoStore();
          }}
        >
          Tienda de juegos
        </a>
      </nav>
    </footer>
  );
}
