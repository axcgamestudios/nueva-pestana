import ZAI from "z-ai-web-dev-sdk";
import { readFileSync } from "node:fs";

async function main() {
  const zai = await ZAI.create();
  const buf = readFileSync("/home/z/my-project/scripts/dots-wave2.mp4");
  const b64 = buf.toString("base64");
  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "This is a 9-second screen recording of a dark game portal webpage with a background of small blue/white dots. Answer concisely: 1) Do the background dots VISIBLY MOVE? Clearly noticeable, subtle, or imperceptible? 2) Do they undulate like 3D waves (coherent rolling motion like a water surface), or just twinkle in place? 3) Do dots grow brighter/larger in traveling wave patterns (crests passing through)? 4) Overall: does it read as an animated 3D wave field of dots?",
          },
          { type: "video_url", video_url: { url: `data:video/mp4;base64,${b64}` } },
        ],
      },
    ],
    thinking: { type: "disabled" },
    // El tipo del SDK aún no declara video_url (el runtime sí lo soporta)
  } as unknown as Parameters<typeof zai.chat.completions.createVision>[0]);
  console.log(response.choices[0]?.message?.content);
}

main().catch((e) => {
  console.error("FALLO:", e.message);
  process.exit(1);
});
