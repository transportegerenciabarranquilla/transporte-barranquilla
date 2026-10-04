let revision = 0;
export const getSessionCacheRevision = () => revision;
export function advanceSessionCacheRevision() { revision += 1; }
