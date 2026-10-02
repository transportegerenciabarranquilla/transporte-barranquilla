import * as XLSX from "xlsx";
import type { ComplaintExcelRow } from "./complaintCharts.ts";
import { parseComplaintChartRows, suggestComplaintChartMapping } from "./complaintCharts.ts";

export function importComplaintChartWorkbook(book: XLSX.WorkBook) {
  for (const name of book.SheetNames) {
    const rows = complaintChartExcelRows(book, name);
    if (!rows.length) continue;
    const mapping = suggestComplaintChartMapping(Object.keys(rows[0]));
    if (![mapping.contractor, mapping.date, mapping.status, mapping.issue].some(Boolean)) continue;
    if (rows.length > 50_000) throw new Error("La hoja supera el límite de 50.000 filas.");
    return { name, rows: parseComplaintChartRows(rows, mapping) };
  }
  throw new Error("No se encontró una hoja con quejas. Coloca los encabezados Transportista, Estatus, Novedad y Fecha de ingreso de la novedad en la primera fila.");
}

export function complaintChartExcelRows(book: XLSX.WorkBook, name: string): ComplaintExcelRow[] {
  const sheet = { ...book.Sheets[name] };
  // Read Excel's stored calendar date instead of its localized display text.
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const cell = sheet[address] as XLSX.CellObject;
    if (cell.t !== "n" || typeof cell.v !== "number" || !cell.z || !XLSX.SSF.is_date(cell.z)) continue;
    const date = XLSX.SSF.parse_date_code(cell.v, { date1904: Boolean(book.Workbook?.WBProps?.date1904) });
    if (!date) continue;
    const day = `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    const hasTime = cell.v % 1 !== 0 || /[hs]/i.test(String(cell.z).replace(/"[^"]*"/g, ""));
    const totalSeconds = Math.min(86399, Math.round(date.H * 3600 + date.M * 60 + date.S + (date.u || 0)));
    const clock = [Math.floor(totalSeconds / 3600), Math.floor(totalSeconds / 60) % 60, totalSeconds % 60].map(part => String(part).padStart(2, "0")).join(":");
    const value = hasTime ? `${day}T${clock}` : day;
    sheet[address] = { t: "s", v: value };
  }
  return XLSX.utils.sheet_to_json<ComplaintExcelRow>(sheet, { defval: "", raw: false });
}
