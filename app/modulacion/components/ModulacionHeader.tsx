import { ArrowLeft, Boxes } from "lucide-react";

export function ModulacionHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <button
          className="flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#10223d] transition hover:bg-slate-100"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={18} />
          Portal
        </button>
        <div className="flex items-center gap-2 rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-medium text-[#10223d]">
          <Boxes size={18} />
          Modulo de modulacion
        </div>
      </div>
    </header>
  );
}
