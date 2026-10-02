import type * as XLSX from "xlsx";
import { coordinateDay, type CoordinateRecord } from "./coordinateRecords";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function coordinateExportSheet(rows: readonly CoordinateRecord[], xlsx: typeof XLSX) {
  const sheet = xlsx.utils.aoa_to_sheet([
    ["ID", "Fecha (Bogotá)", "Contratista", "RR", "Cédula RR", "Código de cliente", "Cliente", "Latitud", "Longitud", "Hora (Bogotá)", "Coordenadas para copiar", "Mapa"],
    ...rows.map(row => {
      const date = coordinateDay(row.createdAt);
      const coordinates = `${row.latitud.toFixed(6)}, ${row.longitud.toFixed(6)}`;
      // A native Excel date avoids interpreting day/month using the PC locale.
      const excelDate = date ? (Date.parse(`${date}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000 : "";
      return [row.id, excelDate, row.contratista, row.nombreRr, row.tipo, row.codigoCliente, row.ruta,
        row.latitud.toFixed(6), row.longitud.toFixed(6), date ? timeFormat.format(new Date(row.createdAt)) : "", coordinates, "Ver ubicación"];
    }),
  ]);
  rows.forEach((row, index) => {
    sheet[`B${index + 2}`].z = "dd/mm/yyyy";
    // Text keeps the decimal point when copied, regardless of Excel's locale.
    sheet[`H${index + 2}`].z = "@";
    sheet[`I${index + 2}`].z = "@";
    sheet[`L${index + 2}`].l = {
      Target: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.latitud},${row.longitud}`)}`,
      Tooltip: "Abrir las coordenadas originales en Google Maps",
    };
  });
  sheet["!cols"] = [10, 18, 24, 30, 18, 20, 40, 18, 18, 18, 30, 20].map(wch => ({ wch }));
  sheet["!autofilter"] = { ref: sheet["!ref"]! };
  return sheet;
}
