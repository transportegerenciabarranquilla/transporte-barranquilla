const ts = require('typescript');
const fs = require('fs');
const compiled = { exports: {} };
new Function('exports', 'require', ts.transpileModule(fs.readFileSync('app/lib/supabaseServer.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(compiled.exports, require);
const s = compiled.exports;
function compile(file, mocks) {
  const result = { exports: {} };
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText)(result.exports, name => mocks[name]);
  return result.exports;
}
const contractors = compile('app/lib/contractors.ts', {});
const { scopeCheckinQuery } = compile('app/lib/checkinScope.ts', { './contractors': contractors });
async function main() {
  const params = scopeCheckinQuery(new URLSearchParams({ select: 'checkin_id,contractor,data,updated_at', 'data->>dt': 'eq.8008971356', order: 'updated_at.desc' }), ['HL Logisticos']);
  const response = await fetch(s.supabaseRest('checkins_cajas', '?' + params), {
    headers: s.supabaseAdminHeaders() || s.supabaseHeaders(), cache: 'no-store',
  });
  const rows = await response.json();
  if (!response.ok || !rows.length) throw new Error('El DT no se recuperó con el filtro corregido');
  console.log(JSON.stringify({ status: response.status, count: rows.length, dt: rows[0].data.dt, cajas: rows[0].data.totalCajas, contractor: rows[0].contractor ?? rows[0].data.contratista }));
  const confirmationParams = scopeCheckinQuery(new URLSearchParams({ select: 'checkin_id,data', checkin_id: `in.("${rows[0].checkin_id}")` }), ['HL Logisticos']);
  const confirmation = await fetch(s.supabaseRest('checkins_cajas', '?' + confirmationParams), { headers: s.supabaseAdminHeaders(), cache: 'no-store' });
  const saved = await confirmation.json();
  if (!confirmation.ok || saved[0]?.data.totalCajas !== rows[0].data.totalCajas) throw new Error('No se confirmó la lectura por ID');
  console.log(JSON.stringify({ confirmation: confirmation.status, recoveredById: true }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
