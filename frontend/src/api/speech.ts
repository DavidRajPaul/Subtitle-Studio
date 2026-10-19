import { send } from "./http";

export interface SpeechModel {
  name: string;
  label: string;
  approx_size_mb: number;
  description: string;
  installed: boolean;
  size_on_disk_bytes: number;
  download_job_id: string | null;
}

export interface SpeechLanguage {
  code: string;
  name: string;
}

export interface SpeechInfo {
  engine: { available: boolean; version: string | null; detail: string | null };
  cache_dir: string;
  default_model: string;
  models: SpeechModel[];
  languages: SpeechLanguage[];
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Job<R> {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number | null;
  message: string;
  result: R | null;
  error: { code: string; message: string } | null;
}

export interface TranscribedCue {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface TranscriptionResult {
  language: string | null;
  language_name: string | null;
  language_probability: number | null;
  audio_duration_ms: number;
  used_mp3: boolean;
  model: string;
  cues: TranscribedCue[];
}

export interface ImportedAudio {
  id: string;
  filename: string;
  size_bytes: number;
  metadata: { duration_ms: number; codec: string | null };
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getSpeechInfo = (signal?: AbortSignal) =>
  send<SpeechInfo>("/api/speech/models", { signal });

export async function downloadModel(name: string): Promise<string> {
  const body = await send<{ job_id: string }>(
    `/api/speech/models/${encodeURIComponent(name)}/download`,
    { method: "POST" },
  );
  return body.job_id;
}

export async function deleteModel(name: string): Promise<void> {
  await send(`/api/speech/models/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export interface TranscribeRequest {
  media_id: string;
  audio_id: string | null;
  language: string; // "auto" or a code
  model: string;
  max_duration_ms?: number;
}

/** Starts local transcription on the backend; returns the job to follow. */
export async function startTranscription(request: TranscribeRequest): Promise<string> {
  const body = await send<{ job_id: string }>("/api/speech/transcribe", json(request));
  return body.job_id;
}

export const getJob = <R>(id: string, signal?: AbortSignal) =>
  send<Job<R>>(`/api/jobs/${encodeURIComponent(id)}`, { signal });

export const cancelJob = <R>(id: string) =>
  send<Job<R>>(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });

export function importAudio(file: File, signal?: AbortSignal): Promise<ImportedAudio> {
  const form = new FormData();
  form.append("file", file, file.name);
  return send<ImportedAudio>("/api/audio", { method: "POST", body: form, signal });
}

export async function removeAudio(id: string): Promise<void> {
  try {
    await send(`/api/audio/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // Best effort: the copy is app-owned and cleaned up later.
  }
}

export function validateMp3File(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".mp3")) return "Choose an audio file ending in .mp3.";
  if (file.size === 0) return "This file is empty. Choose a different MP3.";
  if (file.size > 500 * 1024 * 1024) return "This MP3 is larger than 500 MB. Choose a shorter file.";
  return null;
}

export const isFinished = (status: JobStatus) =>
  status === "succeeded" || status === "failed" || status === "cancelled";
