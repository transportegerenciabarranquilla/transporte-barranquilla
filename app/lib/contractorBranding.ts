"use client";

import { useEffect, useState } from "react";

export type ContractorBrand = {
  name: string;
  logo: string;
  accent: string;
  soft: string;
};

const BRANDS: Record<string, ContractorBrand> = {
  Logisticos: { name: "Logisticos", logo: "/contractors/logisticos.png", accent: "#f5bd19", soft: "#fff8e6" },
  "Punto Corona": { name: "Punto Corona", logo: "/contractors/punto-corona.png", accent: "#22c55e", soft: "#ecfdf3" },
  "Surti Cervezas": { name: "Surti Cervezas", logo: "/contractors/surti-cervezas.png", accent: "#f59e0b", soft: "#fff7ed" },
};

export const CONTRACTOR_SESSION_KEY = "bavaria.session.contractor";
const DEFAULT_BRAND: ContractorBrand = { name: "", logo: "", accent: "#00b8d9", soft: "#e8f7ff" };

export function getContractorBrand(contractor: string | null | undefined) {
  return BRANDS[contractor || ""] || DEFAULT_BRAND;
}

export function useContractorBrand() {
  const [brand, setBrand] = useState<ContractorBrand>(DEFAULT_BRAND);

  useEffect(() => {
    setBrand(getCachedContractorBrand());

    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        const contractor = body?.session?.contractor || "";
        cacheContractor(contractor);
        setBrand(getContractorBrand(contractor));
      })
      .catch(() => undefined);
  }, []);

  return brand;
}

export function cacheContractor(contractor: string | null | undefined) {
  if (typeof window === "undefined") return;

  try {
    if (contractor) {
      window.sessionStorage.setItem(CONTRACTOR_SESSION_KEY, contractor);
    } else {
      window.sessionStorage.removeItem(CONTRACTOR_SESSION_KEY);
    }
  } catch {
    // Storage may be unavailable; the session endpoint will still resolve the brand.
  }
}

function getCachedContractorBrand() {
  if (typeof window === "undefined") return DEFAULT_BRAND;

  try {
    return getContractorBrand(window.sessionStorage.getItem(CONTRACTOR_SESSION_KEY));
  } catch {
    return DEFAULT_BRAND;
  }
}
