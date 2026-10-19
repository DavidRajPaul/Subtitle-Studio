/** Text import and timing, computed in the browser by the engine (no server). */
import { ApiError } from "./http";
import { decodeText, MAX_TXT_BYTES, segmentText, type Segmentation } from "../engine/text";
import {
  generateTiming as engineTiming,
  type TimingIssue,
  type TimingMode,
  type TimingSettings,
} from "../engine/timing";

export { ApiError };
export type { Segmentation, TimingIssue, TimingMode, TimingSettings };

export interface ParsedText {
  filename: string;
  segmentation: Segmentation;
  count: number;
  segments: string[];
}

export interface Cue {
  id: string;
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface TimingSummary {
  cue_count: number;
  first_start_ms: number;
  last_end_ms: number;
  blank_end_ms: number;
  video_duration_ms: number;
  seeded: boolean;
}

export interface TimingResult {
  cues: Cue[];
  issues: TimingIssue[];
  summary: TimingSummary;
}

export interface GenerateRequest {
  segments: string[];
  mode: TimingMode;
  duration_ms: number;
  settings: TimingSettings;
}

export { MAX_TXT_BYTES };

/** Reads the TXT on this device. Nothing leaves the device. */
export async function parseText(
  file: File,
  segmentation: Segmentation,
  signal?: AbortSignal,
): Promise<ParsedText> {
  const problem = validateTxtFile(file);
  if (problem) throw new ApiError("invalid_file", problem);
  const raw = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const segments = segmentText(decodeText(raw), segmentation);
  return { filename: file.name, segmentation, count: segments.length, segments };
}

export function generateTiming(request: GenerateRequest, signal?: AbortSignal): Promise<TimingResult> {
  try {
    signal?.throwIfAborted();
    const result = engineTiming(request.segments, request.mode, request.duration_ms, request.settings);
    const cues = result.cues;
    const lastEnd = Math.max(...cues.map((c) => c.end_ms));
    return Promise.resolve({
      cues: cues.map((c, i) => ({ ...c, index: i + 1 })),
      issues: result.issues,
      summary: {
        cue_count: cues.length,
        first_start_ms: Math.min(...cues.map((c) => c.start_ms)),
        last_end_ms: lastEnd,
        blank_end_ms: request.duration_ms - lastEnd,
        video_duration_ms: request.duration_ms,
        seeded: result.seeded,
      },
    });
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Checks before reading anything. */
export function validateTxtFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".txt")) {
    return "Choose a plain text file ending in .txt.";
  }
  if (file.size === 0) return "This file is empty. Choose a different text file.";
  if (file.size > MAX_TXT_BYTES) {
    return "This text file is larger than 2 MB. Split it into smaller files.";
  }
  return null;
}
