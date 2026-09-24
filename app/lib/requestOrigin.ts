// SameSite=Lax is useful defense in depth, but does not cover sibling origins.
export function isTrustedMutation(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).origin === new URL(request.url).origin; }
    catch { return false; }
  }
  const site = request.headers.get("sec-fetch-site");
  // Non-browser jobs can omit Origin; this does not grant authentication.
  return !site || site === "same-origin" || site === "none";
}
