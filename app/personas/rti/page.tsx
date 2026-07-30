"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

type RtiRecord = {
  day: number;
  month: string;
  year: number;
  responsible: string;
  reference: string;
  carrier: string;
  percentage: number;
};

const RTI_RECORDS: RtiRecord[] = [
  { day: 13, month: "Julio", year: 2026, responsible: "Kevin Montes", reference: "Costeña Bacana", carrier: "Logisticos", percentage: 75 },
  { day: 13, month: "Julio", year: 2026, responsible: "Oswaldo Castro", reference: "Costeñita", carrier: "Surti Cervezas", percentage: 76 },
  { day: 13, month: "julio", year: 2026, responsible: "Julian Peña", reference: "Costeña Bacana", carrier:"Logisticos", percentage :82},
  { day: 13 , month:"julio", year: 2026, responsible: "Anay Mandariaga", reference: "Costeñita", carrier:"Logisticos", percentage: 93},
  { day: 13, month: "Julio", year: 2026, responsible: "Adalberto Escobar", reference: "Costeña",carrier: "Surti Cervezas", percentage: 94 },
  { day: 13, month: "julio", year: 2026, responsible: "Eduar Ariza", reference: "Botella 330 ml", carrier:"Surti Cervezas ", percentage :96},
  { day: 13 , month: "julio", year: 2026, responsible: "Donaldith Torres", reference: "botella 330 ml", carrier:"Logisticos", percentage: 98},
  { day: 14 , month: "febrero", year: 2026,responsible: "saul contreras", reference: "Costeña Bacana", carrier:"logisticos", percentage: 15},
  


];

const BOX_DIFFERENCES = [
  { reference: "Botella Marrón 1000 cc", value: 129 },
  { reference: "Envase Marrón 750R", value: 16 },
  { reference: "Envase Flint 330R", value: 11 },
  { reference: "Botella Flint 1000R", value: 5 },
  { reference: "Envase Marrón Club Col 330R", value: -2 },
  { reference: "Botella Marrón 850 ml K", value: -7 },
  { reference: "Envase Costeñita 175R", value: -24 },
  { reference: "Envase Costeña Bacana 320 cc R", value: -28 },
  { reference: "Envase Marrón 330K", value: -78 },
];

const RESPONSIBLE_RANKING = [
  { name: "Oswaldo Castro", percentage: 83 },
  { name: "Kevin Montes", percentage: 86 },
  { name: "Julian Peña", percentage: 87 },
  { name: "Eduar Ariza", percentage: 100 },
  { name: "Donaldith Torres", percentage: 101 },
  { name: "Anay Madariaga", percentage: 102 },
  { name: "José Benavides", percentage: 102 },
  { name: "Manuel Romero", percentage: 103 },
  { name: "Alberto Cárdenas", percentage: 103 },
  { name: "Jeison Badillo", percentage: 103 },
  { name: "José Morales", percentage: 104 },
  { name: "Carlos Machado", percentage: 104 },
  { name: "Neider Lizcano", percentage: 105 },
  { name: "Gustavo Daza", percentage: 105 },
  { name: "Leonardo Ramírez", percentage: 105 },
];

const PACKAGE_MOVEMENT = [
  { reference: "Costeñita 175R", outbound: 1731, returned: 1812 },
  { reference: "Marrón 330R", outbound: 1090, returned: 1074 },
  { reference: "Costeña Bacana 320 cc R", outbound: 768, returned: 704 },
  { reference: "Marrón 1000 cc", outbound: 144, returned: 86 },
  { reference: "Marrón Club 330R", outbound: 1110, returned: 1094 },
  { reference: "Marrón 750R", outbound: 409, returned: 374 },
  { reference: "Marrón 850 ml R", outbound: 104, returned: 81 },
  { reference: "Flint 1000R", outbound: 69, returned: 0 },
  { reference: "Flint 330R", outbound: 0, returned: 100 },
];

