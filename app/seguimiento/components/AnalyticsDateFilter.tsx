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
