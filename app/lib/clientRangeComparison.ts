import type { ClientRangeSummary } from "./clientRangeSummary";

export type ComparisonMapping = { code: number; name: number; contractor: number };
export type ComparisonClient = { code: string; name: string; contractor: string; sourceRows: number[] };
const codeKey = (value: string) => value.trim().toLocaleLowerCase("es-CO");
const labelKey = (value: string) => codeKey(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

export function suggestComparisonMapping(headers: string[]): ComparisonMapping {
  const find = (names: string[]) => headers.findIndex(header => names.some(name => labelKey(name) === labelKey(header)));
  return {
    code: find(["codigo", "codigo cliente", "codigo del cliente", "cliente codigo", "poc_external_id", "customer id", "cod cliente", "id cliente", "codigo sap", "codigo pdv", "cod", "customer code", "client code"]),
    name: find(["nombre", "cliente", "nombre cliente", "nombre del cliente", "poc_name", "customer name"]),
    contractor: find(["contratista", "transportista", "contractor"]),
  };
}

export function detectComparisonSheet(sheets: { name: string; rows: string[][] }[]) {
  for (const sheet of sheets) {
    for (let header = 0; header < Math.min(20, sheet.rows.length); header++) {
      const mapping = suggestComparisonMapping(sheet.rows[header]);
      if (mapping.code < 0) continue;
      if (sheet.rows.length - header > 50_001) throw new Error(`La hoja «${sheet.name}» supera las 50.000 filas. Divide el archivo para compararlo.`);
      if (sheet.rows[header].filter(value => suggestComparisonMapping([value]).code >= 0).length > 1) throw new Error(`La hoja «${sheet.name}» tiene varias columnas de códigos. Deja una sola columna «Código cliente» para identificar el cliente que quieres comparar.`);
      // Mantener la numeración original de filas, aunque haya títulos antes del encabezado.
      const matrix = [sheet.rows[header], ...Array.from({ length: header }, () => [] as string[]), ...sheet.rows.slice(header + 1)];
      if (!matrix.slice(1).some(row => String(row[mapping.code] ?? "").trim())) continue;
      return { ...parseComparisonClients(matrix, mapping), sheetName: sheet.name };
    }
  }
  throw new Error("No encontramos una columna de códigos de cliente. Usa el encabezado «Código cliente» y coloca los códigos debajo. También reconocemos «Código», «Código SAP» e «ID cliente».");
}

export function parseComparisonClients(matrix: string[][], mapping: ComparisonMapping) {
  if (mapping.code < 0) throw new Error("Selecciona la columna del código de cliente.");
  const selected = Object.values(mapping).filter(index => index >= 0);
  if (new Set(selected).size !== selected.length) throw new Error("Selecciona una columna diferente para cada campo.");
  const clients = new Map<string, ComparisonClient>();
  let skipped = 0;
  let duplicates = 0;
  for (let index = 1; index < matrix.length; index++) {
    const row = matrix[index];
    if (row.every(cell => !String(cell ?? "").trim())) continue;
    const code = String(row[mapping.code] ?? "").trim();
    if (!code) { skipped++; continue; }
    const name = String(row[mapping.name] ?? "").trim();
    const contractor = String(row[mapping.contractor] ?? "").trim();
    const key = JSON.stringify([codeKey(code), labelKey(contractor)]);
    const existing = clients.get(key);
    if (existing) { existing.sourceRows.push(index + 1); duplicates++; continue; }
    clients.set(key, { code, name, contractor, sourceRows: [index + 1] });
  }
  if (!clients.size) throw new Error("No hay códigos de cliente válidos en la columna seleccionada.");
  return { clients: [...clients.values()], skipped, duplicates };
}

export function compareRangeClients(clients: ComparisonClient[], appRows: ClientRangeSummary[], normalizeContractor: (value: string) => string = labelKey) {
  const index = new Map<string, ClientRangeSummary[]>();
  for (const row of appRows) {
    if (!row.code.trim()) continue;
    const key = codeKey(row.code);
    const group = index.get(key) || [];
    group.push(row);
    index.set(key, group);
  }
  return clients.map(client => {
    const matches = (index.get(codeKey(client.code)) || []).filter(row => !client.contractor || normalizeContractor(row.contractor) === normalizeContractor(client.contractor));
    return { client, matches, status: matches.length > 1 ? "multiple" as const : matches.length ? "found" as const : "missing" as const };
  });
}
