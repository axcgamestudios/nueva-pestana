/**
 * Servidor estático ligero para probar el build de producción localmente.
 * Sirve ./out bajo la subruta /nueva-pestana (igual que GitHub Pages),
 * soportando trailingSlash y JSON con Content-Type correcto.
 *
 * Uso: node scripts/serve-out.js [puerto]   (por defecto 4173)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2] || 4173);
const ROOT = path.join(__dirname, "..", "out");
const BASE = "/nueva-pestana";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch {
    res.writeHead(400).end("bad request");
    return;
  }
  if (url === BASE || url === BASE + "/") url = BASE + "/index.html";
  if (!url.startsWith(BASE + "/") && url !== BASE) {
    res.writeHead(302, { Location: BASE + "/" }).end();
    return;
  }
  let rel = url.slice(BASE.length) || "/";
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      // emular trailingSlash: /foo -> /foo/index.html
      const alt = path.join(ROOT, rel, "index.html");
      fs.readFile(alt, (err2, data2) => {
        if (err2) {
          res.writeHead(404).end("not found");
        } else {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(data2);
        }
      });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    }).end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`sirviendo out/ en http://127.0.0.1:${PORT}${BASE}/`);
});
