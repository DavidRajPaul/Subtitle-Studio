/**
 * Cutting the video without touching the original file.
 *
 * A project keeps a list of the parts of the original video to keep ("kept parts"), in order,
 * as integer milliseconds of the original. The cut video is those parts played back to back.
 * Two parts that touch (one ends where the next starts) are a split with nothing removed.
 *
 * Subtitles always live on the cut timeline, so the preview, the SRT file and the exported video
 * all use the same times. Removing a part removes the subtitles inside it, shortens the ones that
 * cross its edges, and moves the later ones up; nothing else is changed.
 *
 * Every function here is pure and works in integer milliseconds.
 */

export interface Range {
  start_ms: number;
  end_ms: number;
}

export interface TimedCue {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

/** Parts shorter than this are not kept: they would be a flash of one or two frames. */
export const MIN_PART_MS = 100;

export const wholeVideo = (durationMs: number): Range[] => [{ start_ms: 0, end_ms: durationMs }];

export const partLength = (r: Range) => r.end_ms - r.start_ms;

/** Length of the cut video. */
export const cutDuration = (parts: Range[]) => parts.reduce((sum, r) => sum + partLength(r), 0);

/** True when nothing has been cut away (splits alone do not count). */
export function isUncut(parts: Range[], durationMs: number): boolean {
  if (parts.length === 0) return false;
  if (parts[0].start_ms !== 0 || parts[parts.length - 1].end_ms !== durationMs) return false;
  return parts.every((p, i) => i === 0 || parts[i - 1].end_ms === p.start_ms);
}

/** Where each kept part starts on the cut timeline. */
export function partStarts(parts: Range[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const p of parts) {
    starts.push(at);
    at += partLength(p);
  }
  return starts;
}

/** The kept part showing at a cut-timeline time (the last part at the very end). */
export function partAt(parts: Range[], cutMs: number): number {
  const starts = partStarts(parts);
  for (let i = parts.length - 1; i >= 0; i--) if (cutMs >= starts[i]) return i;
  return 0;
}

/** Cut-timeline time → time in the original video. */
export function toSource(parts: Range[], cutMs: number): number {
  if (parts.length === 0) return 0;
  const i = partAt(parts, Math.max(0, cutMs));
  const start = partStarts(parts)[i];
  return Math.min(parts[i].end_ms, parts[i].start_ms + Math.max(0, cutMs - start));
}

/** Time in the original video → cut-timeline time, or null if that moment was cut away. */
export function toCut(parts: Range[], sourceMs: number): number | null {
  const starts = partStarts(parts);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const last = i === parts.length - 1;
    if (sourceMs >= p.start_ms && (sourceMs < p.end_ms || (last && sourceMs === p.end_ms))) {
      return starts[i] + (sourceMs - p.start_ms);
    }
  }
  return null;
}

/** Splits the part under a cut-timeline time into two touching parts. Unchanged if too close to an edge. */
export function splitAt(parts: Range[], cutMs: number): Range[] {
  const i = partAt(parts, cutMs);
  const at = toSource(parts, cutMs);
  const p = parts[i];
  if (at - p.start_ms < MIN_PART_MS || p.end_ms - at < MIN_PART_MS) return parts;
  return [...parts.slice(0, i), { start_ms: p.start_ms, end_ms: at }, { start_ms: at, end_ms: p.end_ms }, ...parts.slice(i + 1)];
}

export interface CutResult {
  parts: Range[];
  cues: TimedCue[];
  /** Subtitles that were inside the removed time and are gone. */
  removed: TimedCue[];
  /** Subtitles that were shortened because they crossed an edge of the removed time. */
  shortened: number;
}

/** What removing [fromMs, toMs) of the cut timeline would do, without doing it. */
export function previewCut(cues: TimedCue[], fromMs: number, toMs: number): { removed: TimedCue[]; shortened: number } {
  const removed = cues.filter((c) => c.start_ms >= fromMs && c.end_ms <= toMs);
  const shortened = cues.filter((c) => !removed.includes(c) && c.start_ms < toMs && c.end_ms > fromMs).length;
  return { removed, shortened };
}

/**
 * Removes [fromMs, toMs) of the cut timeline. Kept parts are trimmed or dropped; subtitles inside
 * are removed, ones crossing an edge are shortened, later ones move up by the removed length.
 * Refuses to remove everything (at least MIN_PART_MS must remain).
 */
