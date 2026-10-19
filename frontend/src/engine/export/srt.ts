/** SubRip (.srt) subtitles: UTF-8 text, numbered cues, HH:MM:SS,mmm times, CRLF line breaks. */

export interface SrtCue {
  text: string;
  start_ms: number;
  end_ms: number;
}

export function srtTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const p = (v: number, w: number) => String(v).padStart(w, "0");
  return `${p(Math.floor(t / 3_600_000), 2)}:${p(Math.floor((t % 3_600_000) / 60_000), 2)}:${p(Math.floor((t % 60_000) / 1000), 2)},${p(t % 1000, 3)}`;
}

/**
 * Writes cues in time order. Empty subtitles and impossible times (ending at or before they
 * start, or starting before zero) are left out and counted, never silently changed.
 */
export function cuesToSrt(cues: SrtCue[]): { text: string; written: number; skipped: number } {
  const usable = cues
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.text.trim() !== "" && c.start_ms >= 0 && c.end_ms > c.start_ms)
    .sort((a, b) => a.c.start_ms - b.c.start_ms || a.i - b.i);
  const blocks = usable.map(({ c }, n) => {
    // Blank lines inside a subtitle would end it early in SRT, so they are removed.
    const body = c.text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() !== "")
      .join("\r\n");
    return `${String(n + 1)}\r\n${srtTime(c.start_ms)} --> ${srtTime(c.end_ms)}\r\n${body}\r\n`;
  });
  return { text: blocks.join("\r\n"), written: usable.length, skipped: cues.length - usable.length };
}
