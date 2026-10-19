/**
 * Pure text layout for subtitles: line wrapping and per-word timing. Shared by the preview and
 * the export renderer so both break lines and time words identically.
 */

export type Measure = (text: string) => number;

/** User-perceived characters, so Tamil vowel signs and emoji are never split. */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return Array.from(text);
}

/** Splits a word wider than the line between characters; returns full lines and the rest. */
function breakWord(word: string, maxWidth: number, measure: Measure): { full: string[]; rest: string } {
  const full: string[] = [];
  let part = "";
  for (const g of graphemes(word)) {
    if (part && measure(part + g) > maxWidth) {
      full.push(part);
      part = g;
    } else part += g;
  }
  return { full, rest: part };
}

/** Wraps at spaces; a word wider than the line (or text without spaces) breaks between characters. */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word) <= maxWidth) {
        line = word;
      } else {
        const { full, rest } = breakWord(word, maxWidth, measure);
        lines.push(...full);
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface WordTime {
  word: string;
  start: number;
  end: number;
}

/**
 * Spreads a subtitle's words across its time in proportion to their length. Recognised speech
 * has no per-word times here, so this is an estimate used for word-by-word captions.
 */
export function wordTimes(text: string, startMs: number, endMs: number): WordTime[] {
  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => graphemes(w).length + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0, endMs - startMs);
  let t = startMs;
  return words.map((word, i) => {
    const start = t;
    t += (span * weights[i]) / total;
    return { word, start, end: i === words.length - 1 ? endMs : t };
  });
}
