"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiQueryError } from "../lib/apiQuery";
import { getSessionCacheRevision } from "../lib/sessionCacheRevision";
import { useRouter } from "next/navigation";

let browserClient: { client: QueryClient; revision: number } | undefined;

function getQueryClient() {
  const revision = getSessionCacheRevision();
  if (typeof window !== "undefined" && browserClient?.revision === revision) return browserClient.client;
  const client = new QueryClient({ defaultOptions: { queries: {
    staleTime: 60_000, gcTime: 5 * 60_000,
    refetchOnWindowFocus: false, refetchOnReconnect: true,
    retry: (attempt, error) => attempt < 1 && !(error instanceof ApiQueryError && error.status >= 400 && error.status < 500),
    retryDelay: 2000,
  } } });
  // Each server render gets an empty client; only the browser reuses queries.
  if (typeof window !== "undefined") browserClient = { client, revision };
  return client;
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(getQueryClient);
  const router = useRouter();
  useEffect(() => {
    const clear = () => { void client.cancelQueries(); client.clear(); };
    const invalidate = () => { clear(); browserClient = undefined; router.replace("/"); };
    window.addEventListener("bavaria-session-reset", clear);
    window.addEventListener("bavaria-session-invalid", invalidate);
    return () => { window.removeEventListener("bavaria-session-reset", clear); window.removeEventListener("bavaria-session-invalid", invalidate); };
  }, [client, router]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
