"use client";

/**
 * Panel de desarrollador (característica interna).
 *
 * Se invoca con la secuencia de teclas J → K → L y está protegido por
 * contraseña. Permite publicar juegos al catálogo comunitario: los datos
 * se guardan en el repositorio vía la API de GitHub (Contents), de modo
 * que GitHub Pages los reconstruye y quedan disponibles para todos los
 * visitantes. El token de acceso se guarda únicamente en el navegador
 * del desarrollador (localStorage), nunca en el código del sitio.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ExternalLink,
  ImagePlus,
  Loader2,
  Lock,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { allCategories, type Game } from "@/lib/games";

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

const REPO = "axcgamestudios/nueva-pestana";
const API_ROOT = "https://api.github.com";
const JSON_PATH = "public/data/community-games.json";
const IMG_DIR = "public/games/community";
const RAW_ROOT = `https://raw.githubusercontent.com/${REPO}/main`;

const TOKEN_KEY = "axcgames:dev-token";
/** SHA-256 de la contraseña (no se guarda en texto plano). */
const PASSWORD_SHA256 = "21429fa2e2effc01f6cb00de5cd00878495836dbb3c405a1dcb21d8803be10a4";

const COVER_W = 1344;
const COVER_H = 768;

const ACCENTS = ["#f97316", "#22c55e", "#38bdf8", "#a78bfa", "#ec4899", "#eab308"];

type Phase = "closed" | "password" | "token" | "ready";

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "juego"
  );
}

type GhError = Error & { status?: number };

