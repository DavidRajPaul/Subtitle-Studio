/**
 * Turns recognised speech segments into subtitle cues. Ported from the Python engine: long
 * segments are split at word boundaries when word times are known; otherwise they are kept
 * whole and the editor's warnings flag anything hard to read. Times are kept as recognised.
 */
import { newId } from "../api/http";
import { pyLen, strip } from "./py";

export interface WordTiming {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface SpeechSegment {
  start_ms: number;
  end_ms: number;
  text: string;
  words?: WordTiming[];
}

export interface SpeechCue {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

const SENTENCE_END = [".", "!", "?", "…", "。", "！", "？", "।", "॥"];
const join = (words: WordTiming[]) => strip(words.map((w) => w.text).join(""));

function flush(chunk: WordTiming[], cues: SpeechCue[]): void {
  const text = join(chunk);
  if (text) cues.push({ id: newId(), text, start_ms: chunk[0].start_ms, end_ms: chunk[chunk.length - 1].end_ms });
  chunk.length = 0;
}

export function segmentsToCues(segments: SpeechSegment[], maxChars = 84, maxMs = 7000): SpeechCue[] {
  const cues: SpeechCue[] = [];
  for (const seg of segments) {
    const text = strip(seg.text);
    if (!text) continue;
    const fits = pyLen(text) <= maxChars && seg.end_ms - seg.start_ms <= maxMs;
    if (fits || !seg.words || seg.words.length === 0) {
      cues.push({ id: newId(), text, start_ms: seg.start_ms, end_ms: seg.end_ms });
      continue;
    }
    const chunk: WordTiming[] = [];
    for (const word of seg.words) {
      if (
        chunk.length > 0 &&
        (pyLen(join([...chunk, word])) > maxChars || word.end_ms - chunk[0].start_ms > maxMs)
      ) {
        flush(chunk, cues);
      }
      chunk.push(word);
      const joined = join(chunk);
      if (SENTENCE_END.some((p) => joined.endsWith(p)) && pyLen(joined) >= Math.floor(maxChars / 2)) {
        flush(chunk, cues);
      }
    }
    flush(chunk, cues);
  }
  return cues;
}
