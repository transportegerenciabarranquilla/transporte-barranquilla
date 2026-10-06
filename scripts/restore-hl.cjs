const fs = require("node:fs");
const path = require("node:path");
require("@next/env").loadEnvConfig(process.cwd());
const root = path.resolve(".local-backups/hl-2026-10-06T15-26-20-451Z");
const headers = { apikey: process.env.SUPABASE_SECRET_KEY, "Content-Type": "application/json" };
if (!headers.apikey) throw new Error("Falta la clave administrativa");
const base = process.env.SUPABASE_URL;
async function request(table, query, options = {}) {
  const response = await fetch(base + "/rest/v1/" + encodeURIComponent(table) + "?" + query, { ...options, headers: { ...headers, ...options.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(table + ": " + response.status + " " + (body?.message || ""));
  return body;
}
async function main() {
  const inventory = JSON.parse(fs.readFileSync(path.join(root, "records.json"), "utf8"));
  for (const item of inventory) {
    let inserted = 0;
    for (let offset = 0; offset < item.rows.length; offset += 100) {
      const rows = await request(item.table, "", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(item.rows.slice(offset, offset + 100)) });
      inserted += rows.length;
    }
    if (item.rows.length) console.log(JSON.stringify({ table: item.table, backedUp: item.rows.length, inserted }));
  }
  const zki = JSON.parse(fs.readFileSync(path.join(root, "zki-1791300545776.json.deleted.json"), "utf8"));
  const documents = [...new Set(zki.map(row => row.Cedula))];
  const existing = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await request("ZKI", new URLSearchParams({ select: "*", Cedula: "in.(" + documents.join(",") + ")", limit: "500", offset: String(offset) }));
    existing.push(...batch);
    if (batch.length < 500) break;
  }
  const key = row => JSON.stringify(Object.keys(row).sort().map(name => [name, row[name]]));
  const present = new Map();
  for (const row of existing) present.set(key(row), (present.get(key(row)) || 0) + 1);
  const missing = zki.filter(row => {
    const count = present.get(key(row)) || 0;
    if (!count) return true;
    present.set(key(row), count - 1);
    return false;
  });
  for (let offset = 0; offset < missing.length; offset += 100) await request("ZKI", "", { method: "POST", body: JSON.stringify(missing.slice(offset, offset + 100)) });
  console.log(JSON.stringify({ table: "ZKI", restored: missing.length }));
  const account = JSON.parse(fs.readFileSync(path.resolve(".local-backups/hl-account/1791300430199.json"), "utf8"));
  if (account.email?.toLowerCase() !== "hllogistica@gmail.com") throw new Error("Cuenta inesperada");
  const response = await fetch(base + "/auth/v1/admin/users/" + account.id, { method: "PUT", headers, body: JSON.stringify({ ban_duration: "none" }) });
  if (!response.ok) throw new Error("No se pudo reactivar la cuenta");
  const user = await response.json();
  if (user.banned_until && Date.parse(user.banned_until) > Date.now()) throw new Error("La cuenta sigue bloqueada");
  console.log("Cuenta HL reactivada");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
