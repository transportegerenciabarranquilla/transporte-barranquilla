"use client";

import { useEffect, useState } from "react";
import { ARENOSA_CONTRACTORS, CONTRACTORS } from "./contractors";

export function useAdminScope() {
  const [scope, setScope] = useState<{ contractors: readonly string[]; isSiteAdmin: boolean; ready: boolean }>({ contractors: [], isSiteAdmin: false, ready: false });
  useEffect(() => {
    let active = true;
    void fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json();
        if (active) setScope({ contractors: body.session?.isSiteAdmin ? ARENOSA_CONTRACTORS : CONTRACTORS, isSiteAdmin: Boolean(body.session?.isSiteAdmin), ready: true });
      }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return scope;
}
