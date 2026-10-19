/**
 * Speech recognition in the browser, presented as background "jobs" with progress and cancel
 * (the screens poll getJob). Audio never leaves the device; only the one-time model download
 * uses the internet.
 */
import { ApiError, newId } from "./http";
import { pendingMedia } from "./media";
import { readAudioDuration } from "../engine/audioDecode";
import { getOne, MEDIA, type MediaRecord } from "../engine/db";
import { segmentsToCues } from "../engine/speechCues";
import { BrowserSpeechEngine, type Progress, type SpeechEngine } from "../engine/speechEngine";
import { DEFAULT_SPEECH_MODEL, LANGUAGES, modelByName, SPEECH_MODELS } from "../engine/speechModels";

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

export interface TranscribeRequest {
  media_id: string;
  audio_id: string | null;
  language: string; // "auto" or a code
  model: string;
  max_duration_ms?: number;
}

// ---- Engine (replaceable in tests) --------------------------------------------------------

let engine: SpeechEngine | null = null;
const getEngine = (): SpeechEngine => (engine ??= new BrowserSpeechEngine());
export function setSpeechEngineForTests(fake: SpeechEngine | null): void {
  engine = fake;
  jobs.clear();
  downloads.clear();
  queue = Promise.resolve();
}

// ---- Jobs: one at a time, in order ---------------------------------------------------------

interface Running {
  job: Job<unknown>;
  controller: AbortController;
}

const jobs = new Map<string, Running>();
const downloads = new Map<string, string>(); // model name -> job id
let queue: Promise<unknown> = Promise.resolve();

function submit<R>(kind: string, work: (report: (p: Progress) => void, signal: AbortSignal) => Promise<R>): string {
  const job: Job<R> = {
    id: newId(),
    kind,
    status: "queued",
    progress: null,
    message: "Waiting to start…",
    result: null,
    error: null,
  };
  const controller = new AbortController();
  jobs.set(job.id, { job, controller });
  const cancelled = () => controller.signal.aborted;
  const run = async () => {
    if (cancelled()) return;
    job.status = "running";
    job.message = "Starting…";
    try {
      const result = await work((p) => {
        if (job.status !== "running") return;
        job.progress = p.fraction === null ? null : Math.min(1, Math.max(0, p.fraction));
        job.message = p.message;
      }, controller.signal);
      if (cancelled()) return;
      job.status = "succeeded";
      job.progress = 1;
      job.message = "Done.";
      job.result = result;
    } catch (error) {
      if (cancelled()) return;
      job.status = "failed";
      job.error =
        error instanceof ApiError
          ? { code: error.code, message: error.message }
          : {
              code: "unexpected",
              message: "Something went wrong while processing. Try again; if it keeps happening, try a shorter clip.",
            };
      job.message = job.error.message;
    }
  };
  queue = queue.then(run, run);
  return job.id;
}

export function getJob<R>(id: string, signal?: AbortSignal): Promise<Job<R>> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  const running = jobs.get(id);
  if (!running) {
    return Promise.reject(
      new ApiError("not_found", "This task is no longer known, probably because the page was reloaded. Start it again."),
    );
  }
  return Promise.resolve({ ...running.job } as Job<R>);
}

export function cancelJob<R>(id: string): Promise<Job<R>> {
  const running = jobs.get(id);
  if (!running) return Promise.reject(new ApiError("not_found", "This task is no longer known."));
  const { job, controller } = running;
  if (job.status === "queued" || job.status === "running") {
    controller.abort();
    job.status = "cancelled";
    job.message = "Cancelled. Nothing was changed.";
  }
  return Promise.resolve({ ...job } as Job<R>);
}

export const isFinished = (status: JobStatus) =>
  status === "succeeded" || status === "failed" || status === "cancelled";

const activeDownload = (name: string): string | null => {
  const id = downloads.get(name);
  const job = id ? jobs.get(id)?.job : undefined;
  return job && (job.status === "queued" || job.status === "running") ? job.id : null;
};

// ---- Models --------------------------------------------------------------------------------

export async function getSpeechInfo(signal?: AbortSignal): Promise<SpeechInfo> {
  signal?.throwIfAborted();
  const e = getEngine();
  const status = e.available();
  const models: SpeechModel[] = [];
  for (const m of SPEECH_MODELS) {
    const installed = status.ok ? await e.isInstalled(m.name) : false;
    models.push({
      name: m.name,
      label: m.label,
      approx_size_mb: m.approx_size_mb,
      description: m.description,
      installed,
      size_on_disk_bytes: installed ? await e.sizeOnDisk(m.name) : 0,
      download_job_id: activeDownload(m.name),
    });
  }
  return {
    engine: { available: status.ok, version: null, detail: status.detail },
    cache_dir: "this browser's storage on this device",
    default_model: DEFAULT_SPEECH_MODEL,
    models,
    languages: [...LANGUAGES],
  };
}

