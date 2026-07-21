import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTdWorkbook } from "../lib/parser";

const templatePath = join(process.env.USERPROFILE || "", "Downloads", "Plantilla TD.xlsx");

describe.skipIf(!existsSync(templatePath))("Plantilla TD.xlsx", () => {
  it("maps the real template and recalculates the role TD values", () => {
    const file = readFileSync(templatePath);
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const parsed = parseTdWorkbook(buffer);
    expect(parsed.operationalDate).toBe("2026-07-15");
    expect(parsed.rows).toHaveLength(52);
    expect(parsed.rows[1].crew.rr.name).toContain("Gutierrez");
    expect(parsed.rows[1].crew.rr.tdSeconds).toBe(887);
    expect(parsed.rows[1].crew.aux.tdSeconds).toBe(887);
    expect(parsed.rows[1].crew.conductor.tdSeconds).toBe(3107);
  });
});
