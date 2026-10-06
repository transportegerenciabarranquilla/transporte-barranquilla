const fs = require("node:fs");
const path = require("node:path");
require("@next/env").loadEnvConfig(process.cwd());
async function main() {
  const backup = path.resolve(process.argv[2] || "");
  if (!backup.startsWith(path.resolve(".local-backups") + path.sep)) throw new Error("Respaldo fuera del directorio esperado");
  const inventory = JSON.parse(fs.readFileSync(backup, "utf8"));
  const ids = [...new Set(inventory.find(item => item.table === "transporte_barranquilla").rows.map(row => String(row.CC)))];
  const headers = { apikey: process.env.SUPABASE_SECRET_KEY, "Content-Type": "application/json" };
  if (!headers.apikey) throw new Error("Falta conexión administrativa");
  const base = process.env.SUPABASE_URL + "/rest/v1/";
  async function read(table, params) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const query = new URLSearchParams({ ...params, select: "*", limit: "500", offset: String(offset) });
      const response = await fetch(base + table + "?" + query, { headers });
      if (!response.ok) throw new Error(table + ": " + response.status);
      const batch = await response.json();
      rows.push(...batch);
      if (batch.length < 500) return rows;
    }
  }
  const isHl = value => /^hl(logistica|logisticos|logisticas)?$/.test(String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, ""));
  const people = await read("transporte_barranquilla", { CC: "in.(" + ids.join(",") + ")" });
  const exclusive = ids.filter(id => !people.some(row => String(row.CC) === id && !isHl(row.CONTRATISTA)));
  if (!exclusive.length) return;
  const params = { Cedula: "in.(" + exclusive.join(",") + ")" };
  const rows = await read("ZKI", params);
  const file = path.join(path.dirname(backup), "zki-" + Date.now() + ".json");
  fs.writeFileSync(file, JSON.stringify(rows), { flag: "wx" });
  console.log(JSON.stringify({ zkiExclusiveReferences: rows.length, backup: file }));
  if (!process.argv.includes("--apply")) return;
  const response = await fetch(base + "ZKI?" + new URLSearchParams(params), { method: "DELETE", headers: { ...headers, Prefer: "return=representation" } });
  if (!response.ok) throw new Error("ZKI: " + response.status);
  const removed = await response.json();
  fs.writeFileSync(file + ".deleted.json", JSON.stringify(removed), { flag: "wx" });
  console.log(JSON.stringify({ zkiDeleted: removed.length, remaining: (await read("ZKI", params)).length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
