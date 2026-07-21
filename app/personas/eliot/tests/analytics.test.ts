import { describe, expect, it } from "vitest";
import { buildRankings, sortRanking, summarizeRows } from "../lib/analytics";
import { classifyTd } from "../lib/time";
import type { CrewRole, TdRow } from "../lib/types";

describe("TD analytics", () => {
  it("includes missing marks as zero in person averages", () => {
    const rows = [makeRow("1", "Persona A", 3600), makeRow("2", "Persona A", null)];
    rows[1].crew.rr.document = rows[0].crew.rr.document;
    const ranking = buildRankings(rows, "rr");
    expect(ranking).toHaveLength(1);
    expect(ranking[0].averageSeconds).toBe(1800);
    expect(ranking[0].missingMarks).toBe(1);
  });

  it("orders best and offenders in opposite operational directions", () => {
    const rows = [makeRow("1", "Persona A", 3600), makeRow("2", "Persona B", 600), makeRow("3", "Persona C", null)];
    const ranking = buildRankings(rows, "rr");
    expect(sortRanking(ranking, "mejores")[0].name).toBe("Persona B");
    expect(sortRanking(ranking, "offenders")[0].name).toBe("Persona C");
    expect(sortRanking(ranking, "offenders")[1].name).toBe("Persona A");
  });

  it("excludes unassigned people from summary counts", () => {
    const row = makeRow("1", "Sin responsable", null, false);
    const summary = summarizeRows([row]);
    expect(summary.people).toBe(2);
    expect(summary.marksByRole).toEqual({
      rr: { marked: 0, missing: 0 },
      aux: { marked: 1, missing: 0 },
      conductor: { marked: 1, missing: 0 },
    });
  });
});

function makeRow(id: string, rrName: string, rrTd: number | null, rrValid = true): TdRow {
  const member = (role: CrewRole, name: string, tdSeconds: number | null, validPerson = true) => ({
    role,
    name,
    document: `${id}-${role}`,
    arrivalSeconds: tdSeconds === null ? null : 100,
    tdSeconds,
    status: classifyTd(tdSeconds),
    validPerson,
  });
  return {
    id,
    dt: id,
    trip: "1",
    plate: `PLACA${id}`,
    responsible: rrName,
    dispatchDate: "2026-07-15",
    dtDate: "2026-07-14",
    routeStatus: "En ruta",
    clients: 1,
    visited: 0,
    boxes: 10,
    hectoliters: 1,
    departureSeconds: 3600,
    lateDepartureCause: "",
    lateDepartureComment: "",
    routeArrival: "Pendiente",
    routeTime: "",
    plannedTime: "",
    territory: "",
    carrier: "Logisticos",
    crew: {
      rr: member("rr", rrName, rrTd, rrValid),
      aux: member("aux", `Aux ${id}`, 2400),
      conductor: member("conductor", `Conductor ${id}`, 1800),
    },
  };
}
