import { describe, expect, it } from "vitest";
import { planWindows, SAMPLE_RATE, SILENCE_RMS } from "./chunking";

/** A tone (speech stand-in) with given silent spans, in seconds. */
function signal(seconds: number, silences: [number, number][] = []): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const quiet = silences.some(([a, b]) => t >= a && t < b);
    out[i] = quiet ? 0 : 0.3 * Math.sin(2 * Math.PI * 220 * t);
  }
  return out;
}

describe("planWindows", () => {
  it("keeps short audio as one window", () => {
    const w = planWindows(signal(12));
    expect(w).toEqual([{ start: 0, end: 12 * SAMPLE_RATE, silent: false }]);
  });

  it("covers everything contiguously with windows of at most 30 s", () => {
    const samples = signal(95);
    const w = planWindows(samples);
    expect(w[0].start).toBe(0);
    expect(w.at(-1)?.end).toBe(samples.length);
    for (let i = 1; i < w.length; i++) expect(w[i].start).toBe(w[i - 1].end);
    for (const x of w) expect(x.end - x.start).toBeLessThanOrEqual(30 * SAMPLE_RATE);
  });

  it("cuts in a pause near the 30 s limit instead of mid-word", () => {
    const w = planWindows(signal(50, [[27.2, 27.8]]));
    const cut = w[0].end / SAMPLE_RATE;
    expect(cut).toBeGreaterThanOrEqual(27.2);
    expect(cut).toBeLessThanOrEqual(27.8);
  });

  it("marks silent windows so they are not sent to the recogniser", () => {
    const w = planWindows(signal(70, [[25, 70]]));
    expect(w.map((x) => x.silent)).toEqual([false, true, true]);
    expect(SILENCE_RMS).toBeGreaterThan(0);
  });

  it("handles empty audio", () => {
    expect(planWindows(new Float32Array(0))).toEqual([]);
  });
});
