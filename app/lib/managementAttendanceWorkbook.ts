import * as XLSX from "xlsx";

type SavedClockRow = {
  identificador?: string;
  nombreCompleto?: string;
  cargo?: string;
  contratista?: string;
  fechaKey?: string;
  entrada?: string;
  salida?: string;
  novedad?: string;
  relevoUsado?: boolean;
};

type SavedSnapshot = {
  operationalDate: string;
  fileName: string;
  uploadedAt: string;
  closedAt: string | null;
  rows: SavedClockRow[];
};

export function createManagementAttendanceHistoryWorkbook(snapshots: SavedSnapshot[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const attendanceHeaders = ["Fecha corte", "Archivo cargado", "Identificador", "Nombres", "Cargo", "Contratista", "Fecha marcación", "Entró", "Salió", "Novedad", "Relevo usado"];
  const attendanceRows = snapshots.flatMap((snapshot) => snapshot.rows.map((row) => [
    snapshot.operationalDate,
    snapshot.fileName,
    row.identificador || "",
    row.nombreCompleto || "",
    row.cargo || "",
    row.contratista || "",
    row.fechaKey || snapshot.operationalDate,
    row.entrada || "",
    row.salida || "",
    row.novedad || "",
    row.relevoUsado === undefined ? "" : row.relevoUsado ? "Sí" : "No",
  ]));
  const attendance = XLSX.utils.aoa_to_sheet([attendanceHeaders, ...attendanceRows]);
  attendance["!cols"] = [{ wch: 16 }, { wch: 32 }, { wch: 18 }, { wch: 36 }, { wch: 24 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 16 }];
  attendance["!autofilter"] = { ref: `A1:K${attendanceRows.length + 1}` };
  XLSX.utils.book_append_sheet(workbook, attendance, "Marcaciones");

  const history = XLSX.utils.aoa_to_sheet([
    ["Fecha corte", "Archivo cargado", "Fecha de carga", "Fecha de cierre", "Registros guardados"],
    ...snapshots.map((snapshot) => [snapshot.operationalDate, snapshot.fileName, snapshot.uploadedAt, snapshot.closedAt || "", snapshot.rows.length]),
  ]);
  history["!cols"] = [{ wch: 16 }, { wch: 36 }, { wch: 25 }, { wch: 25 }, { wch: 20 }];
  history["!autofilter"] = { ref: `A1:E${snapshots.length + 1}` };
  XLSX.utils.book_append_sheet(workbook, history, "Cortes guardados");

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Nota"],
    ["El historial contiene los registros actualmente guardados por fecha y contratista. Una carga posterior sobre el mismo corte reemplaza la anterior."],
    ["Se exportan los datos guardados; los archivos Excel originales no se conservan."],
  ]), "Información");

  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}
