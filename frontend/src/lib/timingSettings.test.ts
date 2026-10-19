import { describe, expect, it } from "vitest";
import { DEFAULT_DRAFT, parseSettings } from "./timingSettings";

describe("parseSettings", () => {
  it("converts the defaults to integer milliseconds", () => {
    expect(parseSettings(DEFAULT_DRAFT)).toEqual({
      ok: true,
      settings: { chars_per_second: 17, min_duration_ms: 1000, max_duration_ms: 7000, gap_ms: 100 },
    });
  });

  it("rounds fractional seconds to whole milliseconds", () => {
    const result = parseSettings({ cps: "12.5", min: "0.75", max: "5.005", gap: "0" });
    expect(result).toEqual({
      ok: true,
      settings: { chars_per_second: 12.5, min_duration_ms: 750, max_duration_ms: 5005, gap_ms: 0 },
    });
  });

  it.each([
    ["cps", { ...DEFAULT_DRAFT, cps: "0" }],
    ["cps", { ...DEFAULT_DRAFT, cps: "abc" }],
    ["cps", { ...DEFAULT_DRAFT, cps: "61" }],
    ["min", { ...DEFAULT_DRAFT, min: "" }],
    ["min", { ...DEFAULT_DRAFT, min: "-1" }],
    ["max", { ...DEFAULT_DRAFT, max: "601" }],
    ["gap", { ...DEFAULT_DRAFT, gap: "6" }],
  ] as const)("flags an invalid %s", (field, draft) => {
    const result = parseSettings(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toBeTruthy();
  });

  it("rejects a minimum longer than the maximum", () => {
    const result = parseSettings({ ...DEFAULT_DRAFT, min: "9", max: "3" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.min).toMatch(/cannot be longer/);
  });
});
