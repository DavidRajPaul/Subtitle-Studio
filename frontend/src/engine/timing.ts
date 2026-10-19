/**
 * Timing engine and interval validation — the browser engine. Pure, deterministic, integer
 * milliseconds. Ported from the Python engine and tested against its exported results.
 *
 * - equal:    same duration for every cue; contiguous; fills the video.
 * - readable: duration from text length (clamped to min/max) with a gap; the rest stays blank.
 * - fit:      readable durations scaled to cover the video, never above the maximum.
 * - manual:   explicit start/duration; validated, never adjusted.
 * Validation only reports problems; it never moves, trims or deletes cues.
 */
import { ApiError, newId } from "../api/http";
import { MAX_SEGMENTS } from "./text";
import { floorDiv, formatG, pyLen, ratioNoDecimals, roundHalfEven, secondsOneDecimal } from "./py";

export type TimingMode = "equal" | "readable" | "fit" | "manual";

export interface TimingSettings {
  chars_per_second: number;
  min_duration_ms: number;
  max_duration_ms: number;
  gap_ms: number;
}

export const DEFAULT_SETTINGS: TimingSettings = {
  chars_per_second: 17,
  min_duration_ms: 1000,
  max_duration_ms: 7000,
  gap_ms: 100,
};

export interface EngineCue {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface TimingIssue {
  code: string;
  message: string;
  cue_number: number | null;
}

const cpsTenths = (s: TimingSettings) => Math.max(1, roundHalfEven(s.chars_per_second * 10));

/** Characters counted for reading speed: line breaks excluded, never zero. */
export const visibleChars = (text: string) => Math.max(1, pyLen(text.replace(/\n/g, "")));

export function fmtTime(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const total = Math.abs(ms);
  const p = (v: number, w: number) => String(v).padStart(w, "0");
  return (
    `${sign}${p(floorDiv(total, 3_600_000), 2)}:${p(floorDiv(total % 3_600_000, 60_000), 2)}:` +
    `${p(floorDiv(total % 60_000, 1000), 2)}.${p(total % 1000, 3)}`
  );
}

const secs = (ms: number) => `${secondsOneDecimal(ms)} s`;

export function validateCues(
  cues: { text: string; start_ms: number; end_ms: number }[],
  videoDurationMs: number,
  s: TimingSettings,
): TimingIssue[] {
  const issues: TimingIssue[] = [];
  const valid: number[] = [];
  cues.forEach((cue, i) => {
    const n = i + 1;
    if (cue.start_ms < 0) {
      issues.push({ code: "invalid_interval", message: `Subtitle ${String(n)} starts before the video begins.`, cue_number: n });
      return;
    }
    if (cue.end_ms <= cue.start_ms) {
      issues.push({ code: "invalid_interval", message: `Subtitle ${String(n)} ends at or before its start time.`, cue_number: n });
      return;
    }
    valid.push(i);
    if (cue.end_ms > videoDurationMs) {
      issues.push({
        code: "out_of_range",
        message:
          `Subtitle ${String(n)} ends at ${fmtTime(cue.end_ms)}, after the end of the ` +
          `video (${fmtTime(videoDurationMs)}).`,
        cue_number: n,
      });
    }
    const duration = cue.end_ms - cue.start_ms;
    const chars = visibleChars(cue.text);
    if (chars * 10_000 > cpsTenths(s) * duration) {
      issues.push({
        code: "too_fast",
        message:
          `Subtitle ${String(n)} may be hard to read: about ${ratioNoDecimals(chars * 1000, duration)} ` +
          `characters per second (comfortable limit ${formatG(s.chars_per_second)}).`,
        cue_number: n,
      });
    }
    if (duration < s.min_duration_ms) {
      issues.push({
        code: "too_short",
        message:
          `Subtitle ${String(n)} is shown for ${secs(duration)}, shorter than the ` +
          `${secs(s.min_duration_ms)} minimum.`,
        cue_number: n,
      });
    } else if (duration > s.max_duration_ms) {
      issues.push({
        code: "too_long",
        message:
          `Subtitle ${String(n)} is shown for ${secs(duration)}, longer than the ` +
          `${secs(s.max_duration_ms)} maximum.`,
        cue_number: n,
      });
    }
  });
  // Overlaps: walk valid cues in start order, tracking the latest end seen so far.
  let latest: number | null = null;
  const order = [...valid].sort((a, b) => cues[a].start_ms - cues[b].start_ms || a - b);
  for (const i of order) {
    if (latest !== null && cues[i].start_ms < cues[latest].end_ms) {
      issues.push({
        code: "overlap",
        message:
          `Subtitle ${String(i + 1)} starts at ${fmtTime(cues[i].start_ms)}, before ` +
          `subtitle ${String(latest + 1)} ends at ${fmtTime(cues[latest].end_ms)}.`,
        cue_number: i + 1,
      });
    }
    if (latest === null || cues[i].end_ms > cues[latest].end_ms) latest = i;
  }
  return sortIssues(issues);
}

function sortIssues(issues: TimingIssue[]): TimingIssue[] {
  // Stable, like Python's sort by (cue_number or 0, code).
  return [...issues].sort((a, b) => {
    const d = (a.cue_number ?? 0) - (b.cue_number ?? 0);
    if (d !== 0) return d;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
}

function checkSettings(s: TimingSettings): void {
  if (s.chars_per_second <= 0) {
    throw new ApiError("invalid_settings", "Characters per second must be above zero.");
  }
  if (s.min_duration_ms < 1 || s.gap_ms < 0) {
    throw new ApiError("invalid_settings", "Minimum duration and gap cannot be negative.");
  }
  if (s.min_duration_ms > s.max_duration_ms) {
    throw new ApiError("invalid_settings", "The minimum duration cannot be longer than the maximum.");
  }
}

export function readableMs(text: string, s: TimingSettings): number {
  const needed = Math.ceil((visibleChars(text) * 10_000) / cpsTenths(s));
  return Math.min(Math.max(needed, s.min_duration_ms), s.max_duration_ms);
}

const cue = (text: string, start: number, end: number): EngineCue => ({
  id: newId(),
  text,
  start_ms: start,
  end_ms: end,
});

function sequential(texts: string[], durations: number[], gap: number): EngineCue[] {
  let t = 0;
  return texts.map((text, i) => {
    const c = cue(text, t, t + durations[i]);
    t += durations[i] + gap;
    return c;
  });
}

/** Proportional integer split of `total` with a per-cue cap (largest remainder, ties by index). */
export function allocate(weights: number[], total: number, cap: number): [number[], number] {
  const alloc = weights.map(() => 0);
  let free = weights.map((_, i) => i);
  let remaining = total;
  while (free.length > 0) {
    const wsum = free.reduce((acc, i) => acc + weights[i], 0);
    const over = new Set(free.filter((i) => remaining * weights[i] > cap * wsum));
    if (over.size === 0) break;
    for (const i of over) {
      alloc[i] = cap;
      remaining -= cap;
    }
    free = free.filter((i) => !over.has(i));
  }
  if (free.length === 0) return [alloc, remaining];
  const wsum = free.reduce((acc, i) => acc + weights[i], 0);
  const shares = free.map((i) => floorDiv(remaining * weights[i], wsum));
  const rems = free.map((i) => (remaining * weights[i]) % wsum);
  const extra = remaining - shares.reduce((a, b) => a + b, 0);
  const order = free.map((_, k) => k).sort((a, b) => rems[b] - rems[a] || a - b);
  for (const k of order.slice(0, extra)) shares[k] += 1;
  free.forEach((i, k) => {
    alloc[i] = shares[k];
  });
  return [alloc, 0];
}

export interface TimingResult {
  cues: EngineCue[];
  issues: TimingIssue[];
  seeded: boolean;
}

export function generateTiming(
  texts: string[],
  mode: TimingMode,
  videoDurationMs: number,
  s: TimingSettings = DEFAULT_SETTINGS,
  manual: { start_ms: number; duration_ms: number }[] | null = null,
): TimingResult {
  checkSettings(s);
  if (texts.length === 0) throw new ApiError("no_text", "There are no subtitles to time.");
  if (texts.length > MAX_SEGMENTS) {
    throw new ApiError("too_many_cues", `The limit is ${String(MAX_SEGMENTS)} subtitles.`);
  }
  if (videoDurationMs <= 0) throw new ApiError("no_duration", "The video length is unknown.");

  const n = texts.length;
  const extra: TimingIssue[] = [];
  let seeded = false;
  let cues: EngineCue[];

  if (mode === "equal") {
    const each = floorDiv(videoDurationMs, n);
    if (each < 1) {
      throw new ApiError("too_many_cues", "There are more subtitles than milliseconds in this video.");
    }
    cues = texts.map((t, i) => cue(t, i * each, (i + 1) * each));
  } else if (mode === "manual") {
    if (manual === null) {
      seeded = true;
      cues = sequential(texts, texts.map((t) => readableMs(t, s)), s.gap_ms);
    } else {
      if (manual.length !== n) {
        throw new ApiError(
          "manual_mismatch",
          `There are ${String(n)} subtitles but ${String(manual.length)} timings were supplied.`,
        );
      }
      cues = texts.map((t, i) => cue(t, manual[i].start_ms, manual[i].start_ms + manual[i].duration_ms));
    }
  } else {
    const ideal = texts.map((t) => readableMs(t, s));
    if (mode === "readable") {
      cues = sequential(texts, ideal, s.gap_ms);
      const lastEnd = cues[cues.length - 1].end_ms;
      if (lastEnd > videoDurationMs) {
        extra.push({
          code: "readable_exceeds_video",
          message:
            `Comfortable reading needs ${fmtTime(lastEnd)}, but the ` +
            `video is ${fmtTime(videoDurationMs)} long. Choose Fit to video ` +
            "(shows subtitles faster) or raise the characters-per-second setting.",
          cue_number: null,
        });
      }
    } else {
      const available = videoDurationMs - s.gap_ms * (n - 1);
      if (available < n) {
        throw new ApiError(
          "too_many_cues",
          "This video is too short for that many subtitles with the current gap.",
        );
      }
      const [alloc, leftover] = allocate(ideal, available, s.max_duration_ms);
      if (Math.min(...alloc) < 1) {
        throw new ApiError("too_many_cues", "This video is too short for that many subtitles.");
      }
      cues = sequential(texts, alloc, s.gap_ms);
      if (ideal.reduce((a, b) => a + b, 0) + s.gap_ms * (n - 1) > videoDurationMs) {
        extra.push({
          code: "compressed",
          message:
            "To cover the video, these subtitles are shown faster than the " +
            "comfortable reading speed. Shorten the text or use Readable duration.",
          cue_number: null,
        });
      }
      if (leftover > 0) {
        extra.push({
          code: "cannot_fill",
          message:
            `Subtitles reach the maximum length (${formatG(s.max_duration_ms / 1000)} s) ` +
            `before filling the video, so ${fmtTime(leftover)} stays blank at ` +
            "the end. Raise the maximum duration to fill it.",
          cue_number: null,
        });
      }
    }
  }
  return { cues, issues: [...extra, ...validateCues(cues, videoDurationMs, s)], seeded };
}
