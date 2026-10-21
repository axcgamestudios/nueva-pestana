/** Limpia del textdb la cuenta de prueba devmc* creada en el E2E de
 *  renombrado Jeffcraft→Minecraft (usuario + vínculo de dispositivo). */
const P = "axcg-db-ad177030591d3cecc0ddbc51043cc50b0b3c4376";
const UID = "e0699845-c218-4aa7-af55-dd0204da02c1";
const DEV = "6144720c-a747-4b6c-9466-a20b27f0648c";
const NAME = "devmc30293";

const r = await (await fetch(`https://textdb.dev/api/data/${P}-registry`)).json();
const reg = typeof r === "string" ? JSON.parse(r) : r;
let touched = false;
if (reg.users?.[UID]) { delete reg.users[UID]; touched = true; }
if (reg.devices?.[DEV]) { delete reg.devices[DEV]; touched = true; }
if (reg.devices) {
  for (const [k, v] of Object.entries(reg.devices)) {
    if (v?.username === NAME) { delete reg.devices[k]; touched = true; }
  }
}
if (touched) {
  await fetch(`https://textdb.dev/api/data/${P}-registry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reg),
  });
}
console.log(touched ? "limpiado (users/devices)" : "nada que limpiar");

// stats del usuario de prueba
await fetch(`https://textdb.dev/api/data/${P}-u-${UID}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
console.log("stats de prueba vaciadas");
