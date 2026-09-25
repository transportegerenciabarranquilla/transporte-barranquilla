export type DiferenciaKM = {
  fila: number;
  placa: string;
  Responsable: string;
  conductor: string;
  registros: number;
  plan_km: number;
  eje_km: number;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

export function parseKilometerRows(data: unknown[][]): DiferenciaKM[] {
  if (!data.length) throw new Error("La primera hoja está vacía.");
  const headers = data[0].map((value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_"));
  for (const name of ["plan_km", "eje_km"]) {
    if (!headers.includes(name)) throw new Error(`Falta la columna ${name} en la primera fila.`);
  }
  for (const name of ["plan_km", "eje_km", "registros", "placa", "responsable", "conductor"]) {
    if (headers.filter((header) => header === name).length > 1) throw new Error(`La columna ${name} está repetida.`);
  }
  const rows: DiferenciaKM[] = [];
  data.slice(1).forEach((cells, index) => {
    if (cells.every((value) => value == null || String(value).trim() === "")) return;
    const fila = index + 2;
    const plan_km = parseNumber(cells[headers.indexOf("plan_km")]);
    const eje_km = parseNumber(cells[headers.indexOf("eje_km")]);
    const recordIndex = headers.indexOf("registros");
    const registros = recordIndex === -1 ? fila : parseNumber(cells[recordIndex]);
    if (plan_km === null || eje_km === null) throw new Error(`Fila ${fila}: plan_km y eje_km deben ser números no negativos. No dejes celdas vacías ni uses separadores de miles en textos.`);
    if (registros === null || !Number.isSafeInteger(registros)) throw new Error(`Fila ${fila}: registros debe ser un entero no negativo.`);
    const text = (name: string) => String(cells[headers.indexOf(name)] ?? "").trim();
    rows.push({ fila, registros, plan_km, eje_km, placa: text("placa"), Responsable: text("responsable"), conductor: text("conductor") });
  });
  if (!rows.length) throw new Error("La primera hoja no contiene registros para comparar.");
  return rows;
}
