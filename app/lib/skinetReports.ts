export const SKINET_REPORT_INTERVAL = 20 * 60_000;

// Un solo informe pendiente: al volver a una pestaña oculta no reproduce
// una cola de resúmenes antiguos. La conversación siempre tiene prioridad.
export function startSkinetReports(options: {
  now: () => number;
  visible: () => boolean;
  busy: () => boolean;
  load: () => Promise<string>;
  deliver: (report: string) => boolean;
  error: () => void;
  setTimer: (task: () => void, delay: number) => number;
  clearTimer: (timer: number) => void;
}) {
  let nextAt = options.now() + SKINET_REPORT_INTERVAL;
  let stopped = false;
  let running = false;
  let pending = "";
  let timer: number | undefined;
  function schedule(delay: number) {
    if (timer !== undefined) options.clearTimer(timer);
    if (!stopped) timer = options.setTimer(() => { void tick(); }, delay);
  }
  async function tick() {
    if (stopped || running) return;
    if (!options.visible()) { pending = ""; schedule(30_000); return; }
    if (options.now() < nextAt) { schedule(nextAt - options.now()); return; }
    if (options.busy()) { schedule(5_000); return; }
    running = true;
    try {
      const report = pending || await options.load();
      if (stopped) return;
      if (!options.visible()) { pending = ""; schedule(30_000); return; }
      if (options.busy() || !options.deliver(report)) { pending = report; schedule(5_000); return; }
      pending = "";
      nextAt = options.now() + SKINET_REPORT_INTERVAL;
      schedule(SKINET_REPORT_INTERVAL);
    } catch {
      if (!stopped) { options.error(); schedule(60_000); }
    } finally { running = false; }
  }
  schedule(SKINET_REPORT_INTERVAL);
  return { check: () => { void tick(); }, stop: () => {
    stopped = true;
    pending = "";
    if (timer !== undefined) options.clearTimer(timer);
  } };
}
