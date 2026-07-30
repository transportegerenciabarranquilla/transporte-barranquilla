import { ArrowLeft, CalendarDays, ClipboardCheck } from "lucide-react";

export function CheckinHeader({
  selectedDate,
  onBack,
  onDateChange,
  onOpenRefusal,
}: {
  selectedDate: string;
  onBack: () => void;
  onDateChange: (date: string) => void;
  onOpenRefusal: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button aria-label="Volver a seguimiento" className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100" onClick={onBack} type="button">
            <ArrowLeft size={19} />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Checkin diario</p>
            <h1 className="text-2xl font-semibold text-[#10223d]">Cajas checkin</h1>
          </div>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-[#10223d] px-4 text-sm font-semibold text-white transition hover:bg-[#1b355b]" onClick={onOpenRefusal} type="button">
          <ClipboardCheck size={18} />
          Ver refusal
        </button>
        <label className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="h-10 rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]" onChange={(event) => onDateChange(event.target.value)} type="date" value={selectedDate} />
        </label>
      </div>
    </header>
  );
}
