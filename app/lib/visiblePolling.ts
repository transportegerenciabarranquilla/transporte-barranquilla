// Pausa las lecturas de una pantalla oculta; nunca interrumpe escrituras.
export function startVisiblePolling(task: () => void | Promise<unknown>, intervalMs: number) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const isVisible = () => document.visibilityState !== "hidden";

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const run = async () => {
    if (stopped || running || !isVisible()) return;
    clearTimer();
    running = true;
    try {
      await task();
    } catch {
      // Un fallo de red no detiene el siguiente intento periódico.
    } finally {
      running = false;
      if (!stopped && isVisible()) timer = setTimeout(run, intervalMs);
    }
  };
  const onVisibilityChange = () => {
    clearTimer();
    if (isVisible()) void run();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  void run();
  return () => {
    stopped = true;
    clearTimer();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
