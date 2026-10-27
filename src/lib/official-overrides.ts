/**
 * Ediciones de los juegos oficiales (hechas desde el panel).
 *
 * Los juegos oficiales viven en src/lib/games.ts (compilados dentro del
 * bundle), así que sus ediciones se guardan aparte en
 * public/data/official-overrides.json: un mapa { id → campos editados }.
 * El panel lo escribe por la API de GitHub y el sitio lo aplica encima de
 * los juegos oficiales tras cada reconstrucción de Pages. Un juego sin
 * entrada (o tras "restaurar original") muestra sus datos de siempre.
 */
import { asset } from "@/lib/paths";
import type { Game } from "@/lib/games";

const RAW_URL =
  "https://raw.githubusercontent.com/axcgamestudios/nueva-pestana/main/public/data/official-overrides.json";

/** Campos de un juego oficial que el panel puede editar. */
export type GameOverride = Partial<
  Pick<
    Game,
    | "title"
    | "tagline"
    | "description"
    | "longDescription"
    | "cover"
    | "url"
    | "categories"
    | "tags"
  >
>;

export type GameOverrides = Record<string, GameOverride>;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function strList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const list = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return list.length > 0 ? list : undefined;
}

/** Normaliza una entrada cruda para que la UI no se rompa con datos parciales. */
function sanitizeEntry(raw: unknown): GameOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: GameOverride = {};
  const title = str(r.title);
  const tagline = str(r.tagline);
  const description = str(r.description);
  const longDescription = str(r.longDescription);
  const cover = str(r.cover);
  const url = str(r.url);
  const categories = strList(r.categories);
  const tags = strList(r.tags);
  if (title) out.title = title;
  if (tagline) out.tagline = tagline;
  if (description) out.description = description;
  if (longDescription) out.longDescription = longDescription;
  if (cover) out.cover = cover;
  if (url) out.url = url;
  if (categories) out.categories = categories;
  if (tags) out.tags = tags;
  return Object.keys(out).length > 0 ? out : null;
}

function parse(data: unknown): GameOverrides {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: GameOverrides = {};
  for (const [id, raw] of Object.entries(data as Record<string, unknown>)) {
    const entry = sanitizeEntry(raw);
    if (entry) out[id] = entry;
  }
  return out;
}

/** Descarga las ediciones oficiales (raw sin caché → fallback al archivo servido). */
export async function fetchOfficialOverrides(): Promise<GameOverrides> {
  // 1) Raw de main: siempre fresco tras un push
  try {
    const r = await fetch(`${RAW_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) return parse(await r.json());
  } catch {
    /* sin acceso al raw */
  }
  // 2) Archivo servido por el propio despliegue
  try {
    const r = await fetch(asset("/data/official-overrides.json"), { cache: "no-store" });
    if (r.ok) return parse(await r.json());
  } catch {
    /* sin ediciones publicadas */
  }
  return {};
}

/** Aplica la edición (si existe) sobre un juego oficial; el id nunca cambia. */
export function applyOverride(game: Game, overrides: GameOverrides): Game {
  const o = overrides[game.id];
  return o ? { ...game, ...o, id: game.id } : game;
}
