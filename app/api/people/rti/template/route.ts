import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";

export const runtime = "nodejs";

const VALID_TARGETS = new Set(["RACOCIMI1", "RACOCIMI2"]);

export async function GET(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const requestedTarget = new URL(request.url).searchParams.get("target")?.toUpperCase() || "RACOCIMI1";
  const target = VALID_TARGETS.has(requestedTarget) ? requestedTarget : "RACOCIMI1";
  const operation = target === "RACOCIMI1" ? "salida" : "retorno";

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Transporte Barranquilla";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Carga", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Ruta", key: "ruta", width: 18 },
    { header: "Transporte", key: "transporte", width: 18 },
    { header: "Material", key: "material", width: 20 },
    { header: "Cantidad real", key: "cantidad", width: 20 },
    { header: "Verif.unidad medida", key: "unidad", width: 24 },
  ];
  sheet.autoFilter = "A1:E1";
  sheet.getRow(1).height = 26;
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: target === "RACOCIMI1" ? "FF047857" : "FF2563EB" } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  ["A", "B", "C"].forEach((column) => { sheet.getColumn(column).numFmt = "@"; });
  sheet.getColumn("D").numFmt = "0.00";

  for (let row = 2; row <= 1001; row += 1) {
    sheet.getCell(`D${row}`).dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      allowBlank: false,
      showErrorMessage: true,
      errorTitle: "Cantidad no válida",
      error: "Ingresa una cantidad numérica igual o superior a cero.",
      formulae: [0],
    };
  }

  const instructions = workbook.addWorksheet("Instrucciones");
  instructions.columns = [{ width: 28 }, { width: 90 }];
  instructions.addRows([
    [`Plantilla ${target}`, `Plantilla para cargar movimientos de ${operation} en RTI. Completa únicamente la hoja Carga.`],
    ["Ruta", "Código de ruta. Es obligatorio; consérvalo como texto para no perder ceros iniciales."],
    ["Transporte", "Número de transporte o DT asociado a la ruta. Es obligatorio."],
    ["Material", target === "RACOCIMI1" ? "Código del producto/material despachado." : "Código del envase retornado o del producto retornado."],
    ["Cantidad real", "Cantidad registrada en el movimiento. Debe ser numérica y no negativa."],
    ["Verif.unidad medida", "Unidad de medida del registro, por ejemplo CA o UN."],
    ["Importante", "No cambies los encabezados ni el nombre de la hoja Carga. El sistema reemplaza los datos anteriores de las rutas incluidas para evitar duplicados."],
  ]);
  instructions.getRow(1).height = 32;
  instructions.getRow(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  instructions.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10223D" } };
  instructions.getColumn(1).font = { bold: true };
  instructions.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="plantilla-rti-${target.toLowerCase()}.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
