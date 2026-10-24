/**
 * Juegos comunitarios (subidos desde el panel de desarrollador).
 *
 * El catálogo vive en public/data/community-games.json dentro del repo,
 * por lo que es servido por GitHub Pages tras cada reconstrucción.
 * Para ver los cambios al instante se intenta primero el raw de main
 * (sin caché) y se cae al archivo servido por el propio sitio.
 */
import { asset } from "@/lib/paths";
import type { Game } from "@/lib/games";

const RAW_URL =
  "https://raw.githubusercontent.com/axcgamestudios/nueva-pestana/main/public/data/community-games.json";

type RawGame = Partial<Game> & { id?: unknown; title?: unknown; url?: unknown; cover?: unknown };

/** Normaliza una entrada cruda del catálogo comunitario para que la UI no se rompa. */
function normalize(raw: RawGame): Game | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id : null;
  const title = typeof raw.title === "string" ? raw.title : null;
  const url = typeof raw.url === "string" ? raw.url : null;
  const cover = typeof raw.cover === "string" ? raw.cover : null;
  if (!id || !title || !url || !cover) return null;
  return {
    id,
    title,
    tagline: typeof raw.tagline === "string" ? raw.tagline : title,
    description: typeof raw.description === "string" ? raw.description : "",
    longDescription: typeof raw.longDescription === "string" ? raw.longDescription : "",
    cover,
    url,
    categories: Array.isArray(raw.categories)
      ? raw.categories.filter((c): c is string => typeof c === "string" && c.length > 0)
      : ["Acción"],
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === "string" && t.length > 0)
      : ["Comunidad"],
    rating: typeof raw.rating === "number" ? raw.rating : 4.5,
    players: typeof raw.players === "string" ? raw.players : "Nuevo",
    difficulty: typeof raw.difficulty === "string" ? raw.difficulty : "Media",
    accent: typeof raw.accent === "string" ? raw.accent : "#60a5fa",
  };
}

function parseList(data: unknown): Game[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((x) => normalize(x as RawGame))
    .filter((g): g is Game => g !== null);
}

/** Descarga el catálogo comunitario (raw sin caché → fallback al archivo del sitio). */
export async function fetchCommunityGames(): Promise<Game[]> {
  // 1) Raw de main: siempre fresco tras un push
  try {
    const r = await fetch(`${RAW_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) return parseList(await r.json());
  } catch {
    /* sin acceso al raw */
  }
  // 2) Archivo servido por el propio despliegue
  try {
    const r = await fetch(asset("/data/community-games.json"), { cache: "no-store" });
    if (r.ok) return parseList(await r.json());
  } catch {
    /* catálogo aún no publicado */
  }
  return [];
}
