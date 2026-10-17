import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('../../node_modules/xlsx');
const source = 'C:/Users/Pc/Documents/Downloads/fuera-de-rango-historial-completo-logisticos.xlsx';
const output = 'outputs/migracion-rango-logisticos-20261017/rango-logisticos-para-revision.xlsx';
const input = XLSX.readFile(source, { cellDates: true });
const original = input.Sheets['Fuera de rango'];
if (!original) throw new Error('No se encontró la hoja Fuera de rango.');
const rows = XLSX.utils.sheet_to_json(original, { defval: '' });
const dateKey = (value) => value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` : String(value).slice(0, 10);
const dates = rows.map((row) => dateKey(row['Fecha operativa'])).sort();
const trueReasons = rows.filter((row) => String(row['Motivo fuera de rango']).trim().toLowerCase() === 'true').length;
const missingReasons = rows.filter((row) => String(row['Motivo fuera de rango']).trim() === 'Sin motivo registrado').length;
const unknownAssistants = rows.filter((row) => String(row.Auxiliar).trim() === 'Sin identificar').length;
const months = Object.entries(rows.reduce((counts, row) => {
  const key = dateKey(row['Fecha operativa']).slice(0, 7);
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {})).sort(([a], [b]) => a.localeCompare(b));

const review = [
  ['Histórico de Logísticos: revisión para migración', ''],
  ['Fuente', 'Archivo descargado desde Admin > Rango > Descargar historial'],
  ['Alcance', 'Solo visitas fuera de rango; el archivo fuente no incluye visitas en rango'],
  ['Contratista', 'Logisticos'],
  ['Registros', rows.length],
  ['Primera fecha operativa', dates[0]],
  ['Última fecha operativa', dates.at(-1)],
  ['Motivo con valor literal true', trueReasons],
  ['Motivo Sin motivo registrado', missingReasons],
  ['Auxiliar Sin identificar', unknownAssistants],
  ['', ''],
  ['Mes operativo', 'Registros fuera de rango'],
  ...months,
  ['', ''],
  ['Antes de importar', 'Revisar el mapeo de columnas del nuevo aplicativo y los motivos señalados.'],
  ['Nota', 'Los valores de la hoja Datos originales se preservan tal como vienen en el Excel descargado.'],
];
const workbook = XLSX.utils.book_new();
const reviewSheet = XLSX.utils.aoa_to_sheet(review);
reviewSheet['!cols'] = [{ wch: 39 }, { wch: 95 }];
reviewSheet['!autofilter'] = { ref: `A12:B${12 + months.length}` };
XLSX.utils.book_append_sheet(workbook, reviewSheet, 'Revisión');
const dataSheet = XLSX.utils.aoa_to_sheet(XLSX.utils.sheet_to_json(original, { header: 1, defval: '' }), { cellDates: true });
dataSheet['!cols'] = original['!cols'] || [];
dataSheet['!autofilter'] = original['!autofilter'] || { ref: `A1:L${rows.length + 1}` };
XLSX.utils.book_append_sheet(workbook, dataSheet, 'Datos originales');
fs.mkdirSync('outputs/migracion-rango-logisticos-20261017', { recursive: true });
XLSX.writeFile(workbook, output, { compression: true });
const verified = XLSX.readFile(output, { cellDates: true });
const verifiedRows = XLSX.utils.sheet_to_json(verified.Sheets['Datos originales'], { defval: '' });
if (verifiedRows.length !== rows.length) throw new Error('No coinciden los registros al verificar el archivo.');
console.log(JSON.stringify({ output, rows: verifiedRows.length, months, trueReasons, missingReasons, unknownAssistants }));