function askToPersist(): void {
  try {
    void navigator.storage.persist().catch(() => undefined);
  } catch {
    // Not offered by this browser.
  }
}

export async function downloadModel(name: string): Promise<string> {
  const info = modelByName(name);
  if (!info) throw new ApiError("unknown_model", "That speech model is not offered.");
  if (await getEngine().isInstalled(name)) throw new ApiError("already_installed", "This model is installed.");
  const running = activeDownload(name);
  if (running) return running;
  askToPersist();
  const id = submit("model_download", async (report, signal) => {
    await getEngine().download(name, report, signal);
    return { name };
  });
  downloads.set(name, id);
  return id;
}

export async function deleteModel(name: string): Promise<void> {
  if (!modelByName(name)) throw new ApiError("unknown_model", "That speech model is not offered.");
  if (activeDownload(name)) throw new ApiError("busy", "Wait for the download to finish first.");
  if (!(await getEngine().deleteModel(name))) throw new ApiError("not_found", "That model is not installed.");
}

// ---- Separate MP3 --------------------------------------------------------------------------

const pendingAudio = new Map<string, File>();

export function validateMp3File(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".mp3")) return "Choose an audio file ending in .mp3.";
  if (file.size === 0) return "This file is empty. Choose a different MP3.";
  if (file.size > 500 * 1024 * 1024) return "This MP3 is larger than 500 MB. Choose a shorter file.";
  return null;
}

export async function importAudio(file: File): Promise<ImportedAudio> {
  const problem = validateMp3File(file);
  if (problem) throw new ApiError("invalid_file", problem);
  const durationMs = await readAudioDuration(file);
  const id = newId();
  pendingAudio.set(id, file);
  return { id, filename: file.name, size_bytes: file.size, metadata: { duration_ms: durationMs, codec: "mp3" } };
}

export function removeAudio(id: string): Promise<void> {
  pendingAudio.delete(id);
  return Promise.resolve();
}

// ---- Transcription -------------------------------------------------------------------------

async function sourceFor(request: TranscribeRequest): Promise<Blob> {
  if (request.audio_id) {
    const mp3 = pendingAudio.get(request.audio_id);
    if (!mp3) throw new ApiError("not_found", "The MP3 is no longer selected. Choose it again.");
    return mp3;
  }
  const video = pendingMedia(request.media_id);
  if (video) return video;
  const stored = await getOne<MediaRecord>(MEDIA, request.media_id).catch(() => undefined);
  if (stored) return stored.blob;
  throw new ApiError("not_found", "The video is no longer selected. Choose it again.");
}

export async function startTranscription(request: TranscribeRequest): Promise<string> {
  const e = getEngine();
  const status = e.available();
  if (!status.ok) throw new ApiError("speech_unavailable", status.detail ?? "Speech recognition is not available.");
  const info = modelByName(request.model);
  if (!info) throw new ApiError("unknown_model", "That speech model is not offered.");
  const language = request.language === "auto" || request.language === "" ? null : request.language;
  if (language !== null && !LANGUAGES.some((l) => l.code === language)) {
    throw new ApiError("bad_language", "That language is not offered.");
  }
  if (!(await e.isInstalled(request.model))) {
    throw new ApiError(
      "model_missing",
      `The ${info.label} speech model is not installed yet. Download it once (needs the internet), then transcribe.`,
    );
  }
  const source = await sourceFor(request);
  return submit<TranscriptionResult>("transcription", async (report, signal) => {
    const transcript = await e.transcribe(source, { model: request.model, language }, report, signal);
    const cues = segmentsToCues(transcript.segments, 84, request.max_duration_ms ?? 7000);
    if (cues.length === 0) {
      throw new ApiError(
        "no_speech",
        "No speech was recognised. Check that the audio contains speech, or pick the language instead of auto-detect and try again.",
      );
    }
    const code = transcript.language;
    return {
      language: code,
      language_name: LANGUAGES.find((l) => l.code === code)?.name ?? code,
      language_probability: null,
      audio_duration_ms: transcript.durationMs,
      used_mp3: request.audio_id !== null,
      model: request.model,
      cues,
    };
  });
}
