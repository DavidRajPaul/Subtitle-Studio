import { describe, expect, it } from "vitest";
import { segmentsToCues, type WordTiming } from "./speechCues";

const words = (...items: [number, number, string][]): WordTiming[] =>
  items.map(([start_ms, end_ms, text]) => ({ start_ms, end_ms, text }));
const view = (cues: ReturnType<typeof segmentsToCues>) => cues.map((c) => [c.text, c.start_ms, c.end_ms]);

// Same cases as the Python engine's tests (backend/tests/test_speech.py).
describe("segmentsToCues", () => {
  it("keeps short segments as one cue each with exact timing; drops blank ones", () => {
    const cues = segmentsToCues([
      { start_ms: 0, end_ms: 1500, text: " வணக்கம் நண்பர்களே." },
      { start_ms: 1600, end_ms: 3000, text: " Hello there" },
      { start_ms: 3000, end_ms: 3100, text: "   " },
    ]);
    expect(view(cues)).toEqual([
      ["வணக்கம் நண்பர்களே.", 0, 1500],
      ["Hello there", 1600, 3000],
    ]);
    expect(new Set(cues.map((c) => c.id)).size).toBe(2);
  });

  it("splits a long segment at word boundaries by length", () => {
    const w = words(...Array.from({ length: 12 }, (_, i): [number, number, string] => [i * 500, i * 500 + 400, ` word${String(i).padStart(2, "0")}`]));
    const text = w.map((x) => x.text).join("");
    const cues = segmentsToCues([{ start_ms: 0, end_ms: 6000, text, words: w }], 30, 60_000);
    expect(cues.every((c) => c.text.length <= 30)).toBe(true);
    expect(cues.map((c) => c.text).join(" ")).toBe(text.trim());
    expect(cues[0].start_ms).toBe(0);
    expect(cues.at(-1)?.end_ms).toBe(5900);
  });

  it("splits a long segment by duration", () => {
    const w = words([0, 3000, " one"], [3000, 6000, " two"], [6000, 9000, " three"]);
    expect(view(segmentsToCues([{ start_ms: 0, end_ms: 9000, text: " one two three", words: w }], 84, 7000))).toEqual([
      ["one two", 0, 6000],
      ["three", 6000, 9000],
    ]);
  });

  it("splits after a sentence end once reasonably long", () => {
    const w = words([0, 400, " This"], [400, 800, " is"], [800, 1200, " the"], [1200, 1600, " first."], [1700, 2000, " Second"], [2000, 2400, " one."]);
    const cues = segmentsToCues([{ start_ms: 0, end_ms: 2400, text: " This is the first. Second one.", words: w }], 25, 60_000);
    expect(cues.map((c) => c.text)).toEqual(["This is the first.", "Second one."]);
  });

  it("keeps a long segment without word times for the editor to flag", () => {
    const cues = segmentsToCues([{ start_ms: 0, end_ms: 20_000, text: ` ${"x".repeat(200)}` }]);
    expect(cues).toHaveLength(1);
    expect(cues[0].end_ms).toBe(20_000);
  });

  it("joins languages without spaces correctly", () => {
    const w = words([0, 300, "日本"], [300, 600, "語"], [600, 900, "です。"]);
    const cues = segmentsToCues([{ start_ms: 0, end_ms: 9000, text: "日本語です。", words: w }], 84, 500);
    expect(cues.map((c) => c.text).join("")).toBe("日本語です。");
  });
});
