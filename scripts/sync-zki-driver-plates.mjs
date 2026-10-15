import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const source = fs.readFileSync(path.join(process.cwd(), "supabase", "conductores_placas_2026-10-14.sql"), "utf8");
const desired = [...source.matchAll(/\('([A-Z0-9]+)', '([^']+)', (\d+)\)/g)].map((match) => ({
  PLACA: match[1], CONDUCTOR: match[2], "Cedula-RR": Number(match[3]),
}));
if (desired.length !== 42 || new Set(desired.map((row) => row.PLACA)).size !== desired.length) {
  throw new Error("El listado debe contener 42 placas distintas.");
}

const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!base || !key) throw new Error("Falta acceso administrativo a Supabase en .env.local.");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const endpoint = `${base}/rest/v1/Conductores-placas`;

async function rows() {
  const response = await fetch(`${endpoint}?select=*&limit=3000`, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo leer Conductores-placas: ${response.status}`);
  return response.json();
}

const current = await rows();
const missing = desired.filter((target) => !current.some((row) => String(row.PLACA).trim().toUpperCase() === target.PLACA));
const changed = desired.filter((target) => current.some((row) => String(row.PLACA).trim().toUpperCase() === target.PLACA &&
  (String(row.CONDUCTOR || "").trim() !== target.CONDUCTOR || Number(row["Cedula-RR"]) !== target["Cedula-RR"])));
console.log(JSON.stringify({ plates: desired.length, existingRows: current.length, platesToUpdate: changed.length, missingPlates: missing.map((row) => row.PLACA) }));

if (process.argv.includes("--apply")) {
  if (missing.length) {
    const response = await fetch(endpoint, {
      method: "POST", headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(missing),
    });
    if (!response.ok) throw new Error(`No se pudieron insertar las placas faltantes: ${response.status} ${await response.text()}`);
  }

  for (const target of changed) {
    const query = new URLSearchParams({ PLACA: `eq.${target.PLACA}` });
    const response = await fetch(`${endpoint}?${query}`, {
      method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ CONDUCTOR: target.CONDUCTOR, "Cedula-RR": target["Cedula-RR"] }),
    });
    if (!response.ok) throw new Error(`No se pudo actualizar ${target.PLACA}: ${response.status} ${await response.text()}`);
    const updated = await response.json();
    if (!updated.length) throw new Error(`No se actualizó ninguna fila de ${target.PLACA}.`);
  }

  const verified = await rows();
  const mismatches = desired.filter((target) => {
    const matches = verified.filter((row) => String(row.PLACA).trim().toUpperCase() === target.PLACA);
    return !matches.length || matches.some((row) => row.CONDUCTOR !== target.CONDUCTOR || Number(row["Cedula-RR"]) !== target["Cedula-RR"]);
  });
  if (mismatches.length) throw new Error(`Quedaron placas sin actualizar: ${mismatches.map((row) => row.PLACA).join(", ")}`);
  console.log(JSON.stringify({ verifiedPlates: desired.length, status: "ok" }));
}
