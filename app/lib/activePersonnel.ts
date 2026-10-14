export function normalizeCedula(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (/^\d+(?:\.0+)?$/.test(trimmed)) return trimmed.replace(/\.0+$/, "");
  return "";
}

export function remainingActivePersonnel<T extends { id: string }>(personnel: T[], assignedIds: Iterable<string>): T[] {
  const key = (id: string) => normalizeCedula(id).replace(/^0+(?=\d)/, "");
  const assigned = new Set([...assignedIds].map(key).filter(Boolean));
  return personnel.filter((person) => {
    const id = key(person.id);
    return Boolean(id) && !assigned.has(id);
  });
}

function isCedulaHeader(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const header = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ["cedula", "cc", "documento", "numerodedocumento", "numerodocumento", "identificacion", "id"].includes(header);
}

export function parseActivePersonnelIds(sheets: Array<{ name: string; rows: unknown[][] }>): string[] {
  const ids = new Set<string>();
  for (const sheet of sheets) {
    const firstIndex = sheet.rows.findIndex((row) => row.some((value) => value !== null && value !== undefined && String(value).trim() !== ""));
    if (firstIndex < 0) continue;
    const first = sheet.rows[firstIndex];
    const headerColumn = first.findIndex(isCedulaHeader);
    if (headerColumn < 0 && first.filter((value) => value !== null && value !== undefined && String(value).trim() !== "").length > 1) {
      throw new Error(`La hoja ${sheet.name} necesita una columna Cédula o una sola columna de cédulas.`);
    }
    const column = headerColumn < 0 ? first.findIndex((value) => value !== null && value !== undefined && String(value).trim() !== "") : headerColumn;
    for (let index = headerColumn < 0 ? firstIndex : firstIndex + 1; index < sheet.rows.length; index += 1) {
      const value = sheet.rows[index][column];
      if (value === null || value === undefined || String(value).trim() === "") continue;
      const id = normalizeCedula(value);
      if (!id) throw new Error(`Cédula inválida en ${sheet.name}, fila ${index + 1}.`);
      ids.add(id);
    }
  }
  if (!ids.size) throw new Error("El Excel no contiene cédulas activas.");
  return [...ids];
}