export function removeTime(parts: Range[], cues: TimedCue[], fromMs: number, toMs: number): CutResult {
  const total = cutDuration(parts);
  const from = Math.max(0, Math.min(fromMs, total));
  const to = Math.max(from, Math.min(toMs, total));
  if (to - from <= 0 || total - (to - from) < MIN_PART_MS) return { parts, cues, removed: [], shortened: 0 };

  const starts = partStarts(parts);
  const next: Range[] = [];
  parts.forEach((p, i) => {
    const a = starts[i];
    const b = a + partLength(p);
    // Keep the bits of this part before `from` and after `to` (in cut-timeline terms).
    if (a < from) next.push({ start_ms: p.start_ms, end_ms: p.start_ms + (Math.min(b, from) - a) });
    if (b > to) next.push({ start_ms: p.start_ms + (Math.max(a, to) - a), end_ms: p.end_ms });
  });
  const kept = next.filter((p) => partLength(p) >= MIN_PART_MS);

  const len = to - from;
  const { removed, shortened } = previewCut(cues, from, to);
  const out: TimedCue[] = [];
  for (const c of cues) {
    if (removed.includes(c)) continue;
    if (c.end_ms <= from) out.push(c);
    else if (c.start_ms >= to) out.push({ ...c, start_ms: c.start_ms - len, end_ms: c.end_ms - len });
    else {
      // Crosses the removed time: keep the parts of it that remain, joined.
      const start = c.start_ms < from ? c.start_ms : from;
      const end = c.end_ms > to ? c.end_ms - len : from;
      if (end > start) out.push({ ...c, start_ms: start, end_ms: end });
    }
  }
  return { parts: kept, cues: out, removed, shortened };
}

/** Keeps only [startMs, endMs) of the cut timeline (trim both ends). */
export function trimTo(parts: Range[], cues: TimedCue[], startMs: number, endMs: number): CutResult {
  const total = cutDuration(parts);
  const afterEnd = removeTime(parts, cues, Math.max(startMs, endMs), total);
  const both = removeTime(afterEnd.parts, afterEnd.cues, 0, Math.max(0, Math.min(startMs, endMs)));
  return {
    parts: both.parts,
    cues: both.cues,
    removed: [...both.removed, ...afterEnd.removed].sort((x, y) => x.start_ms - y.start_ms),
    shortened: afterEnd.shortened + both.shortened,
  };
}

/** The parts of the original that are currently cut away, in order. */
export function removedParts(parts: Range[], durationMs: number): Range[] {
  const sorted = [...parts].sort((a, b) => a.start_ms - b.start_ms);
  const gaps: Range[] = [];
  let at = 0;
  for (const p of sorted) {
    if (p.start_ms > at) gaps.push({ start_ms: at, end_ms: p.start_ms });
    at = Math.max(at, p.end_ms);
  }
  if (durationMs > at) gaps.push({ start_ms: at, end_ms: durationMs });
  return gaps.filter((g) => partLength(g) > 0);
}

/**
 * Puts a removed part of the original back where it belongs. Later subtitles move later by its
 * length; a subtitle crossing the point where it returns gets longer. Subtitles that were removed
 * with it do not come back (the person was told when cutting).
 */
export function restorePart(parts: Range[], cues: TimedCue[], gap: Range): { parts: Range[]; cues: TimedCue[] } {
  // Only parts in original order can be restored in place; this app never reorders parts.
  const insertAt = parts.findIndex((p) => p.start_ms >= gap.end_ms);
  const index = insertAt === -1 ? parts.length : insertAt;
  const next = [...parts.slice(0, index), { ...gap }, ...parts.slice(index)];
  const at = partStarts(next)[index];
  const len = partLength(gap);
  const moved = cues.map((c) => {
    if (c.start_ms >= at) return { ...c, start_ms: c.start_ms + len, end_ms: c.end_ms + len };
    if (c.end_ms > at) return { ...c, end_ms: c.end_ms + len };
    return c;
  });
  return { parts: next, cues: moved };
}

/** Joins touching parts back together (undoes splits that no longer separate anything). */
export function mergeTouching(parts: Range[]): Range[] {
  const out: Range[] = [];
  for (const p of parts) {
    const last = out.at(-1);
    if (last && last.end_ms === p.start_ms) out[out.length - 1] = { start_ms: last.start_ms, end_ms: p.end_ms };
    else out.push({ ...p });
  }
  return out;
}

/** null when the list is a valid set of kept parts for a video of this length, else why not. */
export function partsProblem(parts: Range[], durationMs: number): string | null {
  if (parts.length === 0) return "nothing is kept";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!Number.isInteger(p.start_ms) || !Number.isInteger(p.end_ms)) return "times must be whole milliseconds";
    if (p.start_ms < 0 || p.end_ms > durationMs) return "a part is outside the video";
    if (p.end_ms - p.start_ms < MIN_PART_MS) return "a part is too short";
    if (i > 0 && p.start_ms < parts[i - 1].end_ms) return "parts overlap or are out of order";
  }
  return null;
}

/** The kept parts of a project (the whole video when nothing was cut). */
export const keptParts = (project: { parts?: Range[]; media: { duration_ms: number } }): Range[] =>
  project.parts ?? wholeVideo(project.media.duration_ms);

/** Length of a project's cut video: the length every subtitle and timing check works against. */
export const cutLength = (project: { parts?: Range[]; media: { duration_ms: number } }): number =>
  cutDuration(keptParts(project));

/**
 * Where playback should be at a time in the original: inside a kept part → that moment;
 * in a cut-away gap → the start of the next kept part; past the last part → null (the end).
 */
export function nextPlayable(parts: Range[], sourceMs: number): { sourceMs: number; cutMs: number } | null {
  const starts = partStarts(parts);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (sourceMs < p.end_ms) {
      const at = Math.max(sourceMs, p.start_ms);
      return { sourceMs: at, cutMs: starts[i] + (at - p.start_ms) };
    }
  }
  return null;
}
