const fs = require("node:fs");
const path = require("node:path");
require("@next/env").loadEnvConfig(process.cwd());
async function main() {
  const headers = { apikey: process.env.SUPABASE_SECRET_KEY, "Content-Type": "application/json" };
  if (!headers.apikey) throw new Error("Falta conexión administrativa");
  const endpoint = process.env.SUPABASE_URL + "/auth/v1/admin/users";
  const response = await fetch(endpoint + "?per_page=1000", { headers });
  if (!response.ok) throw new Error("No se pudo verificar la cuenta");
  const matches = (await response.json()).users.filter(user => user.email?.toLowerCase() === "hllogistica@gmail.com");
  if (matches.length !== 1) throw new Error("La cuenta no es inequívoca");
  const user = matches[0];
  const directory = path.resolve(".local-backups", "hl-account");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, Date.now() + ".json"), JSON.stringify(user), { flag: "wx" });
  const result = await fetch(endpoint + "/" + user.id, { method: "PUT", headers, body: JSON.stringify({ ban_duration: "876000h" }) });
  if (!result.ok) throw new Error("No se pudo bloquear la cuenta: " + result.status);
  const banned = await result.json();
  if (!banned.banned_until) throw new Error("Bloqueo no confirmado");
  console.log("Cuenta HL bloqueada; respaldo local disponible.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
