"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileDown } from "lucide-react";
import { CHECKIN_STORAGE_KEY, getCheckinByDt, readCheckinCajasRegistros, type CheckinCajasRegistro } from "../../../lib/checkinStorage";
import { getLocalDateKey, getOperationalModulaciones, MODULACION_STORAGE_KEY, normalizeDt, readModulacionRegistros, summarizeModulaciones, type ModulacionRegistro } from "../../../lib/modulacionStorage";
import { SEGUIMIENTO_STORAGE_KEY } from "../../../lib/seguimientoStorage";
import { useStorageSnapshot } from "../../../lib/storageEvents";
import { loadSeguimientoVehiculos } from "../../services/vehicleRecords";
import type { Vehiculo } from "../../types";
import { useContractorBrand } from "../../../lib/contractorBranding";

type RefusalComRow = {
  causal: string;
  com: string;
  establecimiento: string;
  jefeVentas: string;
  placa: string;
  rechazadas: number;
  rr: string;
};

export default function ReportePdfPage() {
  const router = useRouter();
  const brand = useContractorBrand();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const vehicles = useStorageSnapshot<Vehiculo[]>(
    [SEGUIMIENTO_STORAGE_KEY, MODULACION_STORAGE_KEY, CHECKIN_STORAGE_KEY],
    loadSeguimientoVehiculos,
    [],
  );
  const modulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, []);
  const checkins = useStorageSnapshot<CheckinCajasRegistro[]>([CHECKIN_STORAGE_KEY], readCheckinCajasRegistros, []);

  const todayVehicles = useMemo(() => vehicles.filter(isTodayVehicle), [vehicles]);
  const todayModulaciones = useMemo(
    () => getOperationalModulaciones(modulaciones, todayVehicles),
    [modulaciones, todayVehicles],
  );

  const seguimiento = useMemo(() => {
    const clientes = todayVehicles.reduce((total, item) => total + (item.clientes || 0), 0);
    const visitados = todayVehicles.reduce((total, item) => total + (item.visitados || 0), 0);
    const cajas = todayVehicles.reduce((total, item) => total + (item.cajas || 0), 0);
    const hl = todayVehicles.reduce((total, item) => total + (item.hl || 0), 0);

    return {
      avance: clientes ? Math.round((visitados / clientes) * 100) : 0,
      cajas,
      clientes,
      hl: hl.toFixed(1),
      vehiculos: todayVehicles.length,
      visitados,
    };
  }, [todayVehicles]);

  const refusal = useMemo(() => {
    const totalCajasSeguimiento = todayVehicles.reduce((acc, vehicle) => acc + (vehicle.cajas || 0), 0);
    const byVehicle = todayVehicles.map((vehicle) => {
      const registrosDt = todayModulaciones.filter((registro) => normalizeDt(registro.dt) === normalizeDt(vehicle.transporte));
      const checkin = getCheckinByDt(checkins, vehicle.transporte);
      return summarizeModulaciones(registrosDt, vehicle.cajas || 0, checkin?.totalCajas);
    });
    const rechazadas = byVehicle.reduce((acc, resumen) => acc + resumen.cajasRechazadas, 0);
    const gestionadas = byVehicle.reduce((acc, resumen) => acc + resumen.cajasGestionadas, 0);
    const pendientes = byVehicle.reduce((acc, resumen) => acc + resumen.cajasPendientes, 0);

    return {
      checkins: byVehicle.filter((resumen) => resumen.tieneCheckin).length,
      gestionadas,
      pendientes,
      porcentaje: totalCajasSeguimiento ? Number(((pendientes / totalCajasSeguimiento) * 100).toFixed(2)) : 0,
      rechazadas,
      totalCajasSeguimiento,
      topeMaximo: Math.floor(totalCajasSeguimiento / 100) || 1,
    };
  }, [checkins, todayModulaciones, todayVehicles]);

  const refusalComRows = useMemo<RefusalComRow[]>(() => {
    const vehicleByDt = new Map(todayVehicles.map((vehicle) => [normalizeDt(vehicle.transporte), vehicle]));

    return todayModulaciones
      .map((registro) => {
        const vehicle = vehicleByDt.get(normalizeDt(registro.dt));

        return {
          causal: registro.causal || "Sin causal",
          com: getCom(registro, vehicle),
          establecimiento: registro.nombreCliente || `Cliente ${registro.codigoCliente}`,
          jefeVentas: vehicle?.territorio && vehicle.territorio !== "Pendiente" ? vehicle.territorio : vehicle?.responsable || "Sin asignacion",
          placa: vehicle?.vehiculo || `DT-${registro.dt}`,
          rechazadas: Number(registro.totalCajas || 0),
          rr: registro.persona || vehicle?.responsable || "Sin asistencia",
        };
      })
      .sort((a, b) => b.rechazadas - a.rechazadas);
  }, [todayModulaciones, todayVehicles]);

  const byCom = useMemo(() => groupRows(refusalComRows, (row) => row.com).slice(0, 12), [refusalComRows]);
  const byCausal = useMemo(() => groupRows(refusalComRows, (row) => row.causal).slice(0, 8), [refusalComRows]);
  const todayLabel = new Date().toLocaleDateString("es-CO");

  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");

    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const navy: [number, number, number] = [16, 34, 61];
      const slate: [number, number, number] = [71, 85, 105];
      const light: [number, number, number] = [241, 245, 249];
      const border: [number, number, number] = [203, 213, 225];
      const accent = hexToRgb(brand.accent);
      const margin = 14;
      const contentWidth = 182;
      const pageBottom = 282;
      let y = 12;

      const addPage = () => {
        pdf.addPage();
        pdf.setFillColor(...accent);
        pdf.rect(0, 0, 210, 3, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(...slate);
        pdf.text(`${brand.name} · Reporte diario`, margin, 11);
        y = 17;
      };
      const ensureSpace = (height: number) => {
        if (y + height > pageBottom) addPage();
      };
      const sectionTitle = (title: string) => {
        ensureSpace(14);
        pdf.setFillColor(...navy);
        pdf.roundedRect(margin, y, contentWidth, 9, 2, 2, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(255, 255, 255);
        pdf.text(title.toUpperCase(), margin + 4, y + 6);
        y += 13;
      };
      const metricCards = (items: Array<[string, string, ("navy" | "red" | "green")?]>) => {
        const gap = 3;
        const cardWidth = (contentWidth - gap * 3) / 4;
        items.forEach(([label, value, tone = "navy"], index) => {
          const x = margin + index * (cardWidth + gap);
          pdf.setFillColor(...light);
          pdf.setDrawColor(...border);
          pdf.roundedRect(x, y, cardWidth, 18, 2, 2, "FD");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(6.5);
          pdf.setTextColor(...slate);
          pdf.text(label.toUpperCase(), x + 3, y + 6);
          pdf.setFontSize(13);
          pdf.setTextColor(...(tone === "red" ? [185, 28, 28] as [number, number, number] : tone === "green" ? [4, 120, 87] as [number, number, number] : navy));
          pdf.text(value, x + 3, y + 14);
        });
        y += 23;
      };
      const dataTable = (headers: string[], rows: string[][], widths?: number[]) => {
        const columnWidths = widths || headers.map(() => contentWidth / headers.length);
        const drawHeader = () => {
          pdf.setFillColor(226, 232, 240);
          pdf.setDrawColor(...border);
          let x = margin;
          headers.forEach((header, index) => {
            pdf.rect(x, y, columnWidths[index], 8, "FD");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(6.5);
            pdf.setTextColor(...navy);
            pdf.text(header.toUpperCase(), x + 2, y + 5.2, { maxWidth: columnWidths[index] - 4 });
            x += columnWidths[index];
          });
          y += 8;
        };

        drawHeader();
        if (!rows.length) {
          pdf.setDrawColor(...border);
          pdf.rect(margin, y, contentWidth, 12);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(...slate);
          pdf.text("Sin registros para la fecha seleccionada.", margin + 3, y + 7.5);
          y += 16;
          return;
        }

        rows.forEach((row, rowIndex) => {
          const lines = row.map((cell, index) => pdf.splitTextToSize(String(cell ?? ""), columnWidths[index] - 4) as string[]);
          const rowHeight = Math.max(8, Math.max(...lines.map((cellLines) => cellLines.length)) * 3.4 + 3);
          if (y + rowHeight > pageBottom) {
            addPage();
            drawHeader();
          }
          if (rowIndex % 2) {
            pdf.setFillColor(248, 250, 252);
            pdf.rect(margin, y, contentWidth, rowHeight, "F");
          }
          pdf.setDrawColor(226, 232, 240);
          let x = margin;
          lines.forEach((cellLines, index) => {
            pdf.rect(x, y, columnWidths[index], rowHeight);
            pdf.setFont("helvetica", index === 0 ? "bold" : "normal");
            pdf.setFontSize(7);
            pdf.setTextColor(...(index === 0 ? navy : slate));
            pdf.text(cellLines, x + 2, y + 4.5);
            x += columnWidths[index];
          });
          y += rowHeight;
        });
        y += 5;
      };

      pdf.setFillColor(...accent);
      pdf.rect(0, 0, 210, 4, "F");
      const logoData = await imageToDataUrl(brand.logo);
      pdf.addImage(logoData, "PNG", margin, 12, 18, 18, undefined, "FAST");
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...accent);
      pdf.setFontSize(9);
      pdf.text(brand.name.toUpperCase(), 37, 16);
      pdf.setTextColor(...navy);
      pdf.setFontSize(20);
      pdf.text("Reporte diario de operación", 37, 24);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...slate);
      pdf.text(`Fecha: ${todayLabel}  ·  Centro de distribución Barranquilla`, 37, 29);
      y = 38;

      sectionTitle(`Seguimiento ${brand.name}`);
      metricCards([
        ["Vehículos", String(seguimiento.vehiculos)],
        ["Clientes", `${seguimiento.visitados}/${seguimiento.clientes}`],
        ["Avance", `${seguimiento.avance}%`, seguimiento.avance >= 80 ? "green" : "navy"],
        ["Cajas / HL", `${seguimiento.cajas} / ${seguimiento.hl}`],
      ]);
      dataTable(
        ["Vehículo / DT", "Responsable", "Clientes", "Avance", "Cajas"],
        todayVehicles.slice(0, 40).map((vehicle) => [
          `${vehicle.vehiculo} / ${vehicle.transporte}`,
          vehicle.responsable,
          `${vehicle.visitados || 0}/${vehicle.clientes || 0}`,
          `${vehicle.clientes ? Math.round(((vehicle.visitados || 0) / vehicle.clientes) * 100) : 0}%`,
          String(vehicle.cajas || 0),
        ]),
        [42, 62, 24, 24, 30],
      );

      sectionTitle("Refusal");
      metricCards([
        ["Cajas seguimiento", String(refusal.totalCajasSeguimiento)],
        ["Rechazadas", String(refusal.rechazadas), "red"],
        ["Gestionadas", String(refusal.gestionadas), "green"],
        ["Refusal final", `${refusal.porcentaje}%`, refusal.porcentaje <= 1 ? "green" : "red"],
      ]);
      dataTable(
        ["DT / Cliente", "Persona", "Rechazo", "Gestionadas", "Causal"],
        todayModulaciones.slice(0, 50).map((item) => [
          `DT ${item.dt} / ${item.codigoCliente}`,
          item.persona,
          item.totalCajas,
          item.cajasGestionadas || "0",
          item.causal,
        ]),
        [42, 52, 24, 28, 36],
      );

      sectionTitle("Refusal-com");
      metricCards([
        ["Registros", String(refusalComRows.length)],
        ["Cajas rechazadas", String(refusal.rechazadas), "red"],
        ["Por COM", String(byCom.length)],
        ["Por causal", String(byCausal.length)],
      ]);
      dataTable(
        ["Establecimiento", "Causal", "RR", "Placa", "COM", "Cajas"],
        refusalComRows.slice(0, 60).map((row) => [row.establecimiento, row.causal, row.rr, row.placa, row.com, String(row.rechazadas)]),
        [42, 38, 40, 24, 20, 18],
      );

      const totalPages = pdf.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        pdf.setPage(page);
        pdf.setDrawColor(...border);
        pdf.line(margin, 287, 196, 287);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(...slate);
        pdf.text(`${brand.name} · Información operativa`, margin, 292);
        pdf.text(`Página ${page} de ${totalPages}`, 196, 292, { align: "right" });
      }

      const filename = `seguimiento-${brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error("No se pudo generar el PDF", error);
      setDownloadError("No se pudo generar el PDF. Intenta nuevamente.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef2f7] text-slate-900 print:bg-white">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver a graficas"
              className="grid h-8 w-8 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push("/seguimiento/graficas")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Reporte consolidado</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Seguimiento {brand.name}, refusal y refusal-com</h1>
            </div>
          </div>
          <button
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#10223d] px-3 text-xs font-semibold text-white transition hover:bg-[#1b355b] disabled:opacity-60"
            disabled={downloading}
            onClick={downloadPdf}
            type="button"
          >
            <FileDown size={16} />
            {downloading ? "Generando..." : "Descargar PDF"}
          </button>
          {downloadError ? <p className="text-xs font-medium text-red-600">{downloadError}</p> : null}
        </div>
      </header>

      <section
        className="mx-auto bg-[#f8fafc] px-5 py-5 print:max-w-none print:px-0 print:py-0"
        style={{ width: "794px", maxWidth: "100%" }}
      >
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:rounded-none print:border-0 print:shadow-none" style={{ borderTop: `5px solid ${brand.accent}` }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <img
                className="shrink-0 rounded-lg border border-slate-200 object-cover"
                src={brand.logo}
                alt={`Emblema de ${brand.name}`}
                width={46}
                height={46}
                style={{ width: "46px", height: "46px", minWidth: "46px", maxWidth: "46px", objectFit: "cover" }}
              />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: brand.accent }}>{brand.name}</p>
                <h2 className="mt-0.5 text-xl font-bold text-[#10223d]">Reporte diario de operación</h2>
                <p className="mt-0.5 text-xs text-slate-500">Fecha: {todayLabel} · Barranquilla</p>
              </div>
            </div>
            <span data-pdf-ignore className="inline-flex items-center gap-2 rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-semibold text-[#10223d] print:hidden">
              <FileDown size={17} />
              PDF
            </span>
          </div>
        </div>

        <ReportSection title={`Seguimiento ${brand.name}`}>
          <MetricGrid>
            <Metric label="Vehiculos" value={seguimiento.vehiculos} />
            <Metric label="Clientes" value={`${seguimiento.visitados}/${seguimiento.clientes}`} />
            <Metric label="Avance" value={`${seguimiento.avance}%`} />
            <Metric label="Cajas / HL" value={`${seguimiento.cajas} / ${seguimiento.hl}`} />
          </MetricGrid>
          <SimpleTable
            headers={["Vehiculo / DT", "Responsable", "Clientes", "Avance", "Cajas"]}
            rows={todayVehicles.slice(0, 20).map((vehicle) => [
              `${vehicle.vehiculo} / ${vehicle.transporte}`,
              vehicle.responsable,
              `${vehicle.visitados || 0}/${vehicle.clientes || 0}`,
              `${vehicle.clientes ? Math.round(((vehicle.visitados || 0) / vehicle.clientes) * 100) : 0}%`,
              String(vehicle.cajas || 0),
            ])}
            empty="No hay vehiculos para hoy."
          />
        </ReportSection>

        <ReportSection title="Refusal">
          <MetricGrid>
            <Metric label="Cajas seguimiento" value={refusal.totalCajasSeguimiento} />
            <Metric label="Rechazadas" value={refusal.rechazadas} tone="red" />
            <Metric label="Gestionadas" value={refusal.gestionadas} tone="green" />
            <Metric label="Refusal final" value={`${refusal.porcentaje}%`} tone={refusal.porcentaje <= 1 ? "green" : "red"} />
          </MetricGrid>
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoBox label="Pendientes finales" value={`${refusal.pendientes} cajas`} />
            <InfoBox label="Tope maximo" value={`${refusal.topeMaximo} cajas`} />
            <InfoBox label="Checkins aplicados" value={refusal.checkins} />
          </div>
          <SimpleTable
            headers={["DT / Cliente", "Persona", "Rechazo", "Gestionadas", "Causal"]}
            rows={todayModulaciones.slice(0, 22).map((item) => [
              `DT ${item.dt} / Cliente ${item.codigoCliente}`,
              item.persona,
              item.totalCajas,
              item.cajasGestionadas || "0",
              item.causal,
            ])}
            empty="No hay modulaciones registradas hoy."
          />
        </ReportSection>

        <ReportSection title="Refusal-com">
          <MetricGrid>
            <Metric label="Registros" value={refusalComRows.length} />
            <Metric label="Cajas rechazadas" value={refusal.rechazadas} tone="red" />
            <Metric label="Por COM" value={byCom.length} />
            <Metric label="Por causal" value={byCausal.length} />
          </MetricGrid>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="Top COM" rows={byCom} />
            <Bars title="Top causales" rows={byCausal} />
          </div>
          <SimpleTable
            headers={["Establecimiento", "Causal", "RR", "Placa", "Jefe ventas", "COM", "Cajas"]}
            rows={refusalComRows.slice(0, 28).map((row) => [row.establecimiento, row.causal, row.rr, row.placa, row.jefeVentas, row.com, String(row.rechazadas)])}
            empty="No hay registros de refusal-com para hoy."
          />
        </ReportSection>
      </section>
    </main>
  );
}

function ReportSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:mb-0 print:break-after-page print:rounded-none print:border-0 print:shadow-none">
      <div className="border-b border-slate-200 bg-[#10223d] px-4 py-2.5">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{title}</h2>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-4 gap-2">{children}</div>;
}

function Metric({ label, value, tone = "navy" }: { label: string; value: ReactNode; tone?: "navy" | "red" | "green" }) {
  const colors = {
    green: "text-emerald-700",
    navy: "text-[#10223d]",
    red: "text-red-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-[#10223d]">{value}</p>
    </div>
  );
}

function Bars({ rows, title }: { rows: Array<{ label: string; value: number }>; title: string }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="mb-3 text-sm font-semibold text-[#10223d]">{title}</h3>
      <div className="space-y-2">
        {rows.length ? (
          rows.map((row) => (
            <div className="grid grid-cols-[120px_1fr_42px] items-center gap-2" key={row.label}>
              <span className="truncate text-xs font-semibold text-slate-600">{row.label}</span>
              <div className="h-3 rounded-full bg-slate-100">
                <div className="h-3 rounded-full bg-red-500" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
              </div>
              <span className="text-right text-xs font-semibold text-[#10223d]">{row.value}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Sin datos.</p>
        )}
      </div>
    </div>
  );
}

function SimpleTable({ empty, headers, rows }: { empty: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full table-fixed border-collapse text-left text-[10px]" style={{ tableLayout: "fixed", width: "100%" }}>
        <thead className="bg-[#e9f3ff] text-[9px] uppercase tracking-[0.06em] text-[#10223d]">
          <tr>
            {headers.map((header) => (
              <th className="border-b border-slate-300 px-2 py-2 font-bold" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50"} key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    className={`border-b border-slate-100 px-2 py-1.5 align-top leading-4 text-slate-700 ${cellIndex === 0 ? "font-semibold text-[#10223d]" : ""}`}
                    style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                    key={`${rowIndex}-${cellIndex}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-3 py-8 text-center text-sm font-medium text-slate-500" colSpan={headers.length}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function groupRows(rows: RefusalComRow[], getLabel: (row: RefusalComRow) => string) {
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    const label = getLabel(row) || "Sin asignacion";
    totals.set(label, (totals.get(label) || 0) + row.rechazadas);
  });

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function getCom(registro: ModulacionRegistro, vehicle: Vehiculo | undefined) {
  const candidates = [vehicle?.bloque, vehicle?.viaje, vehicle?.territorio].filter(Boolean) as string[];
  const found = candidates.find((value) => /^COM/i.test(value.trim()));
  if (found) return found.trim().toUpperCase();

  const code = String(registro.codigoCliente || registro.dt || "0").replace(/\D/g, "");
  return code ? `COM${code.slice(-3).padStart(3, "0")}` : "Sin asignacion";
}

function isTodayVehicle(vehicle: Vehiculo) {
  return isToday(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt);
}

function isToday(value: string | undefined) {
  return toDateKey(value) === getLocalDateKey();
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return getLocalDateKey(parsed);
}

function hexToRgb(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((char) => `${char}${char}`).join("") : hex;
  return [
    Number.parseInt(normalized.slice(0, 2), 16) || 15,
    Number.parseInt(normalized.slice(2, 4), 16) || 124,
    Number.parseInt(normalized.slice(4, 6), 16) || 88,
  ];
}

async function imageToDataUrl(source: string) {
  const response = await fetch(source);
  if (!response.ok) throw new Error("No se pudo cargar el emblema del contratista.");
  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
