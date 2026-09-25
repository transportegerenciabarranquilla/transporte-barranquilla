import Link from "next/link";
import FueraDeRangoCharts from "../FueraDeRangoCharts";

export default function FueraDeRangoPage() {
  return <main className="min-h-screen bg-[#f4f7fb] px-5 py-6 text-slate-900 sm:px-8">
    <div className="mx-auto max-w-7xl">
      <Link href="/" className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#10223d]">← Volver a módulos</Link>
      <FueraDeRangoCharts contractor="Todas" from="" to="" dt="" />
    </div>
  </main>;
}
