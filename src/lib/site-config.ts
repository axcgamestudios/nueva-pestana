/**
 * Configuración del sitio (selecciones del panel de administración).
 *
 * Vive en public/data/site-config.json dentro del repo, igual que el
 * catálogo comunitario: el panel la escribe por la API de GitHub y el
 * sitio la lee tras cada reconstrucción de Pages. Hoy guarda el juego
 * destacado elegido por el admin (featuredId); null = juego por defecto.
 */
import { asset } from "@/lib/paths";

const RAW_URL =
  "https://raw.githubusercontent.com/axcgamestudios/nueva-pestana/main/public/data/site-config.json";

export type SiteConfig = {
  /** Id del juego que se muestra en el hero; null = primer juego oficial. */
  featuredId: string | null;
};

function parse(data: unknown): SiteConfig {
  if (!data || typeof data !== "object") return { featuredId: null };
  const fid = (data as { featuredId?: unknown }).featuredId;
  return { featuredId: typeof fid === "string" && fid.trim() ? fid.trim() : null };
}

/** Descarga la config del sitio (raw sin caché → fallback al archivo servido). */
export async function fetchSiteConfig(): Promise<SiteConfig> {
  // 1) Raw de main: siempre fresco tras un push
  try {
    const r = await fetch(`${RAW_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) return parse(await r.json());
  } catch {
    /* sin acceso al raw */
  }
  // 2) Archivo servido por el propio despliegue
  try {
    const r = await fetch(asset("/data/site-config.json"), { cache: "no-store" });
    if (r.ok) return parse(await r.json());
  } catch {
    /* config aún no publicada */
  }
  return { featuredId: null };
}
