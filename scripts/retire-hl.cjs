/* Inventario por defecto. --apply exporta una copia local antes de eliminar exclusivamente HL. */
const fs = require("node:fs");
const path = require("node:path");
require("@next/env").loadEnvConfig(process.cwd());
const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error("Falta la conexión administrativa.");
const headers = { apikey: key, "Content-Type": "application/json", ...(process.env.SUPABASE_SECRET_KEY ? {} : { Authorization: `Bearer ${key}` }) };
const isHl = value => ["hl", "hllogistica", "hllogisticos", "hllogisticas"].includes(String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""));
const specs = [
  ["seguimiento_vehiculos", "contractor", ["record_id"]],
  ["asistencias_ruta", "contractor", ["attendance_key"]],
  ["modulaciones_ruta", "contractor", ["modulation_id"]],
  ["checkins_cajas", "contractor", ["checkin_id"]],
  ["punto_corona_route_reports", "contractor", ["report_id"]],
  ["daily_route_checklists", "contractor", ["checklist_id"]],
  ["daily_absenteeism", "contractor", ["absence_id"]],
  ["route_complaints", "contractor", ["complaint_id"]],
  ["people_profiles", "contractor", ["profile_id"]],
  ["people_route_evaluations", "contractor", ["id"]],
  ["attendance_snapshots", "contractor", ["id"]],
  ["preventa_clientes", "contractor", ["id"]],
  ["push_subscriptions", "contractor", ["id"]],
  ["audit_logs", "contractor", ["audit_id"]],
  ["transporte_barranquilla", "CONTRATISTA", ["CC", "CONTRATISTA"]],
  ["placas", "Contratista", ["Tractor", "Contratista"]],
  ["SQ01", "Nombre Transportista", ["Transporte", "Placa", "N° Viaje", "Creado el"]],
  ["td_routes", "carrier", ["snapshot_id", "id"]],
];

async function request(table, params, options = {}) {
  const response = await fetch(`${base}/rest/v1/${encodeURIComponent(table)}?${params}`, { ...options, headers: { ...headers, ...options.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${table}: ${response.status} ${body?.code || ""} ${body?.message || ""}`);
  return body;
}

async function inspect() {
  const inventory = [];
  for (const [table, column, keys] of specs) {
    const nested = ["seguimiento_vehiculos", "asistencias_ruta", "modulaciones_ruta", "checkins_cajas", "punto_corona_route_reports", "daily_route_checklists", "daily_absenteeism", "route_complaints", "people_profiles"].includes(table);
    const filters = [`${column}.ilike.*hl*`, ...(nested ? ["data->>contratista.ilike.*hl*", "data->>contractor.ilike.*hl*", "data->>transportista.ilike.*hl*"] : [])];
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const batch = await request(table, new URLSearchParams({ select: "*", or: `(${filters.join(",")})`, limit: "500", offset: String(offset) }));
      rows.push(...batch);
      if (batch.length < 500) break;
    }
    const owned = rows.filter(row => isHl(row[column] || row.data?.contratista || row.data?.contractor || row.data?.transportista));
    const conflicts = rows.length - owned.length;
    inventory.push({ table, column, keys, rows: owned, conflicts });
  }
  return inventory;
}

async function main() {
  const inventory = await inspect();
  console.log(JSON.stringify({ inventory: inventory.map(({ table, rows, conflicts }) => ({ table, rows: rows.length, conflicts })) }));
  if (!process.argv.includes("--apply")) return;
  const backupDir = path.resolve(process.cwd(), ".local-backups", `hl-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, "records.json");
  fs.writeFileSync(backup, JSON.stringify(inventory), { flag: "wx" });
  if (JSON.parse(fs.readFileSync(backup, "utf8")).reduce((sum, item) => sum + item.rows.length, 0) !== inventory.reduce((sum, item) => sum + item.rows.length, 0)) throw new Error("No se verificó el respaldo.");
  console.log(JSON.stringify({ backup }));
  for (const { table, column, keys, rows } of inventory) {
    let deleted = 0;
    for (const row of rows) {
      const params = new URLSearchParams();
      for (const name of keys) {
        if (row[name] === undefined) throw new Error(`Falta la clave ${table}.${name}`);
        params.set(name, row[name] === null ? "is.null" : `eq.${row[name]}`);
      }
      params.set(column, row[column] == null ? "is.null" : `eq.${row[column]}`);
      if (row.updated_at) params.set("updated_at", `eq.${row.updated_at}`);
      const removed = await request(table, params, { method: "DELETE", headers: { Prefer: "return=representation" } });
      deleted += removed.length;
    }
    console.log(JSON.stringify({ table, deleted }));
  }
  const remaining = await inspect();
  console.log(JSON.stringify({ remaining: remaining.filter(item => item.rows.length).map(item => ({ table: item.table, rows: item.rows.length })) }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
