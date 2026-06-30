export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <section className="glass-panel w-full max-w-md rounded-lg p-6">
        <div className="flex items-center gap-4">
          <span className="relative grid h-12 w-12 place-items-center rounded-md bg-[#10223d]">
            <span className="absolute h-7 w-7 animate-ping rounded-full bg-[#00b8d9]/45" />
            <span className="h-3 w-3 rounded-full bg-[#f5bd19]" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#0f7c58]">Sincronizando</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-[#10223d] via-[#1264ff] to-[#00b8d9]" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
