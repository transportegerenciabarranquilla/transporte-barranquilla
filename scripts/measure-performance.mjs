import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

// Static emitted scripts only: excludes dynamic chunks, fonts, CSS and transfer timings.
const pages = ["seguimiento", "personal", "modulacion", "quejas", "personas/evaluaciones-ruta"];
const measurements = pages.map(page => {
  const file = path.join(".next/server/app", `${page}.html`);
  if (!fs.existsSync(file)) return { page, unavailable: true };
  const html = fs.readFileSync(file, "utf8");
  const scripts = [...new Set([...html.matchAll(/<script[^>]+src="\/_next\/([^"?]+\.js)/g)].map(match => match[1]))];
  const bytes = scripts.map(file => fs.readFileSync(path.join(".next", file)));
  return { page, scripts: scripts.length, rawBytes: bytes.reduce((sum, data) => sum + data.length, 0), gzipBytes: bytes.reduce((sum, data) => sum + gzipSync(data).length, 0) };
});
const output = process.argv[2];
if (output) fs.writeFileSync(output, JSON.stringify({ method: "Emitted initial script tags, separate gzip per file; not browser transfer measurements.", measurements }, null, 2));
console.log(JSON.stringify(measurements, null, 2));
