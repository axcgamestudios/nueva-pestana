/**
 * Diagnóstico: ¿quién superó su límite mensual según la nube?
 * Compara los minutos jugados este mes (desde la BD en la nube, `stats.d`)
 * contra playtime-config.json.
 */
import { readFileSync } from "node:fs";

const PREFIX = "axcg-db-ad177030591d3cecc0ddbc51043cc50b0b3c4376";

const cfg = JSON.parse(
  readFileSync(new URL("../public/data/playtime-config.json", import.meta.url), "utf8")
);

const now = new Date();
const monthKey = now.toLocaleDateString("sv-SE").slice(0, 7);
const todayKey = now.toLocaleDateString("sv-SE");

async function getJSON(path: string) {
  const r = await fetch(`https://textdb.dev/api/data/${PREFIX}${path}`, {
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = await r.json();
  return typeof j === "string" ? JSON.parse(j) : j;
}

console.log(`Mes actual: ${monthKey} · Hoy: ${todayKey}`);
console.log(`enforcementStart (repo): ${cfg.enforcementStart}`);
console.log(`¿Hoy >= enforcementStart? ${todayKey >= cfg.enforcementStart ? "SÍ (bloquea)" : "NO (solo observa)"}`);
console.log("");

const reg = (await getJSON("-registry")) ?? {};
const users = Object.values(reg.users ?? {}) as Array<{
  id: string;
  username: string;
}>;
console.log(`Cuentas en la nube: ${users.length}\n`);

for (const u of users.sort((a, b) => a.username.localeCompare(b.username))) {
  const uc = cfg.users[u.id];
  const limitMin = uc?.monthlyLimitMinutes ?? cfg.defaultMonthlyLimitMinutes ?? null;
  const exempt = uc?.exempt === true;
  let monthSec = 0;
  let totalSec = 0;
  let lastUp = 0;
  try {
    const doc = await getJSON(`-u-${u.id}`);
    if (doc?.days) {
      lastUp = doc.updatedAt ?? 0;
      for (const [day, perGame] of Object.entries(doc.days as Record<string, Record<string, number>>)) {
        const dayTotal = Object.values(perGame ?? {}).reduce((a, b) => a + (b || 0), 0);
        totalSec += dayTotal;
        if (day.startsWith(monthKey)) monthSec += dayTotal;
      }
    }
  } catch {
    /* sin doc */
  }
  const usedMin = Math.round(monthSec / 60);
  const remaining = limitMin == null ? null : limitMin - usedMin;
  const status = exempt
    ? "EXENTO (nunca se bloquea)"
    : limitMin == null
      ? "sin límite propio"
      : remaining <= 0
        ? `¡EXCEDIDO por ${-remaining} min! → con límites activos se BLOQUEARÍA`
        : `ok (restan ${remaining} min)`;
  const upStr = lastUp ? new Date(lastUp).toISOString().slice(0, 16).replace("T", " ") : "sin sync";
  console.log(
    `- ${u.username.padEnd(14)} límite=${String(limitMin ?? "—").padStart(4)} min · usado este mes=${String(usedMin).padStart(4)} min (total 90d ${Math.round(totalSec / 60)} min) · última subida=${upStr} · ${status}`
  );
}
