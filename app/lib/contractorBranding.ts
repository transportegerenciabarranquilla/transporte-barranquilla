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

const DEFAULT_BRAND = BRANDS.Logisticos;

export function getContractorBrand(contractor: string | null | undefined) {
  return BRANDS[contractor || ""] || DEFAULT_BRAND;
}

export function useContractorBrand() {
  const [brand, setBrand] = useState<ContractorBrand>(DEFAULT_BRAND);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => setBrand(getContractorBrand(body?.session?.contractor)))
      .catch(() => undefined);
  }, []);

  return brand;
}
