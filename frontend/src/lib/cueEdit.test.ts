import { describe, expect, it } from "vitest";
import type { ProjectCue } from "../api/projects";
import {
  addCue,
  applyRegeneratedTiming,
  removeCue,
  resizeStart,
  setDuration,
  setDurationForRange,
  setEnd,
  setStart,
  setText,
} from "./cueEdit";

const cue = (id: string, start_ms: number, end_ms: number): ProjectCue => ({
  id,
  text: id,
  start_ms,
  end_ms,
});
const base = (): ProjectCue[] => [cue("a", 0, 2000), cue("b", 2500, 4000), cue("c", 5000, 6000)];
const spans = (cues: ProjectCue[]) => cues.map((c) => [c.start_ms, c.end_ms]);
const must = (r: ReturnType<typeof setStart>) => {
  if (!r.ok) throw new Error(r.error);
  return r.cues;
};

describe("setStart (move)", () => {
  it("keeps the duration and, when independent, moves nothing else", () => {
    const out = must(setStart(base(), "b", 5000, false));
    expect(spans(out)).toEqual([[0, 2000], [5000, 6500], [5000, 6000]]);
  });
  it("sequential also moves the later subtitles by the same amount", () => {
    const out = must(setStart(base(), "b", 3000, true));
    expect(spans(out)).toEqual([[0, 2000], [3000, 4500], [5500, 6500]]);
  });
  it("never moves earlier subtitles", () => {
    expect(spans(must(setStart(base(), "c", 9000, true)))[0]).toEqual([0, 2000]);
  });
  it("rejects a negative start and explains", () => {
    const r = setStart(base(), "a", -1, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/before the beginning/);
  });
  it("rejects a sequential move that would push later subtitles below zero", () => {
    const r = setStart(base(), "b", 0, true); // delta -2500 pushes none below 0 (c: 2500)
    expect(r.ok).toBe(true);
    const r2 = setStart([cue("a", 5000, 6000), cue("b", 100, 900)], "a", 0, true);
    expect(r2.ok).toBe(false);
  });
  it("does not mutate its input", () => {
    const input = base();
    setStart(input, "a", 100, true);
    expect(spans(input)).toEqual(spans(base()));
  });
});

describe("setEnd and setDuration", () => {
  it("setEnd keeps the start and recalculates the duration", () => {
    expect(spans(must(setEnd(base(), "a", 2400, false)))[0]).toEqual([0, 2400]);
  });
  it("setDuration keeps the start and moves the end", () => {
    expect(spans(must(setDuration(base(), "b", 3000, false)))[1]).toEqual([2500, 5500]);
  });
  it("sequential duration change shifts later subtitles by the change", () => {
    const out = must(setDuration(base(), "a", 3000, true)); // +1000
    expect(spans(out)).toEqual([[0, 3000], [3500, 5000], [6000, 7000]]);
  });
  it("shortening in sequential mode pulls later subtitles earlier", () => {
    const out = must(setDuration(base(), "a", 1000, true)); // -1000
    expect(spans(out)).toEqual([[0, 1000], [1500, 3000], [4000, 5000]]);
  });
  it("rejects an end at or before the start and a zero duration", () => {
    expect(setEnd(base(), "b", 2500, false).ok).toBe(false);
    expect(setEnd(base(), "b", 100, false).ok).toBe(false);
    expect(setDuration(base(), "b", 0, false).ok).toBe(false);
  });
  it("rejects fractional milliseconds", () => {
    expect(setDuration(base(), "b", 10.5, false).ok).toBe(false);
  });
  it("reports a missing subtitle", () => {
    expect(setStart(base(), "zzz", 0, false).ok).toBe(false);
  });
});

describe("resizeStart", () => {
  it("moves only the start edge", () => {
    expect(spans(must(resizeStart(base(), "b", 3000)))[1]).toEqual([3000, 4000]);
  });
  it("rejects a start at or after the end", () => {
    expect(resizeStart(base(), "b", 4000).ok).toBe(false);
  });
});

describe("setDurationForRange", () => {
  it("independent: every selected subtitle gets the duration, starts unchanged (may overlap)", () => {
    const out = must(setDurationForRange(base(), 0, 2, 3000, false));
    expect(spans(out)).toEqual([[0, 3000], [2500, 5500], [5000, 8000]]);
  });
  it("sequential: later subtitles shift so nothing newly overlaps", () => {
    const out = must(setDurationForRange(base(), 0, 2, 3000, true));
    expect(spans(out)).toEqual([[0, 3000], [3500, 6500], [7500, 10500]]); // original gaps kept
  });
  it("a sub-range leaves the others alone when independent", () => {
    const out = must(setDurationForRange(base(), 1, 1, 500, false));
    expect(spans(out)).toEqual([[0, 2000], [2500, 3000], [5000, 6000]]);
  });
  it("is all or nothing on error and validates the range", () => {
    expect(setDurationForRange(base(), 0, 2, 0, false).ok).toBe(false);
    expect(setDurationForRange(base(), 2, 1, 1000, false).ok).toBe(false);
    expect(setDurationForRange(base(), 0, 9, 1000, false).ok).toBe(false);
  });
});

describe("add, remove, text, regenerate", () => {
  it("adds in time order and removes by id", () => {
    const added = addCue(base(), cue("n", 2200, 2400));
    expect(added.map((c) => c.id)).toEqual(["a", "n", "b", "c"]);
    expect(addCue(base(), cue("z", 9000, 9500)).map((c) => c.id)).toEqual(["a", "b", "c", "z"]);
    expect(removeCue(added, "n").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
  it("keeps line breaks and Unicode exactly", () => {
    const out = setText(base(), "a", "வணக்கம்\nஉலகம் 🎬");
    expect(out[0].text).toBe("வணக்கம்\nஉலகம் 🎬");
  });
  it("regenerated timing keeps ids and text", () => {
    const out = applyRegeneratedTiming(base(), [
      { start_ms: 0, end_ms: 100 },
      { start_ms: 100, end_ms: 200 },
      { start_ms: 200, end_ms: 300 },
    ]);
    expect(out.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(out.map((c) => c.text)).toEqual(["a", "b", "c"]);
    expect(spans(out)[2]).toEqual([200, 300]);
  });
});
