"use client";

import { useState, type ChangeEvent } from "react";
import { parseBarcodePeople, type BarcodePerson } from "../lib/barcodePeople";

export function BarcodeLabels() {
  const [people, setPeople] = useState<BarcodePerson[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPeople([]); setIssues([]); setMessage(""); setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("El archivo debe pesar menos de 10 MB.");
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      if (!book.SheetNames.length) throw new Error("El archivo no contiene hojas.");
      const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: "", raw: false });
      if (rows.length > 5001) throw new Error("Carga hasta 5.000 personas por archivo.");
      const parsed = parseBarcodePeople(rows);
      setPeople(parsed.people); setIssues(parsed.issues);
      setMessage(`${parsed.people.length} etiquetas listas. ${parsed.duplicates} duplicados omitidos. ${parsed.issues.length} filas con observaciones.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo leer el Excel."); }
    finally { setBusy(false); }
  }

  async function template() {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Cédula", "Nombre"]]), "Personas");
    XLSX.writeFile(book, "plantilla-codigos.xlsx");
  }

  async function download() {
    setBusy(true);
    try {
      const [{ default: JsBarcode }, { jsPDF }] = await Promise.all([import("jsbarcode"), import("jspdf")]);
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      for (let index = 0; index < people.length; index++) {
        if (index && index % 16 === 0) pdf.addPage();
        const person = people[index];
        const slot = index % 16;
        const x = 10 + (slot % 2) * 97;
        const y = 10 + Math.floor(slot / 2) * 34;
        const canvas = document.createElement("canvas");
        JsBarcode(canvas, person.document, { format: "CODE128", width: 3, height: 65, margin: 20, displayValue: false });
        pdf.setDrawColor(210); pdf.roundedRect(x, y, 93, 32, 2, 2);
        let fontSize = 9;
        pdf.setFontSize(fontSize);
        let lines = pdf.splitTextToSize(person.name, 85) as string[];
        while (lines.length > 2 && fontSize > 5) {
          pdf.setFontSize(--fontSize);
          lines = pdf.splitTextToSize(person.name, 85) as string[];
        }
        pdf.text(lines, x + 46.5, y + 4, { align: "center" });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", x + 8, y + 10, 77, 15);
        pdf.setFontSize(9);
        pdf.text(person.document, x + 46.5, y + 29, { align: "center" });
        if (index % 32 === 0) {
          setMessage(`Generando etiqueta ${index + 1} de ${people.length}…`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      pdf.save("codigos-cedulas.pdf");
      setMessage(`PDF generado con ${people.length} etiquetas. Imprime en tamaño real (100%).`);
    } catch { setMessage("No se pudo generar el PDF. Intenta con un lote más pequeño."); }
    finally { setBusy(false); }
  }

  return <section className="mx-auto max-w-5xl px-5 pb-12"><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="text-xl font-black">Generar etiquetas desde Excel</h2>
    <p className="mt-2 text-sm text-slate-600">Primera hoja con columnas Cédula y Nombre. Cada etiqueta muestra el nombre y la cédula; el código contiene solo la cédula. Este archivo no cambia los datos de descanso.</p>
    <p className="mt-2 text-xs text-slate-500">Hasta 5.000 personas por lote. Guarda las cédulas como texto, sin fórmulas ni notación científica, para conservar todos sus dígitos.</p>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button className="rounded-xl border px-4 py-3 text-sm font-bold" disabled={busy} type="button" onClick={() => void template().catch(() => setMessage("No se pudo descargar la plantilla."))}>Descargar plantilla</button>
      <label className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold">Cargar Excel<input aria-label="Cargar Excel de cédulas y nombres" className="mt-2 block max-w-full text-xs" type="file" accept=".xlsx,.xls" disabled={busy} onChange={(event) => void upload(event)} /></label>
      <button className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={busy || !people.length} type="button" onClick={() => void download()}>{busy ? "Procesando…" : `Descargar PDF (${people.length})`}</button>
    </div>
    <p role="status" className="mt-4 text-sm font-semibold">{message}</p>
    {!!issues.length && <details className="mt-3 text-sm text-amber-800"><summary>Revisar observaciones</summary><ul>{issues.slice(0, 100).map((issue) => <li key={issue}>{issue}</li>)}</ul>{issues.length > 100 && <p>Se muestran las primeras 100 observaciones.</p>}</details>}
    {!!people.length && <div className="mt-4 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Cédula</th><th className="p-2">Nombre</th></tr></thead><tbody>{people.slice(0, 10).map((person) => <tr className="border-t" key={person.document}><td className="p-2">{person.document}</td><td className="p-2">{person.name}</td></tr>)}</tbody></table><p className="text-xs text-slate-500">Vista previa de las primeras 10 personas. El PDF incluye todas las etiquetas válidas.</p></div>}
  </div></section>;
}
