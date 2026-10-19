import { describe, expect, it } from "vitest";
import { cuesToSrt, srtTime } from "./srt";

describe("SRT", () => {
  it("formats times with a comma and three digits", () => {
    expect(srtTime(0)).toBe("00:00:00,000");
    expect(srtTime(3_723_045)).toBe("01:02:03,045");
  });

  it("numbers cues in time order with CRLF and keeps Tamil and line breaks", () => {
    const { text, written } = cuesToSrt([
      { text: "Second", start_ms: 2000, end_ms: 3000 },
      { text: "வணக்கம்\nநண்பர்களே", start_ms: 0, end_ms: 1500 },
    ]);
    expect(written).toBe(2);
    expect(text).toBe(
      "1\r\n00:00:00,000 --> 00:00:01,500\r\nவணக்கம்\r\nநண்பர்களே\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\nSecond\r\n",
    );
  });

  it("leaves out empty and impossible subtitles and says how many", () => {
    const { text, written, skipped } = cuesToSrt([
      { text: "ok", start_ms: 0, end_ms: 1000 },
      { text: "   ", start_ms: 1000, end_ms: 2000 },
      { text: "backwards", start_ms: 3000, end_ms: 3000 },
      { text: "negative", start_ms: -5, end_ms: 100 },
    ]);
    expect([written, skipped]).toEqual([1, 3]);
    expect(text).not.toContain("backwards");
  });

  it("removes blank lines inside a subtitle so players do not cut it short", () => {
    expect(cuesToSrt([{ text: "a\n\nb", start_ms: 0, end_ms: 1000 }]).text).toContain("a\r\nb\r\n");
  });

  it("keeps overlapping subtitles exactly as they are", () => {
    const { text } = cuesToSrt([
      { text: "A", start_ms: 0, end_ms: 2000 },
      { text: "B", start_ms: 1000, end_ms: 3000 },
    ]);
    expect(text).toContain("00:00:01,000 --> 00:00:03,000");
  });
});
