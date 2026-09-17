"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TV_ROUTES = ["/admin/modo-tv", "/admin/modo-tv/refusal", "/admin/modo-tv/refusal-com", "/admin/modo-tv/rango", "/admin/modo-tv/ruta-sip"];
const ROTATION_MS = 15_000;

export function TvRotationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("transicion") === "1";

  useEffect(() => {
    const index = TV_ROUTES.indexOf(pathname);
    if (!active || index === -1) return;

    const timer = window.setTimeout(() => {
      router.replace(`${TV_ROUTES[(index + 1) % TV_ROUTES.length]}?transicion=1`, { scroll: false });
    }, ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [active, pathname, router]);

  return <>{children}</>;
}
