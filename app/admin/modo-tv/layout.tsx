import { Suspense, type ReactNode } from "react";
import { TvRotationProvider } from "./TvRotation";
import { TvDataCache } from "./TvDataCache";

export default function TvLayout({ children }: { children: ReactNode }) {
  return <TvDataCache><Suspense fallback={null}><TvRotationProvider>{children}</TvRotationProvider></Suspense></TvDataCache>;
}