async function ghRequest<T>(
  path: string,
  token: string,
  init: { method?: string; body?: Record<string, unknown> } = {}
): Promise<T> {
  const res = await fetch(`${API_ROOT}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    // Evita cuelgues infinitos: si GitHub no responde, error visible a los 30 s
    signal: AbortSignal.timeout(30_000),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(message), { status: res.status }) as GhError;
  }
  return data as T;
}

interface GhContent {
  sha: string;
  content?: string;
}

interface GhRef {
  object?: { sha?: string };
}

interface GhCommitInfo {
  tree?: { sha?: string };
}

interface GhBlob {
  sha: string;
}

interface TreeEntry {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string | null;
}

/** Sube el contenido (base64) como blob y devuelve su SHA. */
async function createBlob(token: string, b64: string): Promise<string> {
  const blob = await ghRequest<GhBlob>(`/repos/${REPO}/git/blobs`, token, {
    method: "POST",
    body: { content: b64, encoding: "base64" },
  });
  return blob.sha;
}

/**
 * Crea UN solo commit con todos los ficheros indicados y lo empuja a main.
 *
 * Se usa la Git Data API (blobs → árbol → commit → ref) en lugar de la API
 * de Contents por fichero: así cada publicación genera un único commit y
 * un único despliegue de Pages, evitando la carrera "due to in progress
 * deployment" que ocurría al empujar dos commits seguidos (portada y luego
 * catálogo) y disparar dos workflows casi a la vez.
 *
 * Las entradas con sha: null borran el fichero del árbol (para eliminar
 * portadas al quitar un juego).
 */
async function commitFiles(
  token: string,
  message: string,
  entries: TreeEntry[]
): Promise<void> {
  const headRef = await ghRequest<GhRef>(`/repos/${REPO}/git/ref/heads/main`, token);
  const headSha = headRef.object?.sha;
  if (!headSha) throw new Error("No se pudo leer el HEAD del repositorio.");
  const headCommit = await ghRequest<GhCommitInfo>(
    `/repos/${REPO}/git/commits/${headSha}`,
    token
  );
  const baseTree = headCommit.tree?.sha;
  const tree = await ghRequest<{ sha: string }>(`/repos/${REPO}/git/trees`, token, {
    method: "POST",
    body: {
      ...(baseTree ? { base_tree: baseTree } : {}),
      tree: entries,
    },
  });
  const commit = await ghRequest<{ sha: string }>(
    `/repos/${REPO}/git/commits`,
    token,
    {
      method: "POST",
      body: { message, tree: tree.sha, parents: [headSha] },
    }
  );
  await ghRequest(`/repos/${REPO}/git/refs/heads/main`, token, {
    method: "PATCH",
    body: { sha: commit.sha },
  });
}

/** Ruta real dentro del repo de una portada pública (/games/... → public/games/...). */
function repoCoverPath(cover: string): string {
  return `public/${cover.replace(/^\/+/, "")}`;
}

async function readCatalog(token: string): Promise<{ list: Game[]; sha?: string }> {
  try {
    const file = await ghRequest<GhContent>(
      `/repos/${REPO}/contents/${JSON_PATH}?t=${Date.now()}`,
      token
    );
    let list: Game[] = [];
    try {
      const parsed: unknown = JSON.parse(base64ToUtf8(file.content ?? "[]"));
      if (Array.isArray(parsed)) list = parsed as Game[];
    } catch {
      list = [];
    }
    return { list, sha: file.sha };
  } catch (err) {
    if ((err as GhError).status === 404) return { list: [] };
    throw err;
  }
}

/** Lee una imagen y la recorta a 1344x768 (JPEG base64). */
async function fileToCoverBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("El archivo no es una imagen válida"));
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = COVER_W;
  canvas.height = COVER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  const scale = Math.max(COVER_W / image.width, COVER_H / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, (COVER_W - dw) / 2, (COVER_H - dh) / 2, dw, dh);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
}

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

export default function DevPanel() {
  const [phase, setPhase] = useState<Phase>("closed");
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [link, setLink] = useState("");
  const [cat, setCat] = useState("Acción");
  const [coverB64, setCoverB64] = useState("");

  const [list, setList] = useState<Game[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const seqBuffer = useRef("");
  const seqTimer = useRef(0);

  /* Secuencia J → K → L -------------------------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "closed") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key !== "j" && key !== "k" && key !== "l") return;
      const now = Date.now();
      if (now - seqTimer.current > 2500) seqBuffer.current = "";
      seqTimer.current = now;
      seqBuffer.current = (seqBuffer.current + key).slice(-3);
      if (seqBuffer.current === "jkl") {
        seqBuffer.current = "";
        setPwd("");
        setPwdError("");
        setPhase("password");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const close = useCallback(() => {
    setPhase("closed");
    setPwd("");
    setPwdError("");
    setError("");
    setOk("");
    setBusy("");
    setConfirmDelete(null);
  }, []);

  /* Cerrar con ESC (si no está ocupado) ------------------------------ */

  useEffect(() => {
    if (phase === "closed") return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [phase, busy, close]);

  /* Acceso ----------------------------------------------------------- */

  const tryPassword = useCallback(async () => {
    if ((await sha256Hex(pwd)) === PASSWORD_SHA256) {
      setPwd("");
      setPwdError("");
      setPhase(localStorage.getItem(TOKEN_KEY) ? "ready" : "token");
    } else {
      setPwdError("Contraseña incorrecta");
    }
  }, [pwd]);

  const saveToken = useCallback(() => {
    const t = token.trim();
    if (!t) {
      setError("Pega un token de GitHub para continuar.");
      return;
    }
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* almacenamiento no disponible */
    }
    setToken("");
    setError("");
    setPhase("ready");
  }, [token]);

  /* Catálogo comunitario ---------------------------------------------- */

  const refreshList = useCallback(async () => {
    const t = localStorage.getItem(TOKEN_KEY) ?? "";
    if (!t) return;
    try {
      const { list: l } = await readCatalog(t);
      setList(l);
    } catch {
      /* se muestra al interactuar */
    }
  }, []);

  useEffect(() => {
    if (phase === "ready") void refreshList();
  }, [phase, refreshList]);

  /* Subir juego -------------------------------------------------------- */

  const onCoverChange = useCallback(async (file: File | null) => {
    setError("");
    setOk("");
    if (!file) {
      setCoverB64("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("La portada debe ser una imagen.");
      return;
    }
    try {
      setBusy("Procesando portada…");
      setCoverB64(await fileToCoverBase64(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  }, []);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setOk("");
      if (!name.trim() || !desc.trim() || !link.trim() || !coverB64) {
        setError("Completa todos los campos: nombre, descripción, link y portada.");
        return;
      }
      const t = localStorage.getItem(TOKEN_KEY) ?? "";
      if (!t) {
        setPhase("token");
        return;
      }
      let url = link.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

      const id = `${slugify(name)}-${Date.now().toString(36).slice(-4)}`;
      const game: Game = {
        id,
        title: name.trim(),
        tagline: desc.trim().slice(0, 90),
        description: desc.trim(),
        longDescription: `${desc.trim()} Un juego de la comunidad de axcgames: juega al instante en tu navegador, sin descargas.`,
        cover: `/games/community/${id}.jpg`,
        url,
        categories: [cat],
        tags: [cat, "Comunidad"],
        rating: Math.round((4.5 + Math.random() * 0.4) * 10) / 10,
        players: "Nuevo",
        difficulty: "Media",
        accent: ACCENTS[Math.floor(Math.random() * ACCENTS.length)] ?? "#fbbf24",
      };

      try {
        setBusy("Publicando juego…");
        const current = await readCatalog(t);
        const next = [...current.list, game];
        const jsonB64 = utf8ToBase64(JSON.stringify(next, null, 2) + "\n");

        // Un único commit atómico: portada + catálogo juntos → un único deploy
        await commitFiles(t, `panel: añadir ${game.title}`, [
          {
            path: `${IMG_DIR}/${id}.jpg`,
            mode: "100644",
            type: "blob",
            sha: await createBlob(t, coverB64),
          },
          {
            path: JSON_PATH,
            mode: "100644",
            type: "blob",
            sha: await createBlob(t, jsonB64),
          },
        ]);

        setOk(
          "¡Juego publicado! El sitio se reconstruye solo en ~2 minutos. Refresca la página dentro de un rato y aparecerá para todos."
        );
        setName("");
        setDesc("");
        setLink("");
        setCoverB64("");
        setCat("Acción");
        void refreshList();
      } catch (err) {
        const ghErr = err as GhError;
        if (ghErr.status === 401 || ghErr.status === 403) {
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch {
            /* ignorar */
          }
          setError(
            "El token no es válido o no tiene permisos de escritura en el repositorio. Vuelve a ingresarlo."
          );
          setPhase("token");
        } else {
          setError(ghErr.message || "Error inesperado al publicar.");
        }
      } finally {
        setBusy("");
      }
    },
    [name, desc, link, cat, coverB64, refreshList]
  );

  /* Borrar juego -------------------------------------------------------- */

  const removeGame = useCallback(
    async (game: Game) => {
      const t = localStorage.getItem(TOKEN_KEY) ?? "";
      if (!t) return;
      try {
        setBusy("Eliminando juego…");
        const current = await readCatalog(t);
        const next = current.list.filter((x) => x.id !== game.id);
        const jsonB64 = utf8ToBase64(JSON.stringify(next, null, 2) + "\n");

        // Un único commit: quita del catálogo Y borra la portada del repo
        try {
          await commitFiles(t, `panel: quitar ${game.title}`, [
            {
              path: JSON_PATH,
              mode: "100644",
              type: "blob",
              sha: await createBlob(t, jsonB64),
            },
            {
              path: repoCoverPath(game.cover),
              mode: "100644",
              type: "blob",
              sha: null,
            },
          ]);
        } catch {
          // La portada quizá ya no existe en el repo: reintentar solo con el catálogo
          await commitFiles(t, `panel: quitar ${game.title}`, [
            {
              path: JSON_PATH,
              mode: "100644",
              type: "blob",
              sha: await createBlob(t, jsonB64),
            },
          ]);
        }

        setOk("Juego eliminado del catálogo.");
        setConfirmDelete(null);
        void refreshList();
      } catch (err) {
        const ghErr = err as GhError;
        setError(ghErr.message || "No se pudo eliminar el juego.");
      } finally {
        setBusy("");
      }
    },
    [refreshList]
  );

  /* Render --------------------------------------------------------------- */

  if (phase === "closed") return null;

  return (
    <AnimatePresence>
      <motion.div
        key="dev-panel"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) close();
        }}
      >
        <motion.div
          initial={{ scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 12 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          role="dialog"
          aria-modal="true"
          className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black"
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="flex items-center gap-2.5">
              {phase === "password" || phase === "token" ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
                  <Lock className="h-4 w-4" />
                </span>
              ) : (
                <span className="axc-pulse h-2 w-2 rounded-full bg-amber-400" />
              )}
              <h2 className="font-display text-sm font-bold uppercase tracking-[0.25em] text-white/90">
                {phase === "password"
                  ? "ACCESO RESTRINGIDO"
                  : phase === "token"
                    ? "CONFIGURAR ACCESO"
                    : "GESTOR DE JUEGOS"}
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar"
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:border-white/25 hover:text-white active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Cuerpo */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {busy && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                {busy}
              </div>
            )}
            {error && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {ok && (
              <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {ok}
              </div>
            )}

            {phase === "password" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void tryPassword();
                }}
                className="space-y-4"
              >
                <p className="text-sm text-white/55">Introduce la contraseña para continuar.</p>
                <input
                  autoFocus
                  type="password"
                  value={pwd}
                  onChange={(e) => {
                    setPwd(e.target.value);
                    setPwdError("");
                  }}
                  placeholder="Contraseña"
                  aria-label="Contraseña"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
                />
                {pwdError && <p className="text-sm text-red-400">{pwdError}</p>}
                <button
                  type="submit"
                  disabled={!pwd || Boolean(busy)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-display text-sm font-bold tracking-widest text-black transition hover:bg-amber-300 active:scale-95 disabled:opacity-40"
                >
                  ENTRAR
                </button>
              </form>
            )}

            {phase === "token" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveToken();
                }}
                className="space-y-4"
              >
                <p className="text-sm leading-relaxed text-white/55">
                  Para publicar juegos necesitas un{" "}
                  <b className="text-white/80">token de acceso personal</b> de GitHub con permiso
                  de escritura en este repositorio. Se guarda únicamente en tu navegador; nadie
                  más puede verlo. Puedes revocarlo en cualquier momento desde Ajustes →
                  Developer settings → Tokens.
                </p>
                <input
                  autoFocus
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_… o github_pat_…"
                  aria-label="Token de acceso de GitHub"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!token.trim() || Boolean(busy)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-display text-sm font-bold tracking-widest text-black transition hover:bg-amber-300 active:scale-95 disabled:opacity-40"
                >
                  GUARDAR Y CONTINUAR
                </button>
              </form>
            )}

            {phase === "ready" && (
              <div className="space-y-6">
                {/* Formulario */}
                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <label htmlFor="dev-name" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/50">
                      Nombre del juego
                    </label>
                    <input
                      id="dev-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej. Ninja Rush"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="dev-desc" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/50">
                      Descripción
                    </label>
                    <textarea
                      id="dev-desc"
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      placeholder="Descripción corta que se verá en la tarjeta del juego…"
                      rows={2}
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="dev-link" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/50">
                      Link del juego
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 focus-within:border-amber-400/60">
                      <ExternalLink className="h-4 w-4 shrink-0 text-white/35" />
                      <input
                        id="dev-link"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="usuario.github.io/mijuego/"
                        className="w-full bg-transparent py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none"
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-white/35">
                      Se abrirá dentro de la página, igual que los demás juegos.
                    </p>
                  </div>

                  <div>
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/50">
                      Categoría
                    </span>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Categoría del juego">
                      {allCategories
                        .filter((c) => c !== "Todos")
                        .map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setCat(c)}
                            aria-pressed={cat === c}
                            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
                              cat === c
                                ? "border-amber-400 bg-amber-400 text-black"
                                : "border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:text-white"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div>
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/50">
                      Portada
                    </span>
                    {coverB64 ? (
                      <div className="relative overflow-hidden rounded-xl border border-white/10">
                        <img
                          src={`data:image/jpeg;base64,${coverB64}`}
                          alt="Vista previa de la portada"
                          className="h-40 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setCoverB64("")}
                          className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white/80 transition hover:text-white"
                          aria-label="Quitar portada"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-center transition hover:border-amber-400/40 hover:bg-amber-400/5">
                        <ImagePlus className="h-6 w-6 text-white/40" />
                        <span className="text-sm text-white/55">
                          Elige la imagen de portada del juego
                        </span>
                        <span className="text-xs text-white/30">
                          Cualquier tamaño — se ajusta automáticamente
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          aria-label="Elegir imagen de portada"
                          onClick={(e) => {
                            // Permitir reelegir el mismo archivo tras quitar la portada
                            e.currentTarget.value = "";
                          }}
                          onChange={(e) => {
                            void onCoverChange(e.target.files?.[0] ?? null);
                          }}
                          className="mt-1 block w-full text-xs text-white/40 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-amber-400/15 file:px-4 file:py-2 file:text-xs file:font-bold file:text-amber-300 hover:file:bg-amber-400/25"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={Boolean(busy) || !name.trim() || !desc.trim() || !link.trim() || !coverB64}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-display text-sm font-bold tracking-widest text-black shadow-lg shadow-amber-400/20 transition hover:bg-amber-300 active:scale-95 disabled:opacity-40"
                  >
                    <UploadCloud className="h-4 w-4" />
                    {busy ? "PUBLICANDO…" : "PUBLICAR JUEGO"}
                  </button>
                </form>

                {/* Lista de juegos publicados */}
                <div className="border-t border-white/10 pt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-display text-xs font-bold uppercase tracking-[0.25em] text-white/60">
                      PUBLICADOS ({list.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => void refreshList()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 transition hover:border-white/25 hover:text-white active:scale-95"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refrescar
                    </button>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-sm text-white/35">
                      Todavía no hay juegos comunitarios publicados.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {list.map((g) => (
                        <li
                          key={g.id}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
                        >
                          <img
                            src={`${RAW_ROOT}${g.cover}?t=${Date.now()}`}
                            alt=""
                            className="h-10 w-16 shrink-0 rounded-md object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">{g.title}</p>
                            <p className="truncate text-xs text-white/40">
                              {g.categories?.[0] ?? "Comunidad"} · {g.description || "Sin descripción"}
                            </p>
                          </div>
                          {confirmDelete === g.id ? (
                            <button
                              type="button"
                              onClick={() => void removeGame(g)}
                              disabled={Boolean(busy)}
                              className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-400 active:scale-95 disabled:opacity-50"
                            >
                              ¿Seguro?
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(g.id)}
                              aria-label={`Eliminar ${g.title}`}
                              className="rounded-full border border-white/10 p-2 text-white/45 transition hover:border-red-500/50 hover:text-red-400 active:scale-95"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <p className="flex items-start gap-2 text-xs leading-relaxed text-white/30">
                  <Send className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Cada publicación se guarda en el repositorio y GitHub Pages reconstruye el
                  sitio en ~2 minutos; después el juego aparece para todos los visitantes.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
