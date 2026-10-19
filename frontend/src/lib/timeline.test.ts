import { describe, expect, it } from "vitest";
import type { ProjectCue } from "../api/projects";
import { activeCues, assignLanes, msToPx, pxToMs, snapMs, tickStepMs } from "./timeline";

const cue = (id: string, s: number, e: number): ProjectCue => ({ id, text: id, start_ms: s, end_ms: e });

describe("activeCues", () => {
  const cues = [cue("a", 0, 1000), cue("b", 1000, 2000), cue("c", 500, 1500), cue("bad", 3000, 3000)];
  it("start is inclusive and end is exclusive", () => {
    expect(activeCues(cues, 0).map((c) => c.id)).toEqual(["a"]);
    expect(activeCues(cues, 999).map((c) => c.id)).toEqual(["a", "c"]);
    expect(activeCues(cues, 1000).map((c) => c.id)).toEqual(["b", "c"]);
    expect(activeCues(cues, 2000)).toEqual([]);
  });
  it("shows overlapping subtitles together and never shows invalid ones", () => {
    expect(activeCues(cues, 750).map((c) => c.id)).toEqual(["a", "c"]);
    expect(activeCues(cues, 3000)).toEqual([]);
  });
});

describe("assignLanes", () => {
  it("puts overlapping subtitles on different lanes and reuses free lanes", () => {
    const lanes = assignLanes([cue("a", 0, 2000), cue("b", 1000, 3000), cue("c", 2000, 4000)]);
    expect(lanes).toEqual([0, 1, 0]);
  });
});

describe("scale helpers", () => {
  it("round-trips pixels and milliseconds", () => {
    expect(msToPx(2500, 40)).toBe(100);
    expect(pxToMs(100, 40)).toBe(2500);
  });
  it("snaps to 10 ms", () => {
    expect(snapMs(1234)).toBe(1230);
    expect(snapMs(1236)).toBe(1240);
  });
  it("picks wider tick steps when zoomed out", () => {
    expect(tickStepMs(200)).toBeLessThan(tickStepMs(10));
    expect(tickStepMs(10)).toBe(10_000); // 10 px/s -> 64 px needs >= 6.4 s -> 10 s
  });
});
