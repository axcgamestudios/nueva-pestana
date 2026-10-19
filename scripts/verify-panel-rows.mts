/**
 * Harness de verificación del panel de estadísticas.
 *
 * Simula el localStorage de un navegador con varias cuentas y comprueba
 * la LÓGICA REAL (src/lib/panel-rows.ts, sin React) combinando:
 *  - La base de datos en la nube REAL (textdb.dev, solo lectura)
 *  - Cuentas locales simuladas (con y sin sesión)
 *  - Un par P2P y un usuario de la configuración
 *
 * Se ejecuta con: npx tsx scripts/verify-panel-rows.mts
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
// accounts.ts / playtime.ts comprueban `typeof window` para SSR
(globalThis as unknown as { window: unknown }).window = globalThis;

// ---- Cargar módulos DESPUÉS del mock --------------------------------------
const { buildRows, sourceLabel } = await import("../src/lib/panel-rows");
const { getSessionUser, loadAccounts } = await import("../src/lib/accounts");
const { getCachedConfig } = await import("../src/lib/playtime");
const { fetchCloudSnapshot } = await import("../src/lib/cloud-db");

// ---- Datos de prueba -------------------------------------------------------
const dayKey = (d: Date) => d.toLocaleDateString("sv-SE");
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

// Cuenta local SIN sesión con juego registrado (debe aparecer como "local")
const accounts: Record<string, unknown> = {
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
};
localStorageShim.setItem("axcg:accounts", JSON.stringify(accounts));
localStorageShim.setItem("axcg:session", "mateo"); // sesión de mateo
localStorageShim.setItem(
  "axcgames:playtime:u-mateo",
  JSON.stringify({
    days: { [daysAgo(3)]: { minecraft: 3600 }, [dayKey(new Date())]: { fnaf1: 1500 } },
    updatedAt: Date.now() - 60_000,
  })
);

// Un par P2P conocido (visto hace 1h, otro navegador)
localStorageShim.setItem(
  "axcgames:pt-peers",
  JSON.stringify({
    "u-remoto": {
      userId: "u-remoto",
      username: "remoto_p2p",
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
      defaultWeeklyLimitMinutes: null,
      users: { "u-fantasma": { username: "fantasma", exempt: true } },
    },
    fetchedAt: Date.now(),
  })
);

// ---- Ejecutar la lógica REAL del panel -------------------------------------
const me = getSessionUser();
const config = getCachedConfig();
console.log("Sesión simulada:", me?.username);

console.log("\nDescargando instantánea de la nube REAL (textdb.dev)…");
const cloud = await fetchCloudSnapshot();
if (!cloud) {
  console.log("⚠️  La nube no respondió (¿sin conexión?): se prueba solo con fuentes locales.");
} else {
  console.log(`   ${cloud.accounts.length} cuenta(s) en la nube: ${cloud.accounts.map((a) => a.username).join(", ")}`);
}

const rows = buildRows(me, new Set<string>(), config, cloud);
console.table(
  rows.map((r) => ({
    username: r.username,
    isMe: r.isMe,
    source: r.source,
    hoy: Math.round(r.todaySec / 60) + "m",
    total: Math.round(r.totalSec / 60) + "m",
  }))
);

// ---- Comprobaciones --------------------------------------------------------
const names = rows.map((r) => r.username);
const checks: Array<[string, boolean]> = [
  ["mateo (sesión local → local)", names.includes("mateo")],
  ["remoto_p2p (peer de otro navegador → p2p)", names.includes("remoto_p2p")],
  ["fantasma (solo en la config)", names.includes("fantasma")],
];

if (cloud) {
  for (const a of cloud.accounts) {
    checks.push([`${a.username} (cuenta en la nube → cloud)`, names.includes(a.username)]);
  }
}

// mateo reporta 3600+1500 = 5100s
const mateo = rows.find((r) => r.username === "mateo");
checks.push([
  `mateo reporta 1h 25m de juego local (obtuvo ${mateo?.totalSec}s)`,
  mateo?.totalSec === 5100,
]);

// Cada fila lleva etiqueta de origen legible
checks.push([
  "sourceLabel funciona para cloud/local/p2p/config",
  sourceLabel("cloud", false) === "cuenta en la nube" &&
    sourceLabel("local", false) === "cuenta en este navegador" &&
    sourceLabel("p2p", false) === "visto en la red P2P" &&
    sourceLabel("config", false) === "solo en la configuración" &&
    sourceLabel("cloud", true) === "sesión actual",
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
