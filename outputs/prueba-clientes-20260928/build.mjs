import fs from 'node:fs/promises';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const out = new URL('./', import.meta.url);
const wb = Workbook.create();
const sheet = wb.worksheets.add('Clientes');
const values = [
  ['Código cliente', 'Nombre cliente', 'Contratista', 'Caso de prueba'],
  ['14033833', 'Tienda Shaday', '', 'Buscar el código en todas las contratistas.'],
  ['14033833', 'Tienda Shaday', '', 'Repetido: se agrupa con la fila anterior.'],
  ['14033833', 'Tienda Shaday', 'Logisticos', 'Buscar solo los registros de Logisticos.'],
  ['14394896', 'Punto Frio Los Almedros La 80 Sas', 'Logisticos', 'Otro cliente observado en la app.'],
  ['PRUEBA-NO-EXISTE-001', 'Cliente ficticio de prueba', '', 'Código ficticio para probar no encontrados.'],
  ['0014033833', 'Cliente ficticio con ceros iniciales', '', 'Es distinto de 14033833; conservar los ceros.'],
  ['', 'Fila de prueba sin código', '', 'La app debe omitir esta fila.'],
];
sheet.getRange('A1:D8').values = values;
sheet.showGridLines = false;
sheet.getRange('A1:D8').format.font = {name:'Arial',size:11,color:'#25364A'};
sheet.getRange('A1:D8').format.verticalAlignment = 'center';
sheet.getRange('A1:D8').format.rowHeight = 30;
sheet.getRange('A1:A8').format.columnWidth = 28;
sheet.getRange('B1:B8').format.columnWidth = 43;
sheet.getRange('C1:C8').format.columnWidth = 20;
sheet.getRange('D1:D8').format.columnWidth = 60;
sheet.getRange('A2:A8').setNumberFormat('@');
sheet.getRange('A1:D1').format.fill = '#10223D';
sheet.getRange('A1:D1').format.font = {name:'Arial',size:11,bold:true,color:'#FFFFFF'};
sheet.getRange('A1:D1').format.rowHeight = 34;
for (const row of [3,5,7]) sheet.getRange(`A${row}:D${row}`).format.fill = '#F1F5F9';
sheet.freezePanes.freezeRows(1);
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'Clientes!A1:D8',include:'values',tableMaxRows:8,tableMaxCols:4,maxChars:2200})).ndjson);
const preview = await wb.render({sheetName:'Clientes',range:'A1:D8',scale:1,format:'png'});
await fs.writeFile(new URL('preview.png',out),new Uint8Array(await preview.arrayBuffer()));
const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(new URL('Plantilla_prueba_clientes.xlsx',out).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
