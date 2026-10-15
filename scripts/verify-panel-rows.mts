/**
 * Harness de verificación: simula el localStorage de un navegador con
 * varias cuentas creadas (algunas con sesión, otras no) y sus datos de
 * juego, y comprueba que la lógica del panel las liste TODAS.
 *
 * Se ejecuta con: npx tsx scripts/verify-panel-rows.ts
 */


// ---- Mock mínimo de navegador -------------------------------------------
const store = new Map<string, string>();
const localStorageShim = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as unknown as { localStorage: Storage }).localStorage =
  localStorageShim as unknown as Storage;
// accounts.ts comprueba `typeof window` para SSR: simular ventana.
(globalThis as unknown as { window: unknown }).window = globalThis;
// Node 20+ ya expone webcrypto como global: no hace falta sobreescribirlo.

// ---- Cargar módulos DESPUÉS del mock --------------------------------------
const { buildStatsPayload, readOwn, getPeerStats, getCachedConfig, ingestPeerIdentity } =
  await import("../src/lib/playtime");
const { getSessionUser, loadAccounts } = await import("../src/lib/accounts");

// ---- Datos de prueba -------------------------------------------------------
const dayKey = (d: Date) => d.toLocaleDateString("sv-SE");
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

// 3 cuentas: lucia (con sesión y juego), mateo (sin sesión, con juego), sofia (nunca jugó)
const accounts: Record<string, unknown> = {
  lucia: {
    username: "lucia",
    salt: "00",
    hash: "irrelevant",
    user: {
      id: "u-lucia",
      username: "lucia",
      displayName: "Lucía",
      avatarColor: "#10b981",
      bio: "",
      createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    },
  },
  mateo: {
    username: "mateo",
    salt: "00",
    hash: "irrelevant",
    user: {
      id: "u-mateo",
      username: "mateo",
      displayName: "Mateo",
      avatarColor: "#06b6d4",
      bio: "",
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    },
  },
  sofia: {
    username: "sofia",
    salt: "00",
    hash: "irrelevant",
    user: {
      id: "u-sofia",
      username: "sofia",
      displayName: "Sofía",
      avatarColor: "#ef4444",
      bio: "",
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
  },
};
localStorageShim.setItem("axcg:accounts", JSON.stringify(accounts));
localStorageShim.setItem("axcg:session", "lucia");

// Playtime: lucia (2h hoy + 30m ayer), mateo (1h hace 3 días), sofia nada
localStorageShim.setItem(
  "axcgames:playtime:u-lucia",
  JSON.stringify({
    days: { [dayKey(new Date())]: { fnaf1: 3600, fnaf2: 3600 }, [daysAgo(1)]: { fnaf1: 1800 } },
    updatedAt: Date.now() - 60_000,
  })
);
localStorageShim.setItem(
  "axcgames:playtime:u-mateo",
  JSON.stringify({
    days: { [daysAgo(3)]: { minecraft: 3600 } },
    updatedAt: Date.now() - 3 * 86400000,
  })
);

// Un par P2P conocido de otro navegador (visto hace 1h)
localStorageShim.setItem(
  "axcgames:pt-peers",
  JSON.stringify({
    "u-remoto": {
      userId: "u-remoto",
      username: "remoto",
      displayName: "Jugador Remoto",
      avatarColor: "#8b5cf6",
      stats: { d: { [daysAgo(2)]: 7200 }, g: { fnaf1: 7200 }, t: 7200, up: Date.now() - 3600_000 },
      seenAt: Date.now() - 3600_000,
    },
  })
);

// Config con un usuario que solo existe en la config
localStorageShim.setItem(
  "axcgames:pt-config",
  JSON.stringify({
    config: {
      version: 1,
      observationStart: daysAgo(30),
      enforcementStart: "2999-12-31",
      defaultMonthlyLimitMinutes: null,
      users: { "u-fantasma": { username: "fantasma", exempt: true } },
    },
    fetchedAt: Date.now(),
  })
);

// ---- Réplicas de la lógica del panel (buildRows) ---------------------------
const me = getSessionUser();
console.log("Sesión activa:", me?.username);

const peers = getPeerStats();
const config = getCachedConfig();

const seen = new Set<string>();
const rows: Array<Record<string, unknown>> = [];

for (const account of Object.values(loadAccounts() as Record<string, { user: { id: string; username: string } }>)) {
  const u = account.user;
  if (!u?.id || seen.has(u.id)) continue;
  seen.add(u.id);
  const own = readOwn(u.id);
  rows.push({
    username: u.username,
    isMe: me?.id === u.id,
    source: "local",
    lastSeen: own.updatedAt || Date.parse(new Date().toISOString()),
    totalSec: buildStatsPayload(u.id).t,
  });
}
for (const p of peers) {
  if (seen.has(p.userId)) continue;
  seen.add(p.userId);
  rows.push({ username: p.username, isMe: false, source: "p2p", totalSec: p.stats.t });
}
for (const [userId, uc] of Object.entries(config.users)) {
  if (seen.has(userId)) continue;
  rows.push({ username: uc.username ?? userId, isMe: false, source: "config", totalSec: 0 });
}

console.table(rows);

// ---- Comprobaciones --------------------------------------------------------
const names = rows.map((r) => r.username);
const checks: Array<[string, boolean]> = [
  ["lucia (sesión iniciada → local)", names.includes("lucia")],
  ["mateo (SIN sesión pero cuenta creada → local)", names.includes("mateo")],
  ["sofia (cuenta nueva, nunca jugó → local)", names.includes("sofia")],
  ["remoto (peer de otro navegador → p2p)", names.includes("remoto")],
  ["fantasma (solo en la config)", names.includes("fantasma")],
];

// lucia muestra sus 2h30m de juego (9000 s)
const lucia = rows.find((r) => r.username === "lucia");
const luciaOk = Boolean(lucia && lucia.totalSec === 9000);
checks.push([`lucia reporta 2h 30m de juego local (obtuvo ${lucia?.totalSec}s)`, luciaOk]);

// mateo muestra su 1h (3600 s)
const mateo = rows.find((r) => r.username === "mateo");
const mateoOk = Boolean(mateo && mateo.totalSec === 3600);
checks.push([`mateo reporta 1h de juego local (obtuvo ${mateo?.totalSec}s)`, mateoOk]);

// ingestPeerIdentity: nuevo par avistado sin stats queda registrado
const registered = ingestPeerIdentity({
  id: "u-nuevo",
  username: "nuevo",
  displayName: "Nuevo Par",
  avatarColor: "#f97316",
});
const nuevoInPeers = getPeerStats().some((p) => p.userId === "u-nuevo");
checks.push(["ingestPeerIdentity registra par nuevo sin stats", registered && nuevoInPeers]);

// y NO sobrescribe stats existentes
ingestPeerIdentity({ id: "u-remoto", username: "remoto", displayName: "Jugador Remoto" });
const remotoStats = getPeerStats().find((p) => p.userId === "u-remoto");
checks.push([
  "ingestPeerIdentity NO borra stats conocidos del par",
  Boolean(remotoStats && remotoStats.stats.t === 7200),
]);

let fail = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) fail++;
}
if (fail > 0) {
  console.error(`\n${fail} comprobaciones fallaron`);
  process.exit(1);
}
console.log("\nTodas las comprobaciones pasaron ✔");
