import { describe, expect, it } from "vitest";
import {
  cutDuration,
  isUncut,
  mergeTouching,
  partsProblem,
  previewCut,
  removedParts,
  removeTime,
  restorePart,
  splitAt,
  toCut,
  toSource,
  trimTo,
  wholeVideo,
  type Range,
  type TimedCue,
} from "./cuts";

const cue = (id: string, start_ms: number, end_ms: number): TimedCue => ({ id, text: id, start_ms, end_ms });
const D = 10_000;

describe("mapping between the cut timeline and the original", () => {
  const parts: Range[] = [
    { start_ms: 1000, end_ms: 3000 },
    { start_ms: 5000, end_ms: 8000 },
  ];
  it("adds up the kept parts", () => {
    expect(cutDuration(parts)).toBe(5000);
  });
  it("maps both ways and reports cut-away moments", () => {
    expect(toSource(parts, 0)).toBe(1000);
    expect(toSource(parts, 1999)).toBe(2999);
    expect(toSource(parts, 2000)).toBe(5000);
    expect(toSource(parts, 5000)).toBe(8000);
    expect(toCut(parts, 2500)).toBe(1500);
    expect(toCut(parts, 4000)).toBeNull();
    expect(toCut(parts, 8000)).toBe(5000);
    for (const t of [0, 1234, 2000, 4321, 4999]) expect(toCut(parts, toSource(parts, t))).toBe(t);
  });
});

describe("split", () => {
  it("makes two touching parts without removing anything", () => {
    const parts = splitAt(wholeVideo(D), 4000);
    expect(parts).toEqual([
      { start_ms: 0, end_ms: 4000 },
      { start_ms: 4000, end_ms: D },
    ]);
    expect(isUncut(parts, D)).toBe(true);
    expect(cutDuration(parts)).toBe(D);
  });
  it("ignores a split too close to an edge", () => {
    expect(splitAt(wholeVideo(D), 50)).toEqual(wholeVideo(D));
  });
});

describe("removing time", () => {
  const cues = [cue("a", 0, 1000), cue("b", 1500, 2500), cue("c", 2800, 4200), cue("d", 6000, 7000)];

  it("drops subtitles inside, shortens crossing ones, moves later ones up", () => {
    const r = removeTime(wholeVideo(D), cues, 2000, 4000);
    expect(r.parts).toEqual([
      { start_ms: 0, end_ms: 2000 },
      { start_ms: 4000, end_ms: D },
    ]);
    expect(r.removed).toEqual([]); // "c" crosses 4000, so it is shortened, not removed
    expect(r.cues).toEqual([cue("a", 0, 1000), cue("b", 1500, 2000), cue("c", 2000, 2200), cue("d", 4000, 5000)]);
    expect(r.shortened).toBe(2);
    expect(cutDuration(r.parts)).toBe(8000);
  });

  it("removes subtitles wholly inside and says which", () => {
    const r = removeTime(wholeVideo(D), cues, 2600, 4500);
    expect(r.removed.map((c) => c.id)).toEqual(["c"]);
    expect(r.cues.map((c) => c.id)).toEqual(["a", "b", "d"]);
    expect(r.cues.at(-1)).toEqual(cue("d", 4100, 5100));
    expect(previewCut(cues, 2600, 4500)).toEqual({ removed: [cues[2]], shortened: 0 });
  });

  it("works across parts that were cut before, using the cut timeline", () => {
    const first = removeTime(wholeVideo(D), [], 2000, 4000); // parts 0–2000, 4000–10000
    const second = removeTime(first.parts, [], 1000, 3000); // removes 1000–2000 and 4000–5000 of the original
    expect(second.parts).toEqual([
      { start_ms: 0, end_ms: 1000 },
      { start_ms: 5000, end_ms: D },
    ]);
  });

  it("never removes everything", () => {
    const r = removeTime(wholeVideo(D), cues, 0, D);
    expect(r.parts).toEqual(wholeVideo(D));
    expect(r.cues).toBe(cues);
  });

  it("drops leftover slivers shorter than 0.1 s", () => {
    const r = removeTime(wholeVideo(D), [], 50, 5000);
    expect(r.parts).toEqual([{ start_ms: 5000, end_ms: D }]);
  });
});

describe("trim", () => {
  it("keeps only the chosen stretch and moves subtitles to start at zero", () => {
    const r = trimTo(wholeVideo(D), [cue("a", 500, 1500), cue("b", 3000, 4000), cue("c", 9000, 9500)], 2000, 8000);
    expect(r.parts).toEqual([{ start_ms: 2000, end_ms: 8000 }]);
    expect(r.cues).toEqual([cue("b", 1000, 2000)]);
    expect(r.removed.map((c) => c.id).sort()).toEqual(["a", "c"]);
  });
});

describe("restore", () => {
  it("lists what was cut and puts a part back, moving later subtitles", () => {
    const cut = removeTime(wholeVideo(D), [cue("a", 500, 1500), cue("d", 6000, 7000)], 2000, 4000);
    expect(removedParts(cut.parts, D)).toEqual([{ start_ms: 2000, end_ms: 4000 }]);
    const back = restorePart(cut.parts, cut.cues, { start_ms: 2000, end_ms: 4000 });
    expect(mergeTouching(back.parts)).toEqual(wholeVideo(D));
    expect(back.cues).toEqual([cue("a", 500, 1500), cue("d", 6000, 7000)]);
  });
  it("restores a trimmed start", () => {
    const cut = trimTo(wholeVideo(D), [], 3000, D);
    const gaps = removedParts(cut.parts, D);
    expect(gaps).toEqual([{ start_ms: 0, end_ms: 3000 }]);
    expect(mergeTouching(restorePart(cut.parts, [], gaps[0]).parts)).toEqual(wholeVideo(D));
  });
});

describe("checking saved parts", () => {
  it("accepts valid parts and explains bad ones", () => {
    expect(partsProblem(wholeVideo(D), D)).toBeNull();
    expect(partsProblem([], D)).toMatch(/nothing/);
    expect(partsProblem([{ start_ms: 0, end_ms: 20_000 }], D)).toMatch(/outside/);
    expect(partsProblem([{ start_ms: 0, end_ms: 50 }], D)).toMatch(/too short/);
    expect(
      partsProblem(
        [
          { start_ms: 3000, end_ms: 5000 },
          { start_ms: 1000, end_ms: 2000 },
        ],
        D,
      ),
    ).toMatch(/order/);
    expect(partsProblem([{ start_ms: 0.5, end_ms: 2000 }], D)).toMatch(/whole/);
  });
});
