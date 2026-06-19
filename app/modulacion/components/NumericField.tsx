import { Boxes, Hash } from "lucide-react";

export function NumericField({
  error,
  label,
  value,
  onChange,
  icon = "hash",
}: {
  error?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: "hash" | "boxes";
}) {
  const Icon = icon === "boxes" ? Boxes : Hash;

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <span className="relative block">
        <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          className={`h-12 w-full rounded-md border bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 ${
            error ? "border-red-400" : "border-slate-200 focus:border-[#0f7c58]"
          }`}
          inputMode="numeric"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Solo numeros"
          type="text"
          value={value}
        />
      </span>
      <p className="mt-1 text-xs text-slate-400">SOLO COLOCAR NUMEROS SIN COMAS NI ESPACIOS</p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </label>
  );
}
