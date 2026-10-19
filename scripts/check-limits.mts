/**
 * Diagnóstico: ¿quién superó su límite SEMANAL según la nube?
 * Compara los minutos jugados desde el lunes (BD en la nube, `days`)
 * contra playtime-config.json (tope semanal; acepta el campo antiguo
 * mensual por compatibilidad).
 */
import { readFileSync } from "node:fs";

const PREFIX = "axcg-db-ad177030591d3cecc0ddbc51043cc50b0b3c4376";

const cfg = JSON.parse(
  readFileSync(new URL("../public/data/playtime-config.json", import.meta.url), "utf8")
);

const now = new Date();
const todayKey = now.toLocaleDateString("sv-SE");
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dow = monday.getDay();
monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));
const weekStart = monday.toLocaleDateString("sv-SE");

async function getJSON(path: string) {
  const r = await fetch(`https://textdb.dev/api/data/${PREFIX}${path}`, {
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = await r.json();
  return typeof j === "string" ? JSON.parse(j) : j;
}

console.log(`Hoy: ${todayKey} · Semana actual: desde el lunes ${weekStart}`);
console.log(`enforcementStart (repo): ${cfg.enforcementStart}`);
console.log(
  `¿Límites activos? ${todayKey >= cfg.enforcementStart ? "SÍ (bloquea al excederse)" : "NO (solo observa)"}`
);
console.log("");

const reg = (await getJSON("-registry")) ?? {};
const users = Object.values(reg.users ?? {}) as Array<{
  id: string;
  username: string;
}>;
console.log(`Cuentas en la nube: ${users.length}\n`);

for (const u of users.sort((a, b) => a.username.localeCompare(b.username))) {
  const uc = cfg.users[u.id];
  const limitMin =
    uc?.weeklyLimitMinutes ?? uc?.monthlyLimitMinutes ?? cfg.defaultWeeklyLimitMinutes ?? null;
  const exempt = uc?.exempt === true;
  let weekSec = 0;
  let monthSec = 0;
  let lastUp = 0;
  try {
    const doc = await getJSON(`-u-${u.id}`);
    if (doc?.days) {
      lastUp = doc.updatedAt ?? 0;
      for (const [day, perGame] of Object.entries(doc.days as Record<string, Record<string, number>>)) {
        const dayTotal = Object.values(perGame ?? {}).reduce((a, b) => a + (b || 0), 0);
        if (day.startsWith(todayKey.slice(0, 7))) monthSec += dayTotal;
        if (day >= weekStart) weekSec += dayTotal;
      }
    }
  } catch {
    /* sin doc */
  }
  const usedMin = Math.round(weekSec / 60);
  const remaining = limitMin == null ? null : limitMin - usedMin;
  const status = exempt
    ? "EXENTO (nunca se bloquea)"
    : limitMin == null
      ? "sin límite propio"
      : remaining <= 0
        ? `¡EXCEDIDO por ${-remaining} min! → BLOQUEADO hasta el próximo lunes`
        : `ok (restan ${remaining} min esta semana)`;
  const upStr = lastUp ? new Date(lastUp).toISOString().slice(0, 16).replace("T", " ") : "sin sync";
  console.log(
    `- ${u.username.padEnd(14)} límite=${String(limitMin ?? "—").padStart(4)} min/sem · esta semana=${String(usedMin).padStart(4)} min · mes=${String(Math.round(monthSec / 60)).padStart(4)} min · última subida=${upStr} · ${status}`
  );
}
