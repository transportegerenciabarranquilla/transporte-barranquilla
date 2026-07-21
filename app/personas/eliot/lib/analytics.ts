import { classifyTd } from "./time";
import type { CrewMember, CrewRole, RankingEntry, TdRow, TdSnapshot, TdStatus, TrendPoint } from "./types";

export type DashboardFilters = {
  query: string;
  carrier: string;
  plate: string;
  status: TdStatus | "todos";
};

export type DashboardSummary = {
  people: number;
  averageByRole: Record<CrewRole, number>;
  marksByRole: Record<CrewRole, { marked: number; missing: number }>;
  missingMarks: number;
  totalMarks: number;
  missingPercent: number;
  statusCounts: Record<TdStatus, number>;
};

export function filterRows(rows: TdRow[], filters: DashboardFilters) {
  const query = normalize(filters.query);
  return rows.filter((row) => {
    if (filters.carrier !== "todos" && row.carrier !== filters.carrier) return false;
    if (filters.plate !== "todas" && row.plate !== filters.plate) return false;
    const members = Object.values(row.crew);
    if (filters.status !== "todos" && !members.some((member) => member.status === filters.status)) return false;
    if (!query) return true;
    const haystack = normalize(
      [row.dt, row.trip, row.plate, row.carrier, row.responsible, ...members.flatMap((member) => [member.name, member.document])].join(" "),
    );
    return haystack.includes(query);
  });
}

export function buildRankings(rows: TdRow[], role: CrewRole): RankingEntry[] {
  const groups = new Map<string, { member: CrewMember; total: number; records: number; missing: number; plates: Set<string> }>();
  for (const row of rows) {
    const member = row.crew[role];
    if (!member.validPerson) continue;
    const key = `${role}:${member.document || normalize(member.name)}`;
    const current = groups.get(key) ?? { member, total: 0, records: 0, missing: 0, plates: new Set<string>() };
    current.total += member.tdSeconds ?? 0;
    current.records += 1;
    if (member.tdSeconds === null) current.missing += 1;
    if (row.plate) current.plates.add(row.plate);
    groups.set(key, current);
  }

  return Array.from(groups.entries()).map(([key, item]) => {
    const averageSeconds = item.records ? Math.round(item.total / item.records) : 0;
    return {
      key,
      role,
      name: item.member.name,
      document: item.member.document,
      averageSeconds,
      records: item.records,
      missingMarks: item.missing,
      plates: Array.from(item.plates).sort(),
      status: item.missing === item.records ? "sin-marcacion" : classifyTd(averageSeconds),
    };
  });
}

export function sortRanking(entries: RankingEntry[], mode: "mejores" | "offenders") {
  return [...entries].sort((a, b) => {
    if (mode === "offenders") {
      return b.missingMarks - a.missingMarks || b.averageSeconds - a.averageSeconds || a.name.localeCompare(b.name, "es");
    }
    return a.missingMarks - b.missingMarks || a.averageSeconds - b.averageSeconds || a.name.localeCompare(b.name, "es");
  });
}

export function summarizeRows(rows: TdRow[]): DashboardSummary {
  const members = rows.flatMap((row) => Object.values(row.crew)).filter((member) => member.validPerson);
  const identities = new Set(members.map((member) => member.document || normalize(member.name)));
  const statusCounts: Record<TdStatus, number> = { bien: 0, regular: 0, mal: 0, "sin-marcacion": 0 };
  members.forEach((member) => { statusCounts[member.status] += 1; });
  const averageByRole = {
    rr: average(members.filter((member) => member.role === "rr").map(score)),
    aux: average(members.filter((member) => member.role === "aux").map(score)),
    conductor: average(members.filter((member) => member.role === "conductor").map(score)),
  };
  const marksByRole = {
    rr: countMarks(members.filter((member) => member.role === "rr")),
    aux: countMarks(members.filter((member) => member.role === "aux")),
    conductor: countMarks(members.filter((member) => member.role === "conductor")),
  };
  const missingMarks = statusCounts["sin-marcacion"];
  return {
    people: identities.size,
    averageByRole,
    marksByRole,
    missingMarks,
    totalMarks: members.length,
    missingPercent: members.length ? (missingMarks / members.length) * 100 : 0,
    statusCounts,
  };
}

export function buildTrend(snapshots: TdSnapshot[], operationalDate: string): TrendPoint[] {
  return snapshots
    .filter((snapshot) => snapshot.operationalDate === operationalDate)
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
    .map((snapshot) => {
      const summary = summarizeRows(snapshot.rows);
      return {
        snapshotId: snapshot.id,
        uploadedAt: snapshot.uploadedAt,
        averages: summary.averageByRole,
        missingMarks: summary.missingMarks,
      };
    });
}

export function getCarriers(rows: TdRow[]) {
  return Array.from(new Set(rows.map((row) => row.carrier).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
}

export function getPlates(rows: TdRow[]) {
  return Array.from(new Set(rows.map((row) => row.plate).filter(Boolean))).sort();
}

export function groupRowsByPlate(rows: TdRow[]) {
  const groups = new Map<string, TdRow[]>();
  rows.forEach((row) => groups.set(row.plate || "Sin placa", [...(groups.get(row.plate || "Sin placa") ?? []), row]));
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function score(member: CrewMember) {
  return member.tdSeconds ?? 0;
}

function countMarks(members: CrewMember[]) {
  const marked = members.filter((member) => member.tdSeconds !== null).length;
  return { marked, missing: members.length - marked };
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
