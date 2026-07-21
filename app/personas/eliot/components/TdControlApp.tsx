"use client";

import { PinGate } from "./PinGate";
import { TdDashboard } from "./TdDashboard";

export function TdControlApp() {
  return <PinGate>{(lock) => <TdDashboard onLock={lock} />}</PinGate>;
}
