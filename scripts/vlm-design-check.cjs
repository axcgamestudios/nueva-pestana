// Verificación visual VLM de las capturas del nuevo diseño axcStudios
const ZAI = require("z-ai-web-dev-sdk").default;
const fs = require("fs");

async function main() {
  const zai = await ZAI.create();
  const shots = [
    ["/tmp/e2e-02-studio.png", "Página Estudio (hero)"],
    ["/tmp/e2e-05-store-unlocked.png", "Tienda desbloqueada con grid de juegos"],
    ["/tmp/e2e-06-player-loading.png", "Reproductor: pantalla de carga con motion graphics"],
    ["/tmp/e2e-04-auth-modal.png", "Modal de cuentas liquid glass"],
  ];
  for (const [path, label] of shots) {
    const b64 = fs.readFileSync(path).toString("base64");
    const res = await zai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Revisa esta captura de una web de juegos (" + label + "). Diseño esperado: tema oscuro liquid glass con acentos azul #2e7cf6 y cian #38e8ff, tipografía Space Grotesk. Responde en español, máximo 60 palabras: ¿qué se ve? ¿hay defectos visuales (texto cortado, elementos superpuestos, columnas vacías, elementos blancos que rompen el tema oscuro, desbordes)?",
            },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });
    console.log("=== " + label + " ===");
    console.log(res.choices[0]?.message?.content ?? "(sin respuesta)");
    console.log();
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
