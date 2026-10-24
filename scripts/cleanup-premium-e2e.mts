/** Limpia del textdb todas las cuentas de prueba desa-NNN y desb-NNN de los
 *  E2E (usuarios del registro, vínculos de dispositivo, bandejas y stats). */
const P = "axcg-db-ad177030591d3cecc0ddbc51043cc50b0b3c4376";
const r = await (await fetch(`https://textdb.dev/api/data/${P}-registry`)).json();
const reg = typeof r === "string" ? JSON.parse(r) : r;

const testUsers = Object.values(reg.users).filter(
  (u) => /^(desa|desb|devmc)\d+$/.test(u.username)
);
const ids = new Set(testUsers.map((u) => u.id));
const names = new Set(testUsers.map((u) => u.username));
console.log(`cuentas de prueba: ${names.size}`, [...names]);

let touched = false;
for (const n of names) {
  if (reg.users[n]) {
    delete reg.users[n];
    touched = true;
  }
}
if (reg.devices) {
  for (const [k, v] of Object.entries(reg.devices)) {
    if (ids.has(v.userId) || names.has(v.username)) {
      delete reg.devices[k];
      touched = true;
    }
  }
}
if (touched) {
  await fetch(`https://textdb.dev/api/data/${P}-registry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reg),
  });
  console.log("registro limpio (users/devices)");
}

// Bandejas y stats de cada cuenta de prueba
for (const id of ids) {
  for (const suffix of ["inbox", "u"]) {
    await fetch(`https://textdb.dev/api/data/${P}-${suffix}-${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(suffix === "inbox" ? { v: 1, items: [] } : {}),
    });
  }
}
console.log(`bandejas+stats vaciados: ${ids.size} cuentas`);
