import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('../../node_modules/xlsx');
const JSZip = require('../../node_modules/jszip');
const sources = [
  'C:/Users/Pc/Documents/Downloads/Supabase Snippet Untitled query.csv',
  'C:/Users/Pc/Documents/Downloads/Supabase Snippet Untitled query (1).csv',
];
const output = 'outputs/bees-recuperado-logisticos-20261017/reportes-bees-reconstruidos-logisticos.zip';
const csv = (rows) => rows.map((row) => row.map((value) => {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}).join(',')).join('\r\n') + '\r\n';
const parsed = sources.flatMap((file) => {
  const workbook = XLSX.read(fs.readFileSync(file, 'utf8'), { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
    .map((source) => ({ ...source, report: JSON.parse(source.data) }));
});
const preferred = new Map();
for (const source of parsed) {
  const key = source.operational_date;
  const old = preferred.get(key);
  if (!old || (source.kind === 'closure' && old.kind !== 'closure') ||
      (source.kind === old.kind && source.updated_at > old.updated_at)) preferred.set(key, source);
}
const zip = new JSZip();
const manifest = [['fecha_operativa', 'tipo_reporte', 'id_reporte', 'nombre_archivo_original_registrado', 'filas_reconstruidas', 'archivo_en_zip']];
let rowCount = 0;
for (const source of [...preferred.values()].sort((a, b) => a.operational_date.localeCompare(b.operational_date))) {
  const rows = source.report.rows || [];
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const values = [columns, ...rows.map((row) => columns.map((key) => row[key]))];
  const name = `reportes/${source.operational_date}_${source.kind}_datos-reconstruidos.csv`;
  zip.file(name, '\ufeff' + csv(values));
  manifest.push([source.operational_date, source.kind, source.report_id,
    source.report.fileName || '', rows.length, name]);
  rowCount += rows.length;
}
zip.file('MANIFIESTO.csv', '\ufeff' + csv(manifest));
zip.file('LEEME.txt', [
  'DATOS BEES RECONSTRUIDOS DE SUPABASE',
  '',
  'Estos CSV NO son copias byte por byte de los archivos BEES originales.',
  'Contienen las filas procesadas que la app guardó en punto_corona_route_reports.',
  'Se eligió el reporte closure por fecha cuando existe; en otro caso current.',
  'Los campos plannedVisitOrder y actualVisitOrder aparecen solo si estaban guardados.',
  'Los archivos fuente recibidos cubren 2026-07-02 a 2026-10-07 para Logisticos.',
  'No incluyen enero-junio ni los reportes posteriores al 7 de octubre.',
  '',
].join('\r\n'));
fs.mkdirSync('outputs/bees-recuperado-logisticos-20261017', { recursive: true });
fs.writeFileSync(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
console.log(JSON.stringify({ output, files: manifest.length - 1, rows: rowCount, bytes: fs.statSync(output).size }));
