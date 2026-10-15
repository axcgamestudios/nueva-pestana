"use client";

/**
 * Cuentas reales SIN email y SIN servidor (compatible con GitHub Pages).
 *
 * - Las credenciales se guardan en localStorage de este navegador.
 * - Las contraseñas se hashean con PBKDF2-SHA256 (120 000 iteraciones,
 *   salt aleatorio de 16 bytes) mediante la Web Crypto API.
 * - Cada cuenta tiene una identidad (AxUser) con un userId único que se
 *   usa para el chat P2P entre navegadores.
 */

import type { AxUser } from "./store";
import {
  fetchCloudStats,
  fetchRegistry,
  pushCloudStats,
  registerCloudAccount,
  type CloudAccount,
} from "./cloud-db";
import { readOwn } from "./playtime";

const ACCOUNTS_KEY = "axcg:accounts";
const SESSION_KEY = "axcg:session";
const ITERATIONS = 120_000;

export type Account = {
  username: string;
  salt: string;
  hash: string;
  user: AxUser;
  /** epoch ms de la última sincronización con la nube (si está registrada). */
  cloudSyncedAt?: number;
};

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export const AVATAR_COLORS = [
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#22d3ee",
  "#a3e635",
  "#fb7185",
  "#38bdf8",
];

function randomSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function derive(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

export function loadAccounts(): Record<string, Account> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const parsed = JSON.parse(raw ?? "{}") as Record<string, Account>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAccounts(accounts: Record<string, Account>): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    /* almacenamiento lleno o no disponible */
  }
}

export function setSession(username: string | null): void {
  try {
    if (username) localStorage.setItem(SESSION_KEY, username);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignorar */
  }
}

export function getSessionUser(): AxUser | null {
  if (typeof window === "undefined") return null;
  try {
    const username = localStorage.getItem(SESSION_KEY);
    if (!username) return null;
    const account = loadAccounts()[username];
    return account?.user ?? null;
  } catch {
    return null;
  }
}

export async function registerAccount(
  username: string,
  password: string,
  displayName: string,
): Promise<{ ok: boolean; error?: string; user?: AxUser }> {
  const clean = username.trim().toLowerCase();
  if (!USERNAME_RE.test(clean)) {
    return {
      ok: false,
      error: "El usuario debe tener 3-20 caracteres: letras, números o guion bajo.",
    };
  }
  if (password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }
  const accounts = loadAccounts();
  if (accounts[clean]) {
    return { ok: false, error: "Ese nombre de usuario ya existe en este navegador." };
  }
  // Comprobar también en la nube (la cuenta debe ser única para todos)
  const cloud = await fetchRegistry(6000);
  if (cloud?.users[clean]) {
    return { ok: false, error: "Ese nombre de usuario ya existe (cuenta compartida)." };
  }
  const salt = randomSalt();
  const hash = await derive(password, salt);
  const user: AxUser = {
    id: crypto.randomUUID(),
    username: clean,
    displayName: (displayName.trim() || clean).slice(0, 24),
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    bio: "",
    createdAt: new Date().toISOString(),
  };
  accounts[clean] = { username: clean, salt, hash, user };
  saveAccounts(accounts);
  setSession(clean);
  // Registrar en la nube (best-effort: si falla, la migración lo reintenta;
  // el usuario ya puede jugar con la cuenta local).
  void registerCloudAccount({
    id: user.id,
    username: clean,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    salt,
    hash,
    createdAt: user.createdAt,
    updatedAt: Date.now(),
  }).then((res) => {
    if (res.ok) {
      const accs = loadAccounts();
      if (accs[clean]) {
        accs[clean].cloudSyncedAt = Date.now();
        saveAccounts(accs);
      }
    }
  });
  return { ok: true, user };
}

export async function loginAccount(
  username: string,
  password: string,
): Promise<{ ok: boolean; error?: string; user?: AxUser }> {
  const clean = username.trim().toLowerCase();
  const accounts = loadAccounts();
  let account = accounts[clean];

  // Si no existe en este navegador, buscarla en la nube (permite entrar
  // desde cualquier dispositivo con el mismo usuario y contraseña).
  if (!account) {
    const cloud = await fetchRegistry(8000);
    const remote = cloud?.users[clean];
    if (remote) {
      const hash = await derive(password, remote.salt);
      if (hash !== remote.hash) {
        return { ok: false, error: "Contraseña incorrecta." };
      }
      // Cachear la cuenta de la nube en este navegador para futuros accesos
      const user: AxUser = {
        id: remote.id,
        username: remote.username,
        displayName: remote.displayName,
        avatarColor: remote.avatarColor,
        bio: "",
        createdAt: remote.createdAt,
      };
      account = {
        username: remote.username,
        salt: remote.salt,
        hash: remote.hash,
        user,
        cloudSyncedAt: remote.updatedAt || Date.now(),
      };
      accounts[clean] = account;
      saveAccounts(accounts);
      // Traer sus estadísticas de la nube a este navegador (continúa donde
      // lo dejó si ya jugó en otro dispositivo)
      try {
        const remoteStats = await fetchCloudStats(remote.id);
        if (remoteStats && !readOwn(remote.id).updatedAt) {
          localStorage.setItem(
            `axcgames:playtime:${remote.id}`,
            JSON.stringify(remoteStats),
          );
        }
      } catch {
        /* sin nube: estadísticas locales vacías */
      }
      setSession(clean);
      return { ok: true, user };
    }
    return { ok: false, error: "No existe ninguna cuenta con ese usuario." };
  }

  const hash = await derive(password, account.salt);
  if (hash !== account.hash) {
    return { ok: false, error: "Contraseña incorrecta." };
  }
  setSession(clean);
  // Al entrar, subir los datos de juego actuales a la nube (por si hubo
  // partidas sin sincronizar) y traer la cuenta al día.
  const user = account.user;
  void pushCloudStats(user.id, readOwn(user.id), { force: true });
  return { ok: true, user };
}

/**
 * Migra una cuenta local a la base de datos compartida: registra sus
 * credenciales (para poder entrar desde cualquier dispositivo) y sube
 * las estadísticas de juego acumuladas. No pide contraseña: la sesión
 * local ya autentica al dueño de la cuenta.
 */
export async function migrateAccountToCloud(
  username: string,
): Promise<{ ok: boolean; error?: string }> {
  const clean = username.trim().toLowerCase();
  const account = loadAccounts()[clean];
  if (!account) {
    return { ok: false, error: "No existe esa cuenta en este navegador." };
  }
  const user = account.user;
  const entry: CloudAccount = {
    id: user.id,
    username: clean,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    salt: account.salt,
    hash: account.hash,
    createdAt: user.createdAt,
    updatedAt: Date.now(),
  };
  const res = await registerCloudAccount(entry);
  if (!res.ok) return res;
  // Subir también las estadísticas acumuladas de este navegador
  await pushCloudStats(user.id, readOwn(user.id), { force: true });
  const accounts = loadAccounts();
  if (accounts[clean]) {
    accounts[clean].cloudSyncedAt = Date.now();
    saveAccounts(accounts);
  }
  return { ok: true };
}
