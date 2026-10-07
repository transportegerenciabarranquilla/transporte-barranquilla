import { ARENOSA_CONTRACTORS, CONTRACTORS, isSiteAdminEmail, normalizeContractorName } from "./contractors.ts";

type ScopeSession = { email: string; contractor: string; isAdmin: boolean; isPeople?: boolean };

export function allowedContractors(session: ScopeSession): readonly string[] {
  if (isSiteAdminEmail(session.email)) return ARENOSA_CONTRACTORS;
  return session.isAdmin || session.isPeople ? CONTRACTORS : [session.contractor];
}

export function canAccessContractor(session: ScopeSession, contractor: unknown) {
  return allowedContractors(session).some((item) => normalizeContractorName(item) === normalizeContractorName(String(contractor || "")));
}

export function scopeQuery(params: URLSearchParams, session: ScopeSession, column = "contractor") {
  if (!isSiteAdminEmail(session.email)) return params;
  const constraint = `${column}.in.(${ARENOSA_CONTRACTORS.map((value) => `"${value}"`).join(",")})`;
  params.append("and", `(${constraint})`);
  return params;
}