const SKU_RETURNS = [
  808, 63, 40, 36, 30, 28, 26, 25, 23, 21, 20, 20, 18, 16, 15, 14, 12, 11, 10, 9, 8, 6, 4,
].map((value, index) => ({ sku: String([82, 97, 11, 96, 77, 75, 95, 74, 70, 76, 65, 72, 64, 99, 89, 34, 31, 52, 54, 24, 53, 28, 80][index]), value }));

const BOX_DIFFERENCE_RANKING = [
  { name: "Kevin Montes", value: -25, carrier: "Soluciones Logísticas Arenosas Ltd." },
  { name: "Anay Madariaga", value: -15, carrier: "Soluciones Logísticas Arenosas Ltd." },
  { name: "Oswaldo Castro", value: -15, carrier: "Soluciones Logísticas Arenosas Ltd." },
  { name: "Julian Peña", value: -14, carrier: "Soluciones Logísticas Arenosas Ltd." },
  { name: "José Benavides", value: -4, carrier: "Soluciones Logísticas Arenosas Ltd." },
  { name: "Manuel Romero", value: -3, carrier: "Soluciones Logísticas Arenosas Ltd." },
  { name: "Adalberto Escobar", value: -2, carrier: "Soluciones Logísticas Arenosas Ltd." },
  { name: "Donaldith Torres", value: -2, carrier: "Soluciones Logísticas Arenosas Ltd." },
];

const DAILY_ROUTE_RTI = [
  { route: "108008816973", month: "Julio", day: 13, percentage: 87 },
  { route: "108008816967", month: "Julio", day: 13, percentage: 86 },
  { route: "108008816978", month: "Julio", day: 13, percentage: 83 },
];

const DAILY_PACKAGE_TRACKING = [
  { description: "Envase Costeña Bacana 320 cc R", percentage: 95 },
  { description: "Envase Costeñita 175R", percentage: 98 },
];

