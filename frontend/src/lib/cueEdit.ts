/**
 * Pure cue edits, integer milliseconds.
 *
 * Every function returns a new list or an explanation; nothing is ever repaired silently.
 * "Sequential" placement is an explicit user choice: later subtitles (those below the edited
 * one in the list) move by the same amount. In "Independent" placement nothing else moves.
 */
import type { ProjectCue } from "../api/projects";

export type EditResult = { ok: true; cues: ProjectCue[] } | { ok: false; error: string };

export const MIN_DURATION_MS = 1;

const fail = (error: string): EditResult => ({ ok: false, error });
const ok = (cues: ProjectCue[]): EditResult => ({ ok: true, cues });

function indexOf(cues: ProjectCue[], id: string): number {
  return cues.findIndex((c) => c.id === id);
}

function shiftAfter(cues: ProjectCue[], index: number, delta: number): EditResult {
  if (delta === 0) return ok(cues);
  const out = cues.map((c, j) =>
    j > index ? { ...c, start_ms: c.start_ms + delta, end_ms: c.end_ms + delta } : c,
  );
  if (out.some((c, j) => j > index && c.start_ms < 0)) {
    return fail(
      "Moving the later subtitles with this one would push one before the start of the video. " +
        "Use Independent placement or choose a later time.",
    );
  }
  return ok(out);
}

function replaceAt(cues: ProjectCue[], index: number, cue: ProjectCue): ProjectCue[] {
  return cues.map((c, j) => (j === index ? cue : c));
}

/** Move a subtitle: changing the start keeps its duration. */
export function setStart(
  cues: ProjectCue[],
  id: string,
  startMs: number,
  sequential: boolean,
): EditResult {
  const i = indexOf(cues, id);
  if (i < 0) return fail("That subtitle no longer exists.");
  if (!Number.isInteger(startMs)) return fail("Enter a time in whole milliseconds.");
  if (startMs < 0) return fail("A subtitle cannot start before the beginning of the video.");
  const c = cues[i];
  const duration = Math.max(MIN_DURATION_MS, c.end_ms - c.start_ms);
  const moved = { ...c, start_ms: startMs, end_ms: startMs + duration };
  const base = replaceAt(cues, i, moved);
  return sequential ? shiftAfter(base, i, startMs - c.start_ms) : ok(base);
}

/** Change the end: the start stays and the duration is recalculated. */
export function setEnd(
  cues: ProjectCue[],
  id: string,
  endMs: number,
  sequential: boolean,
): EditResult {
  const i = indexOf(cues, id);
  if (i < 0) return fail("That subtitle no longer exists.");
  if (!Number.isInteger(endMs)) return fail("Enter a time in whole milliseconds.");
  const c = cues[i];
  if (endMs <= c.start_ms) return fail("The end must be after the start.");
  const base = replaceAt(cues, i, { ...c, end_ms: endMs });
  return sequential ? shiftAfter(base, i, endMs - c.end_ms) : ok(base);
}

/** Change the duration: the start stays and the end moves. */
export function setDuration(
  cues: ProjectCue[],
  id: string,
  durationMs: number,
  sequential: boolean,
): EditResult {
  const i = indexOf(cues, id);
  if (i < 0) return fail("That subtitle no longer exists.");
  if (!Number.isInteger(durationMs)) return fail("Enter a duration in whole milliseconds.");
  if (durationMs < MIN_DURATION_MS) return fail("A subtitle must last longer than zero.");
  return setEnd(cues, id, cues[i].start_ms + durationMs, sequential);
}

/** Resize from the left edge: the end stays put (used by timeline handles). */
export function resizeStart(cues: ProjectCue[], id: string, startMs: number): EditResult {
  const i = indexOf(cues, id);
  if (i < 0) return fail("That subtitle no longer exists.");
  if (startMs < 0) return fail("A subtitle cannot start before the beginning of the video.");
  const c = cues[i];
  if (startMs >= c.end_ms) return fail("The start must be before the end.");
  return ok(replaceAt(cues, i, { ...c, start_ms: startMs }));
}

/** Apply one duration to cues fromIndex..toIndex (inclusive, 0-based). All or nothing. */
export function setDurationForRange(
  cues: ProjectCue[],
  fromIndex: number,
  toIndex: number,
  durationMs: number,
  sequential: boolean,
): EditResult {
  if (fromIndex < 0 || toIndex >= cues.length || fromIndex > toIndex) {
    return fail("Choose a valid range of subtitles.");
  }
  let current = cues;
  for (let i = fromIndex; i <= toIndex; i += 1) {
    const result = setDuration(current, cues[i].id, durationMs, sequential);
    if (!result.ok) return result;
    current = result.cues;
  }
  return ok(current);
}

export function setText(cues: ProjectCue[], id: string, text: string): ProjectCue[] {
  return cues.map((c) => (c.id === id ? { ...c, text } : c));
}

/** Insert in time order (before the first subtitle that starts later). */
export function addCue(cues: ProjectCue[], cue: ProjectCue): ProjectCue[] {
  const at = cues.findIndex((c) => c.start_ms > cue.start_ms);
  return at < 0 ? [...cues, cue] : [...cues.slice(0, at), cue, ...cues.slice(at)];
}

export function removeCue(cues: ProjectCue[], id: string): ProjectCue[] {
  return cues.filter((c) => c.id !== id);
}

/** Replace only start/end from regenerated timing, keeping ids and text. */
export function applyRegeneratedTiming(
  cues: ProjectCue[],
  timing: { start_ms: number; end_ms: number }[],
): ProjectCue[] {
  return cues.map((c, i) => ({ ...c, start_ms: timing[i].start_ms, end_ms: timing[i].end_ms }));
}
