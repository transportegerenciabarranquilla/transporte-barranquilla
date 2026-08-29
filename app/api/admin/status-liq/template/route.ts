import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Transporte Barranquilla";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Carga", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "DT", key: "dt", width: 18 },
    { header: "Hora liquidacion", key: "hora", width: 24 },
  ];
  sheet.autoFilter = "A1:B1";
  sheet.getRow(1).height = 24;
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  sheet.getRow(1).alignment = { vertical: "middle" };
  sheet.getColumn("A").numFmt = "0";
  sheet.getColumn("B").numFmt = "hh:mm:ss";

  for (let row = 2; row <= 1001; row += 1) {
    sheet.getCell(`B${row}`).dataValidation = {
      type: "decimal",
      operator: "between",
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "Hora no válida",
      error: "Ingresa una hora entre 00:00:00 y 23:59:59.",
      formulae: [0, 0.9999884259],
    };
  }

  const instructions = workbook.addWorksheet("Instrucciones");
  instructions.columns = [{ width: 25 }, { width: 75 }];
  instructions.addRows([
    ["Plantilla Estatus Liq", "Completa la hoja Carga y luego súbela desde el módulo Estatus Liq."],
    ["DT", "Número de DT. Es obligatorio y debe contener únicamente dígitos."],
    ["Hora liquidacion", "Hora real de liquidación en formato HH:mm o HH:mm:ss, por ejemplo 18:35:00."],
    ["Importante", "No cambies los nombres de las columnas ni el nombre/orden de la hoja Carga."],
  ]);
  instructions.getRow(1).height = 28;
  instructions.getRow(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  instructions.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10223D" } };
  instructions.getColumn(1).font = { bold: true };
  instructions.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="plantilla-estatus-liq.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
