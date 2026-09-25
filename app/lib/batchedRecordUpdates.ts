// Agrupa blur + clic de una misma fila sin retrasar indefinidamente el guardado.
export function createBatchedRecordUpdater<T extends object, R>(
  save: (id: string, changes: T) => Promise<R>,
  delayMs = 120,
) {
  const pending = new Map<string, { changes: T; promise: Promise<R> }>();
  return (id: string, changes: T): Promise<R> => {
    const existing = pending.get(id);
    if (existing) {
      Object.assign(existing.changes, changes);
      return existing.promise;
    }
    const combined = { ...changes };
    const promise = new Promise<R>((resolve, reject) => {
      setTimeout(() => {
        pending.delete(id);
        void Promise.resolve().then(() => save(id, combined)).then(resolve, reject);
      }, delayMs);
    });
    pending.set(id, { changes: combined, promise });
    return promise;
  };
}
