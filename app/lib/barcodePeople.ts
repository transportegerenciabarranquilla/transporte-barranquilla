export type BarcodePerson = { document: string; name: string };
const header = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function parseBarcodePeople(rows: unknown[][]) {
  const titles = (rows[0] || []).map(header);
  const idIndex = titles.findIndex((v) => ["cedula", "cc", "documento", "numerodecedula", "numerodedocumento", "identificador"].includes(v));
  const nameIndex = titles.findIndex((v) => ["nombre", "nombrecompleto", "nombres", "nombreyapellido", "nombresyapellidos", "nombrecompletodeltrabajador"].includes(v));
  if (idIndex < 0 || nameIndex < 0) throw new Error("La primera fila debe tener las columnas Cédula y Nombre.");
  const people: BarcodePerson[] = [];
  const seen = new Map<string, string>();
  const issues: string[] = [];
  let duplicates = 0;
  for (const [index, row] of rows.entries()) {
    if (index === 0 || row.every((v) => !String(v ?? "").trim())) continue;
    const raw = row[idIndex];
    const document = String(raw ?? "").trim().replace(/[.\s]/g, "");
    const name = String(row[nameIndex] ?? "").trim();
    if ((typeof raw === "number" && (!Number.isSafeInteger(raw) || raw < 0)) || !/^\d{1,15}$/.test(document) || !name || name.length > 150) {
      issues.push(`Fila ${index + 1}: cédula o nombre inválido.`); continue;
    }
    if (seen.has(document)) {
      duplicates++;
      if (seen.get(document) !== name) issues.push(`Fila ${index + 1}: cédula repetida con otro nombre; se conservó el primero.`);
      continue;
    }
    seen.set(document, name);
    people.push({ document, name });
  }
  return { people, issues, duplicates };
}
