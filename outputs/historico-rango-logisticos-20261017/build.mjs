import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('../../node_modules/xlsx');
const sources = [
  'C:/Users/Pc/Documents/Downloads/Supabase Snippet Untitled query.csv',
  'C:/Users/Pc/Documents/Downloads/Supabase Snippet Untitled query (1).csv',
];
const output = 'outputs/historico-rango-logisticos-20261017/historico-completo-rango-logisticos.xlsx';
const read = (path) => {
  const workbook = XLSX.read(fs.readFileSync(path, 'utf8'), { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
};
const raw = sources.flatMap(read);
const ids = new Set();
const reports = raw.map((source) => {
  if (ids.has(source.report_id)) throw new Error(`Reporte repetido: ${source.report_id}`);
  ids.add(source.report_id);
  return { ...source, parsed: JSON.parse(source.data) };
});
const selected = new Map();
for (const report of reports) {
  const date = report.operational_date;
  const previous = selected.get(date);
  if (!previous ||
      (report.kind === 'closure' && previous.kind !== 'closure') ||
      (report.kind === previous.kind && report.updated_at > previous.updated_at)) {
    selected.set(date, report);
  }
}
const preferred = [...selected.values()].sort((a, b) =>
  a.operational_date.localeCompare(b.operational_date));
const excelDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};
const str = (value) => value == null ? '' : String(value);
const num = (value) => value == null || value === '' ? null : Number(value);
const flag = (value) => value === true ? 'En rango' : value === false ? 'Fuera de rango' : 'Sin clasificación';
const positiveOrder = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const normalizedRoute = (value) => str(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const normalizedRr = (value) => normalizedRoute(value || 'RR sin identificar');
const fields = [
  'Fecha operativa', 'Contratista', 'Tipo reporte', 'ID reporte', 'Actualizado UTC',
  'ID visita', 'DT', 'DT visual', 'Fecha ruta', 'Código cliente', 'Cliente',
  'Conductor', 'Placa', 'Estado', 'Evaluada', 'Clasificación rango',
  'Dentro del radio (original)', 'Orden planeado recuperado', 'Orden real recuperado',
  'Origen orden planeado', 'Origen orden real', 'Cumple secuencia',
  'Motivo fuera de rango', 'Motivo manual', 'Motivo omisión',
  'Hora fuera de rango', 'Registrado fuera de rango UTC', 'Fuente registro',
  'Volumen entregado', 'Volumen rechazado', 'Cajas seguimiento',
  'Clientes seguimiento', 'Visitados seguimiento', 'Progreso seguimiento',
];
const data = [fields];
const totals = { reports: reports.length, selectedReports: preferred.length,
  all: 0, started: 0, notStarted: 0, inRange: 0, outRange: 0, unknown: 0,
  planned: 0, actual: 0, sequenceEvaluated: 0, sequenceCompliant: 0, sequenceWithoutOrder: 0 };
const monthly = new Map();
const rrGroups = new Map();
for (const report of preferred) {
  const month = report.operational_date.slice(0, 7);
  if (!monthly.has(month)) monthly.set(month, { all: 0, started: 0, inRange: 0, outRange: 0, unknown: 0 });
  const monthTotals = monthly.get(month);
  const positionByRoute = new Map();
  for (const row of report.parsed.rows || []) {
    const route = normalizedRoute(row.dt || row.tourDisplayId || 'sin-dt');
    const position = (positionByRoute.get(route) || 0) + 1;
    positionByRoute.set(route, position);
    const explicitPlanned = positiveOrder(row.plannedVisitOrder);
    const explicitActual = positiveOrder(row.actualVisitOrder);
    const planned = explicitPlanned ?? position;
    const legacyActual = positiveOrder(str(row.id).match(/-(\d+)$/)?.[1]);
    const actual = explicitActual ?? legacyActual;
    const compared = planned !== null && actual !== null;
    if (compared) {
      totals.sequenceEvaluated++;
      if (planned === actual) totals.sequenceCompliant++;
    } else totals.sequenceWithoutOrder++;
    const rr = str(row.driverName).trim() || 'RR sin identificar';
    const rrKey = normalizedRr(rr);
    if (!rrGroups.has(rrKey)) rrGroups.set(rrKey, { rr, routes: new Set(), evaluated: 0, compliant: 0, withoutOrder: 0 });
    const rrGroup = rrGroups.get(rrKey);
    rrGroup.routes.add(`${report.operational_date}:${row.dt || row.tourDisplayId}`);
    if (compared) {
      rrGroup.evaluated++;
      if (planned === actual) rrGroup.compliant++;
    } else rrGroup.withoutOrder++;
    const started = row.status !== 'NOT_STARTED';
    const range = started ? flag(row.withinRadius) : 'No iniciada';
    totals.all++;
    monthTotals.all++;
    if (started) {
      totals.started++;
      monthTotals.started++;
      if (row.withinRadius === true) { totals.inRange++; monthTotals.inRange++; }
      else if (row.withinRadius === false) { totals.outRange++; monthTotals.outRange++; }
      else { totals.unknown++; monthTotals.unknown++; }
    } else totals.notStarted++;
    if (row.plannedVisitOrder != null) totals.planned++;
    if (row.actualVisitOrder != null) totals.actual++;
    data.push([
      excelDate(report.operational_date), str(report.contractor), str(report.kind),
      str(report.report_id), str(report.updated_at), str(row.id), str(row.dt),
      str(row.tourDisplayId), excelDate(row.tourDate), str(row.pocExternalId),
      str(row.pocName), str(row.driverName), str(row.truckLicensePlate), str(row.status),
      started ? 'Sí' : 'No', range,
      row.withinRadius == null ? '' : row.withinRadius,
      planned, actual, explicitPlanned === null ? 'Posición dentro del DT' : 'Campo explícito',
      explicitActual === null ? (legacyActual === null ? 'No disponible' : 'Sufijo del ID') : 'Campo explícito',
      compared ? (planned === actual ? 'Sí' : 'No') : 'Sin orden real',
      str(row.outOfRadiusReason), str(row.manualOutOfRadiusReason), str(row.skippedReason),
      str(row.outOfRadiusTime), str(row.outOfRadiusRecordedAt), str(row.outOfRadiusRecordedSource),
      num(row.deliveredVolume), num(row.refusedVolume), num(row.seguimientoCajas),
      num(row.seguimientoClientes), num(row.seguimientoVisitados), num(row.seguimientoProgress),
    ]);
  }
}
if (totals.outRange !== 3309 || totals.started !== totals.inRange + totals.outRange + totals.unknown ||
    totals.all !== totals.started + totals.notStarted) throw new Error('Los totales no cuadran.');

const wb = XLSX.utils.book_new();
const summary = [
  ['Histórico de rango de Logísticos', ''],
  ['Fuente', 'Dos CSV de Supabase: punto_corona_route_reports'],
  ['Criterio por fecha', 'Se usa closure cuando existe; si no, el current más reciente.'],
  ['Cobertura operativa', `${preferred[0].operational_date} a ${preferred.at(-1).operational_date}`],
  ['Reportes originales', totals.reports],
  ['Reportes seleccionados', totals.selectedReports],
  ['Visitas totales', totals.all],
  ['Visitas no iniciadas', totals.notStarted],
  ['Visitas iniciadas', totals.started],
  ['En rango', totals.inRange],
  ['Fuera de rango', totals.outRange],
  ['Sin clasificación de radio', totals.unknown],
  ['Orden planeado explícito', totals.planned],
  ['Orden real explícito', totals.actual],
  ['Visitas comparables para secuencia', totals.sequenceEvaluated],
  ['Cumple secuencia', totals.sequenceCompliant],
  ['Sin orden real recuperable', totals.sequenceWithoutOrder],
  ['Adherencia según lógica local', totals.sequenceEvaluated ? totals.sequenceCompliant / totals.sequenceEvaluated : null],
  ['Método de recuperación', 'Orden planeado: posición de la fila dentro del DT; orden real: sufijo numérico del ID.'],
  ['Alcance de secuencia', 'Lógica de routeOrderAdherence.ts del repositorio; verificar reglas del otro aplicativo.'],
  ['Indicadores ilustrativos', 'No se incluyeron tarjetas ni tendencia generadas con datos de ejemplo.'],
  ['', ''],
  ['Mes', 'Todas', 'Iniciadas', 'En rango', 'Fuera de rango', 'Sin clasificación'],
  ...[...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, x]) =>
    [month, x.all, x.started, x.inRange, x.outRange, x.unknown]),
];
const ss = XLSX.utils.aoa_to_sheet(summary);
ss['!cols'] = [{ wch: 39 }, { wch: 88 }, { wch: 17 }, { wch: 17 }, { wch: 19 }, { wch: 20 }];
ss.B18.z = '0.00%';
XLSX.utils.book_append_sheet(wb, ss, 'Resumen');
const ds = XLSX.utils.aoa_to_sheet(data, { cellDates: true });
ds['!autofilter'] = { ref: `A1:AH${data.length}` };
ds['!cols'] = fields.map((name) => ({ wch: Math.min(Math.max(name.length + 2, 15), 36) }));
XLSX.utils.book_append_sheet(wb, ds, 'Visitas');
const rrData = [
  ['Contratista', 'Responsable de ruta', 'Rutas', 'Evaluadas', 'Cumple', 'No cumple', 'Sin orden real', 'Adherencia'],
  ...[...rrGroups.values()].map((g) => [
    'Logisticos', g.rr, g.routes.size, g.evaluated, g.compliant,
    g.evaluated - g.compliant, g.withoutOrder,
    g.evaluated ? g.compliant / g.evaluated : null,
  ]).sort((a, b) => (b[7] ?? -1) - (a[7] ?? -1) || b[3] - a[3] || String(a[1]).localeCompare(String(b[1]), 'es-CO')),
];
const rs = XLSX.utils.aoa_to_sheet(rrData);
rs['!autofilter'] = { ref: `A1:H${rrData.length}` };
rs['!cols'] = [{ wch: 20 }, { wch: 38 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 17 }, { wch: 18 }, { wch: 16 }];
for (let i = 2; i <= rrData.length; i++) if (rs[`H${i}`]) rs[`H${i}`].z = '0.00%';
XLSX.utils.book_append_sheet(wb, rs, 'Secuencia RR local');
const metadata = [
  ['ID reporte', 'Contratista', 'Fecha operativa', 'Tipo', 'Actualizado UTC', 'Seleccionado', 'Filas en reporte'],
  ...reports.map((r) => [str(r.report_id), str(r.contractor), excelDate(r.operational_date),
    str(r.kind), str(r.updated_at), selected.get(r.operational_date)?.report_id === r.report_id ? 'Sí' : 'No',
    r.parsed.rows?.length ?? 0]),
];
const ms = XLSX.utils.aoa_to_sheet(metadata, { cellDates: true });
ms['!autofilter'] = { ref: `A1:G${metadata.length}` };
ms['!cols'] = [{ wch: 45 }, { wch: 20 }, { wch: 19 }, { wch: 12 }, { wch: 31 }, { wch: 16 }, { wch: 20 }];
XLSX.utils.book_append_sheet(wb, ms, 'Reportes');
fs.mkdirSync('outputs/historico-rango-logisticos-20261017', { recursive: true });
XLSX.writeFile(wb, output, { compression: true });
console.log(JSON.stringify({ output, ...totals, months: [...monthly.keys()] }));
