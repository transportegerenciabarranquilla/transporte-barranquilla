import { buildExactZkiModel, decodeExactZkiSolution, type ExactDriver, type ExactPlan } from "./zkiExact";
import type { DriverVehiclePair } from "./zkiEngine";

type Request = { plans: ExactPlan[]; drivers: ExactDriver[]; pairs: DriverVehiclePair[]; capacities: Array<[string, number]>; minimumZki: number };

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    const modulePath = "/solver-assets/highs.mjs";
    const { default: loadHighs } = await import(/* webpackIgnore: true */ modulePath) as { default: typeof import("highs")["default"] };
    const highs = await loadHighs({ locateFile: (file) => new URL(`/solver-assets/${file}`, self.location.origin).href });
    const model = buildExactZkiModel(data.plans, data.drivers, data.pairs, data.capacities, data.minimumZki);
    const result = highs.solve(model.lp, { output_flag: false, mip_rel_gap: 0, time_limit: 120 });
    if (result.Status !== "Optimal") throw new Error(`La optimización terminó en estado ${result.Status}; no se confirmó el mejor resultado.`);
    self.postMessage({ choices: decodeExactZkiSolution(model, result.Columns, data.plans, data.minimumZki), optimal: true });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "No se pudo completar la optimización global." });
  }
};
