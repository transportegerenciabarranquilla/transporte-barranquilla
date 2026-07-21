import { describe, expect, it } from "vitest";
import { calculateTdSeconds, classifyTd, formatDuration, parseTimeSeconds } from "../lib/time";

describe("time utilities", () => {
  it("parses Excel fractions and clock text", () => {
    expect(parseTimeSeconds(0.25)).toBe(6 * 3600);
    expect(parseTimeSeconds("06:38")).toBe(6 * 3600 + 38 * 60);
    expect(parseTimeSeconds("06:01:12")).toBe(6 * 3600 + 72);
  });

  it("treats missing and invalid marks as null", () => {
    expect(parseTimeSeconds("SIN MARCACION")).toBeNull();
    expect(parseTimeSeconds("Pendiente")).toBeNull();
    expect(parseTimeSeconds("#¡VALOR!")).toBeNull();
  });

  it("calculates and classifies TD boundaries", () => {
    expect(calculateTdSeconds(parseTimeSeconds("06:52:47"), parseTimeSeconds("06:38"))).toBe(887);
    expect(classifyTd(2400)).toBe("bien");
    expect(classifyTd(2401)).toBe("regular");
    expect(classifyTd(3600)).toBe("regular");
    expect(classifyTd(3601)).toBe("mal");
    expect(classifyTd(null)).toBe("sin-marcacion");
    expect(formatDuration(887)).toBe("00:14:47");
  });
});
