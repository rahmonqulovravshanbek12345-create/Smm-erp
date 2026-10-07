// GitHub Pages'ni lokal taqlid qiladi: dist/ papkasi faqat /<repo>/ prefiksi ostida beriladi.
// Prefiksdan tashqaridagi har qanday so'rov 404 — mutlaq yo'llar (/img.png) darhol ko'rinadi.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../dist/", import.meta.url));
const BASE = `/${process.env.PAGES_REPO ?? "Smm-erp"}/`;
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === BASE.slice(0, -1)) {
    res.writeHead(301, { Location: BASE });
    return res.end();
  }
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("404 (GitHub Pages: prefiksdan tashqarida)");
  }
  let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || "index.html";
  if (rel.endsWith("/")) rel += "index.html";
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    const body = await readFile(file);
    if (/text|javascript|json|svg/.test(type) && /gzip/.test(req.headers["accept-encoding"] ?? "")) {
      res.writeHead(200, { "Content-Type": type, "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
      return res.end(gzipSync(body));
    }
    res.writeHead(200, { "Content-Type": type });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`GitHub Pages taqlidi: http://127.0.0.1:${PORT}${BASE}`));
