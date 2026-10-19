export type Segmentation = "line" | "paragraph" | "sentence";
export type TimingMode = "equal" | "readable" | "fit" | "manual";

export interface TimingSettings {
  chars_per_second: number;
  min_duration_ms: number;
  max_duration_ms: number;
  gap_ms: number;
}

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

export interface TimingIssue {
  code: string;
  message: string;
  cue_number: number | null;
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

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  detail?: { code?: string; message?: string } | unknown[];
}

async function send<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(
      "backend_unreachable",
      "The local backend is not running. Start it, then try again.",
    );
  }
  if (!response.ok) {
    let body: ErrorBody = {};
    try {
      body = (await response.json()) as ErrorBody;
    } catch {
      // use the generic message below
    }
    const detail = body.detail;
    if (detail && !Array.isArray(detail) && detail.message) {
      throw new ApiError(detail.code ?? "request_failed", detail.message);
    }
    throw new ApiError("request_failed", "That request was not accepted. Check your settings.");
  }
  return (await response.json()) as T;
}

/** Sends the TXT file to the local backend (127.0.0.1). Nothing leaves the device. */
export function parseText(
  file: File,
  segmentation: Segmentation,
  signal?: AbortSignal,
): Promise<ParsedText> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("segmentation", segmentation);
  return send<ParsedText>("/api/text/parse", { method: "POST", body: form, signal });
}

export function generateTiming(
  request: GenerateRequest,
  signal?: AbortSignal,
): Promise<TimingResult> {
  return send<TimingResult>("/api/timing/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
}

export const MAX_TXT_BYTES = 2 * 1024 * 1024;

/** Client-side check before sending anything; the backend validates again. */
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
