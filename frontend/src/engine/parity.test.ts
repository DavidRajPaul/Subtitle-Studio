import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/python-parity.json";
import { decodeText, segmentText, type Segmentation } from "./text";
import { generateTiming, validateCues, type TimingMode, type TimingSettings } from "./timing";
import { ApiError } from "../api/http";

// Results exported from the Python engine (backend/scripts/export_parity_fixtures.py).
interface Fx {
  decode: { name: string; bytes: number[]; ok: boolean; text?: string; code?: string }[];
  segment: { text: string; mode: string; ok: boolean; segments?: string[]; code?: string }[];
  timing: {
    texts: string[];
    mode: string;
    duration_ms: number;
    settings: [number, number, number, number];
    manual: [number, number][] | null;
    ok: boolean;
    cues?: [string, number, number][];
    issues?: [string, string, number | null][];
    seeded?: boolean;
    code?: string;
  }[];
  validate: {
    cues: [string, number, number][];
    duration_ms: number;
    settings: [number, number, number, number];
    issues: [string, string, number | null][];
  }[];
}
const fx = fixtures as unknown as Fx;

const settings = ([c, mn, mx, g]: [number, number, number, number]): TimingSettings => ({
  chars_per_second: c,
  min_duration_ms: mn,
  max_duration_ms: mx,
  gap_ms: g,
});

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
}

describe("browser engine matches the Python engine", () => {
  it.each(fx.decode.map((d) => [d.name, d] as const))("decodes %s", (_name, d) => {
    const raw = new Uint8Array(d.bytes);
    if (d.ok) expect(decodeText(raw)).toBe(d.text);
    else expect(codeOf(() => decodeText(raw))).toBe(d.code);
  });

  it(`segments ${String(fx.segment.length)} texts identically`, () => {
    for (const s of fx.segment) {
      if (s.ok) expect(segmentText(s.text, s.mode as Segmentation), `${s.mode}: ${s.text}`).toEqual(s.segments);
      else expect(codeOf(() => segmentText(s.text, s.mode as Segmentation))).toBe(s.code);
    }
  });

  it(`times ${String(fx.timing.length)} random cases identically (cues, warnings, messages)`, () => {
    for (const [k, t] of fx.timing.entries()) {
      const run = () =>
        generateTiming(
          t.texts,
          t.mode as TimingMode,
          t.duration_ms,
          settings(t.settings),
          t.manual ? t.manual.map(([start_ms, duration_ms]) => ({ start_ms, duration_ms })) : null,
        );
      if (!t.ok) {
        expect(codeOf(run), `case ${String(k)}`).toBe(t.code);
        continue;
      }
      const result = run();
      expect(result.cues.map((c) => [c.text, c.start_ms, c.end_ms]), `case ${String(k)}`).toEqual(t.cues);
      expect(result.issues.map((i) => [i.code, i.message, i.cue_number]), `case ${String(k)}`).toEqual(t.issues);
      expect(result.seeded).toBe(t.seeded);
    }
  });

  it(`validates ${String(fx.validate.length)} hand-edited sets identically`, () => {
    for (const [k, v] of fx.validate.entries()) {
      const cues = v.cues.map(([text, start_ms, end_ms]) => ({ text, start_ms, end_ms }));
      const issues = validateCues(cues, v.duration_ms, settings(v.settings));
      expect(issues.map((i) => [i.code, i.message, i.cue_number]), `case ${String(k)}`).toEqual(v.issues);
    }
  });
});
