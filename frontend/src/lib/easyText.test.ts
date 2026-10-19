import { describe, expect, it } from "vitest";
import { segmentsFromTyped, timeSegments } from "./easyText";

describe("Easy mode text", () => {
  it("makes one subtitle per line and ignores blank lines", () => {
    expect(segmentsFromTyped("வணக்கம்\n\nHello there\n")).toEqual(["வணக்கம்", "Hello there"]);
  });

  it("splits a single pasted paragraph into sentences", () => {
    expect(segmentsFromTyped("First one. Second one! Third?")).toEqual(["First one.", "Second one!", "Third?"]);
  });

  it("explains empty text", () => {
    expect(() => segmentsFromTyped("   \n ")).toThrow(/No text/);
  });

  it("spreads subtitles across the whole video", () => {
    const { cues, mode } = timeSegments(["One.", "Two.", "Three."], 12_000);
    expect(mode).toBe("fit");
    expect(cues[0].start_ms).toBe(0);
    expect(cues.at(-1)?.end_ms).toBe(12_000);
  });

  it("falls back to reading speed when the video is too short to fit them all", () => {
    const many = Array.from({ length: 50 }, (_, i) => `Line ${String(i)}`);
    const { mode, cues } = timeSegments(many, 1000);
    expect(mode).toBe("readable");
    expect(cues).toHaveLength(50);
  });
});
