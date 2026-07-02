"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";

export function AnalyticsDateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const router = useRouter();

  function updateDate(nextValue: string) {
    onChange(nextValue);
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (nextValue) {
      params.set("fecha", nextValue);
    } else {
      params.delete("fecha");
    }

    const query = params.toString();
    router.replace(query ? `${window.location.pathname}?${query}` : window.location.pathname, { scroll: false });
  }

  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10223d] shadow-sm">
      <CalendarDays size={17} className="text-slate-500" />
      <input
        className="h-8 w-[132px] bg-transparent text-sm font-semibold text-[#10223d] outline-none"
        onChange={(event) => updateDate(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

export type AnalyticsDateRange = {
  from: string;
  to: string;
};

export function AnalyticsDateRangeFilter({ value, onChange }: { value: AnalyticsDateRange; onChange: (value: AnalyticsDateRange) => void }) {
  const router = useRouter();

  function updateRange(nextValue: AnalyticsDateRange) {
    const normalized = normalizeDateRange(nextValue.from, nextValue.to);
    onChange(normalized);
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    params.set("desde", normalized.from);
    params.set("hasta", normalized.to);
    params.delete("fecha");

    const query = params.toString();
    router.replace(query ? `${window.location.pathname}?${query}` : window.location.pathname, { scroll: false });
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#10223d] shadow-sm">
      <CalendarDays size={15} className="text-slate-500" />
      <label className="flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Desde</span>
        <input
          className="h-7 w-[112px] bg-transparent text-xs font-semibold text-[#10223d] outline-none"
          onChange={(event) => updateRange({ ...value, from: event.target.value })}
          type="date"
          value={value.from}
        />
      </label>
      <label className="flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Hasta</span>
        <input
          className="h-7 w-[112px] bg-transparent text-xs font-semibold text-[#10223d] outline-none"
          onChange={(event) => updateRange({ ...value, to: event.target.value })}
          type="date"
          value={value.to}
        />
      </label>
    </div>
  );
}

export function normalizeDateRange(from: string, to: string) {
  const today = getTodayKey();
  const start = from || to || today;
  const end = to || from || today;

  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

function getTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}
