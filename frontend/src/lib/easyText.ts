/** Turning typed or pasted words into timed subtitles for Easy mode. Pure apart from ids. */
import { ApiError } from "../api/http";
import { segmentText, splitSentences, MAX_SEGMENTS } from "../engine/text";
import { DEFAULT_SETTINGS, generateTiming, type EngineCue } from "../engine/timing";

/** One subtitle per line; a single pasted paragraph is split into sentences instead. */
export function segmentsFromTyped(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = segmentText(normalized, "line");
  if (lines.length === 1) {
    const sentences = splitSentences(lines[0]);
    if (sentences.length > 1) return sentences;
  }
  if (lines.length > MAX_SEGMENTS) throw new ApiError("too_many_segments", "That is too much text for one video.");
  return lines;
}

/**
 * Spreads the subtitles across the whole video (Fit to video). If the video is too short for
 * that many, falls back to comfortable reading speed and says so through the warnings.
 */
export function timeSegments(segments: string[], videoMs: number): { cues: EngineCue[]; mode: "fit" | "readable" } {
  try {
    return { cues: generateTiming(segments, "fit", videoMs, DEFAULT_SETTINGS).cues, mode: "fit" };
  } catch (error) {
    if (error instanceof ApiError && error.code === "too_many_cues") {
      return { cues: generateTiming(segments, "readable", videoMs, DEFAULT_SETTINGS).cues, mode: "readable" };
    }
    throw error;
  }
}