export default function RtiPage() {
  const router = useRouter();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [month, setMonth] = useState("Julio");
  const [day, setDay] = useState("13");
  
  const [year, setYear] = useState("2026");
  const [responsible, setResponsible] = useState("");
  const [reference, setReference] = useState("");
  const [carrier, setCarrier] = useState("");

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => {
        const body = response.ok ? await response.json().catch(() => null) : null;
        setAccess(body?.session?.isPeople || body?.session?.isAdmin ? "allowed" : "denied");
      })
      .catch(() => setAccess("denied"));
  }, []);

  const filteredRecords = useMemo(
    () =>
      RTI_RECORDS.filter(
        (record) =>
          record.month === month &&
          record.day === Number(day) &&
          record.year === Number(year) &&
          (!responsible || record.responsible === responsible) &&
          (!reference || record.reference === reference) &&
          (!carrier || record.carrier === carrier),
      ),
    [carrier, day, month, reference, responsible, year],
  );
  const rtiPercentage = filteredRecords.length
    ? Math.round(filteredRecords.reduce((total, record) => total + record.percentage, 0) / filteredRecords.length)
    : 0;
  const offenders = [...filteredRecords].sort((left, right) => left.percentage - right.percentage).slice(0, 7);
  const complianceByReference = Array.from(
    filteredRecords.reduce((summary, record) => {
      const current = summary.get(record.reference) ?? { total: 0, count: 0 };
      summary.set(record.reference, { total: current.total + record.percentage, count: current.count + 1 });
      return summary;
    }, new Map<string, { total: number; count: number }>()),
    ([name, result]) => ({ name, percentage: Math.round(result.total / result.count) }),
  ).sort((left, right) => right.percentage - left.percentage);
  const needleAngle = 180 + (rtiPercentage / 100) * 180;
  const needleRadians = (needleAngle * Math.PI) / 180;
  const needleX = 150 + Math.cos(needleRadians) * 76;
  const needleY = 150 + Math.sin(needleRadians) * 76;

  if (access === "checking") return <main className="min-h-screen bg-slate-100" />;

  if (access === "denied") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-5">
        <section className="max-w-md rounded-lg border border-red-100 bg-white p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto text-red-600" size={28} />
          <h1 className="mt-3 text-xl font-semibold text-[#10223d]">Modulo no disponible</h1>
          <p className="mt-2 text-sm text-slate-500">RTI esta disponible exclusivamente para People.</p>
          <button className="mt-5 rounded-md bg-[#10223d] px-4 py-2 text-sm font-semibold text-white" onClick={() => router.push("/")} type="button">
            Volver
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-5 py-4 sm:px-8">
          <button aria-label="Volver al portal" className="grid h-10 w-10 place-items-center rounded-xl text-slate-900 transition hover:bg-slate-100" onClick={() => router.push("/")} type="button">
            <ArrowLeft size={19} />
          </button>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 text-white shadow-md shadow-slate-200">
            <BarChart3 size={22} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">People Transporte</p>
            <h1 className="text-2xl font-semibold text-slate-950">RTI</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1500px] gap-4 px-5 py-6 sm:px-8 lg:grid-cols-[300px_minmax(360px,0.9fr)_minmax(430px,1.1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/70">
          <div className="grid grid-cols-3 gap-2">
            <FilterSelect label="Mes" value={month} onChange={setMonth} options={["Julio"]} />
            <FilterSelect label="Dia" value={day} onChange={setDay} options={["13"]} />
            <FilterSelect label="Año" value={year} onChange={setYear} options={["2026"]} />
          </div>
          <div className="mt-4 grid gap-4">
            <FilterSelect label="Responsable de ruta" value={responsible} onChange={setResponsible} options={uniqueValues("responsible")} allLabel="Todas" />
            <FilterSelect label="Referencia de envase" value={reference} onChange={setReference} options={uniqueValues("reference")} allLabel="Todas" />
            <FilterSelect label="Transportista" value={carrier} onChange={setCarrier} options={uniqueValues("carrier")} allLabel="Todas" />
          </div>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
          <PanelHeader>Porcentaje de RTI</PanelHeader>
          <div className="grid min-h-[330px] place-items-center px-4 pb-5 pt-3">
            <div className="w-full max-w-[390px]">
              <svg aria-label={`Porcentaje de RTI ${rtiPercentage}%`} className="w-full" role="img" viewBox="0 0 300 205">
                <title>Porcentaje de RTI</title>
                <desc>Medidor semicircular con un resultado de {rtiPercentage} por ciento.</desc>
                <defs>
                  <linearGradient id="rtiGauge" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#dc2626" />
                    <stop offset="50%" stopColor="#facc15" />
                    <stop offset="100%" stopColor="#16a34a" />
                  </linearGradient>
                </defs>
                <path d="M 32 150 A 118 118 0 0 1 268 150" fill="none" pathLength="100" stroke="#e8f1f8" strokeLinecap="round" strokeWidth="42" />
                <path d="M 32 150 A 118 118 0 0 1 268 150" fill="none" pathLength="100" stroke="url(#rtiGauge)" strokeDasharray={`${rtiPercentage} 100`} strokeLinecap="round" strokeWidth="42" />
                <line stroke="#0f172a" strokeLinecap="round" strokeWidth="7" x1="150" x2={needleX} y1="150" y2={needleY} />
                <circle cx="150" cy="150" fill="#ffffff" r="17" stroke="#0f172a" strokeWidth="6" />
                <text fill="#64748b" fontSize="15" fontWeight="600" x="16" y="184">0 %</text>
                <text fill="#64748b" fontSize="15" fontWeight="600" textAnchor="end" x="284" y="184">100 %</text>
                <text fill="#0f172a" fontSize="38" fontWeight="700" textAnchor="middle" x="150" y="202">{rtiPercentage} %</text>
              </svg>
              {!filteredRecords.length ? <p className="mt-3 text-center text-sm font-medium text-slate-500">Sin datos para los filtros seleccionados.</p> : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
          <PanelHeader>Top Offender</PanelHeader>
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="bg-slate-950 text-white">
                  <th className="px-4 py-3 text-left font-semibold">Nombre RR</th>
                  <th className="px-4 py-3 text-right font-semibold">Porcentaje RTI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {offenders.map((record) => (
                  <tr className="transition-colors hover:bg-slate-50" key={`${record.responsible}-${record.reference}`}>
                    <td className="px-4 py-3 font-semibold uppercase text-slate-800">{record.responsible}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative ml-auto h-8 max-w-48 overflow-hidden rounded-lg bg-slate-100">
                        <div className={`absolute inset-y-0 left-0 ${performanceColor(record.percentage)}`} style={{ width: `${record.percentage}%` }} />
                        <span className="relative z-10 flex h-full items-center justify-end px-2 font-bold text-slate-950">{record.percentage} %</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {!offenders.length ? (
                  <tr>
                    <td className="px-4 py-12 text-center font-medium text-slate-500" colSpan={2}>Sin resultados</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid w-full gap-4 lg:col-span-3 lg:grid-cols-2">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Porcentaje de cumplimiento RTI por referencia</PanelHeader>
            <div className="overflow-x-auto p-2">
              {complianceByReference.length ? (
                <div className="flex min-h-[185px] min-w-[460px] items-end gap-3 border-b border-slate-300 px-2 pt-3">
                  {complianceByReference.map((item) => (
                    <div className="flex min-w-0 flex-1 flex-col items-center" key={item.name}>
                      <span className="mb-1 text-[10px] font-bold text-slate-800">{item.percentage} %</span>
                      <div
                        className={`w-full max-w-16 rounded-t-sm shadow-sm ${percentageBarColor(item.percentage)}`}
                        style={{ height: `${Math.max(item.percentage * 0.9, 9)}px` }}
                      />
                      <span className="mt-2 min-h-11 text-center text-[9px] font-semibold leading-tight text-slate-700">
                        {item.name}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-[185px] place-items-center text-sm font-medium text-slate-500">Sin resultados</div>
              )}
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Cantidad de cajas de diferencia por referencia</PanelHeader>
            <div className="overflow-x-auto p-2">
              <div className="relative flex min-h-[185px] min-w-[560px] items-center gap-2 px-2">
                <div className="absolute inset-x-2 top-1/2 border-t border-slate-300" />
                {BOX_DIFFERENCES.map((item) => {
                  const height = Math.max(Math.abs(item.value) * 0.4, 6);
                  return (
                    <div className="relative z-10 flex h-[160px] min-w-0 flex-1 flex-col items-center" key={item.reference}>
                      <div className="flex h-1/2 w-full flex-col items-center justify-end">
                        {item.value >= 0 ? (
                          <>
                            <span className="mb-0.5 text-[8px] font-bold text-slate-800">{item.value}</span>
                            <div className={differenceColor(item.value)} style={{ height: `${height}px`, width: "72%" }} />
                          </>
                        ) : null}
                      </div>
                      <div className="flex h-1/2 w-full flex-col items-center">
                        {item.value < 0 ? (
                          <>
                            <div className={differenceColor(item.value)} style={{ height: `${height}px`, width: "72%" }} />
                            <span className="mt-0.5 text-[8px] font-bold text-slate-800">{item.value}</span>
                          </>
                        ) : null}
                        <span className="absolute top-[126px] min-h-9 text-center text-[8px] font-semibold leading-tight text-slate-700">
                          {item.reference}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        </section>

        <section className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70 lg:col-span-3">
          <PanelHeader compact>Porcentaje RTI por Dia</PanelHeader>
          <div className="overflow-x-auto p-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-950 text-white">
                  <th className="px-4 py-2 text-left font-semibold">Nombre RR</th>
                  <th className="w-32 px-4 py-2 text-center font-semibold">{day}</th>
                  <th className="w-32 px-4 py-2 text-center font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {RESPONSIBLE_RANKING.map((item) => (
                  <tr className="hover:bg-slate-50" key={item.name}>
                    <td className="px-4 py-1.5 font-semibold uppercase text-slate-800">{item.name}</td>
                    <td className={`px-4 py-1.5 text-center font-bold ${rankingColor(item.percentage)}`}>
                      {item.percentage} %
                    </td>
                    <td className="bg-slate-100 px-4 py-1.5 text-center font-bold text-slate-800">
                      {item.percentage} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid w-full gap-4 lg:col-span-3 lg:grid-cols-2">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Diferencia de envase salida vs retorno</PanelHeader>
            <div className="overflow-x-auto p-3">
              <div className="mb-2 flex justify-center gap-4 text-[9px] font-semibold text-slate-600">
                <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Envase salida</span>
                <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Envase retorno</span>
              </div>
              <div className="flex min-h-[190px] min-w-[570px] items-end gap-2 border-b border-slate-300">
                {PACKAGE_MOVEMENT.map((item) => (
                  <div className="flex min-w-0 flex-1 flex-col items-center" key={item.reference}>
                    <div className="flex h-[125px] items-end justify-center gap-0.5">
                      <MovementBar color="bg-gradient-to-t from-amber-500 to-yellow-300" value={item.outbound} />
                      <MovementBar color="bg-gradient-to-t from-emerald-600 to-emerald-400" value={item.returned} />
                    </div>
                    <span className="mt-2 min-h-11 text-center text-[8px] font-semibold leading-tight text-slate-700">{item.reference}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Porcentaje RTI por transportista</PanelHeader>
            <div className="flex min-h-[232px] items-end justify-center p-4">
              <div className="flex w-40 flex-col items-center">
                <span className="mb-1 text-xs font-bold text-slate-800">98 %</span>
                <div className="h-32 w-20 rounded-t-md bg-gradient-to-t from-emerald-700 to-emerald-400 shadow-sm" />
                <span className="mt-2 text-center text-[9px] font-semibold uppercase leading-tight text-slate-700">
                  Soluciones Logísticas Arenosas Ltd.
                </span>
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>SKU retorno</PanelHeader>
            <div className="overflow-x-auto p-3">
              <div className="flex min-h-[205px] min-w-[650px] items-end gap-1 border-b border-slate-300 px-1">
                {SKU_RETURNS.map((item, index) => (
                  <div className="flex min-w-0 flex-1 flex-col items-center" key={item.sku}>
                    <span className="mb-1 text-[7px] font-bold text-slate-700">{item.value}</span>
                    <div className={`w-full max-w-5 rounded-t-[2px] ${skuBarColor(index)}`} style={{ height: `${Math.max(item.value * 0.16, 4)}px` }} />
                    <span className="mt-1 text-[7px] font-semibold text-slate-600">{item.sku}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Diferencia en cajas</PanelHeader>
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[500px] text-[10px]">
                <thead>
                  <tr className="bg-slate-950 text-white">
                    <th className="px-2 py-2 text-left">Nombre RR</th>
                    <th className="px-2 py-2 text-center">Dif. cajas</th>
                    <th className="px-2 py-2 text-left">Transportista</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {BOX_DIFFERENCE_RANKING.map((item) => (
                    <tr className="transition-colors hover:bg-slate-50" key={item.name}>
                      <td className="px-2 py-1.5 font-semibold uppercase text-slate-800">{item.name}</td>
                      <td className="bg-red-500/90 px-2 py-1.5 text-center font-bold text-white">{item.value}</td>
                      <td className="px-2 py-1.5 font-semibold uppercase text-slate-700">{item.carrier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="grid w-full gap-4 lg:col-span-3 lg:grid-cols-[0.8fr_1.2fr]">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70 lg:col-span-2">
            <PanelHeader compact>Porcentaje RTI por día</PanelHeader>
            <div className="flex min-h-[210px] items-end justify-center px-5 pb-4 pt-6">
              <div className="flex w-full max-w-xs flex-col items-center">
                <span className="mb-2 text-xs font-bold text-slate-800">96.1 %</span>
                <div className="h-32 w-full max-w-48 rounded-t-md bg-gradient-to-t from-red-700 to-red-400 shadow-sm" />
                <div className="w-full border-t border-slate-300 pt-2 text-center text-xs font-bold text-slate-700">{day}</div>
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>RTI diario por ruta</PanelHeader>
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[390px] text-[11px]">
                <thead>
                  <tr className="bg-slate-950 text-white">
                    <th className="px-2 py-2 text-left">Ruta</th>
                    <th className="px-2 py-2 text-left">Mes</th>
                    <th className="px-2 py-2 text-center">Día</th>
                    <th className="px-2 py-2 text-center">Porcentaje RTI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {DAILY_ROUTE_RTI.map((item) => (
                    <tr className="hover:bg-slate-50" key={item.route}>
                      <td className="px-2 py-2 font-semibold text-slate-800">{item.route}</td>
                      <td className="px-2 py-2 text-slate-700">{item.month}</td>
                      <td className="px-2 py-2 text-center text-slate-700">{item.day}</td>
                      <td className={`px-2 py-2 text-center font-bold ${rankingColor(item.percentage)}`}>{item.percentage} %</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-bold text-slate-900">
                    <td className="px-2 py-2" colSpan={3}>Total</td>
                    <td className="px-2 py-2 text-center">86 %</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Seguimiento diario porcentaje RTI</PanelHeader>
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[430px] text-[11px]">
                <thead>
                  <tr className="bg-slate-950 text-white">
                    <th className="px-3 py-2 text-left">Descripción de envase</th>
                    <th className="w-20 px-3 py-2 text-center">{day}</th>
                    <th className="w-20 px-3 py-2 text-center">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {DAILY_PACKAGE_TRACKING.map((item) => (
                    <tr className="hover:bg-slate-50" key={item.description}>
                      <td className="px-3 py-2 font-semibold uppercase text-slate-800">{item.description}</td>
                      <td className={`px-3 py-2 text-center font-bold ${rankingColor(item.percentage)}`}>{item.percentage} %</td>
                      <td className="bg-slate-100 px-3 py-2 text-center font-bold text-slate-800">{item.percentage} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

function PanelHeader({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <h2 className={`bg-slate-950 text-center font-bold uppercase tracking-[0.08em] text-white ${compact ? "px-3 py-2 text-[11px]" : "px-4 py-3 text-sm"}`}>
      {children}
    </h2>
  );
}

function FilterSelect({
  allLabel,
  label,
  onChange,
  options,
  value,
}: {
  allLabel?: string;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="rounded-t-md bg-slate-950 px-2 py-1.5 text-center text-[11px] font-bold text-white">{label}</span>
      <select className="h-10 min-w-0 rounded-b-md border border-slate-300 bg-white px-2 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-200" onChange={(event) => onChange(event.target.value)} value={value}>
        {allLabel ? <option value="">{allLabel}</option> : null}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function uniqueValues(field: "responsible" | "reference" | "carrier") {
  return Array.from(new Set(RTI_RECORDS.map((record) => record[field]))).sort((left, right) => left.localeCompare(right, "es-CO"));
}

function performanceColor(percentage: number) {
  if (percentage >= 90) return "bg-slate-700";
  if (percentage >= 80) return "bg-slate-500";
  return "bg-slate-400";
}

function differenceColor(value: number) {
  if (value >= 100) return "rounded-t-sm bg-emerald-400";
  if (value >= 0) return "rounded-t-sm bg-amber-400";
  if (value <= -50) return "rounded-b-sm bg-red-600";
  return "rounded-b-sm bg-red-400";
}

function rankingColor(percentage: number) {
  if (percentage >= 100) return "bg-lime-500 text-slate-950";
  if (percentage >= 85) return "bg-amber-400 text-slate-950";
  return "bg-red-500 text-white";
}

function percentageBarColor(percentage: number) {
  if (percentage >= 95) return "bg-gradient-to-t from-emerald-700 to-emerald-400";
  if (percentage >= 85) return "bg-gradient-to-t from-amber-500 to-yellow-300";
  return "bg-gradient-to-t from-red-700 to-red-400";
}

function skuBarColor(index: number) {
  const colors = ["bg-emerald-500", "bg-amber-400", "bg-red-500"];
  return colors[index % colors.length];
}

function MovementBar({ color, value }: { color: string; value: number }) {
  return (
    <div className="flex h-full w-4 flex-col items-center justify-end">
      <span className="mb-1 -rotate-90 text-[7px] font-bold text-slate-700">{value}</span>
      <div className={`w-full ${color}`} style={{ height: `${Math.max(value * 0.06, 3)}px` }} />
    </div>
  );
}
