import { describe, expect, it } from "vitest";
import { formatTimecode, parseTimecode } from "./timecode";

describe("formatTimecode", () => {
  it("formats integer milliseconds as HH:MM:SS.mmm", () => {
    expect(formatTimecode(0)).toBe("00:00:00.000");
    expect(formatTimecode(5_200)).toBe("00:00:05.200");
    expect(formatTimecode(3_723_045)).toBe("01:02:03.045");
  });
  it("clamps negatives to zero", () => {
    expect(formatTimecode(-10)).toBe("00:00:00.000");
  });
});

describe("parseTimecode", () => {
  it.each([
    ["5", 5_000],
    ["5.2", 5_200],
    ["65.25", 65_250],
    ["01:05", 65_000],
    ["00:01:05.250", 65_250],
    ["1:02:03.045", 3_723_045],
    ["  00:00:12  ", 12_000],
  ])("parses %s", (input, ms) => {
    expect(parseTimecode(input)).toEqual({ ok: true, ms });
  });

  it.each(["", "abc", "1:2:3:4", "-5", "5.1234", "1:75", "1:75:00"])("rejects %s", (input) => {
    expect(parseTimecode(input).ok).toBe(false);
  });

  it("round-trips formatted values", () => {
    for (const ms of [0, 1, 999, 59_999, 3_599_999, 7_200_001]) {
      expect(parseTimecode(formatTimecode(ms))).toEqual({ ok: true, ms });
    }
  });
});
