/**
 * Main-thread side of in-browser speech recognition: owns the Whisper worker, the model cache
 * and the audio preparation. Everything happens on this device; only the one-time model
 * download comes from the internet.
 */
import { ApiError } from "../api/http";
import { decodeToMono16k } from "./audioDecode";
import { planWindows, SAMPLE_RATE } from "./chunking";
import { fileUrl, MODEL_CACHE, MODEL_FILES, modelByName, SPEECH_MODELS, type SpeechModelInfo } from "./speechModels";
import type { SpeechSegment } from "./speechCues";
import type { WorkerMessage, WorkerRequest } from "./whisper.worker";

export interface Progress {
  fraction: number | null;
  message: string;
}

export interface EngineTranscript {
  language: string | null;
  durationMs: number;
  segments: SpeechSegment[];
}

export interface SpeechEngine {
  available(): { ok: boolean; detail: string | null };
  isInstalled(model: string): Promise<boolean>;
  sizeOnDisk(model: string): Promise<number>;
  deleteModel(model: string): Promise<boolean>;
  download(model: string, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<void>;
  transcribe(
    audio: Blob,
    options: { model: string; language: string | null },
    onProgress: (p: Progress) => void,
    signal: AbortSignal,
  ): Promise<EngineTranscript>;
}

const ORT_BASE = `${import.meta.env.BASE_URL}ort/`;

function info(model: string): SpeechModelInfo {
  const found = modelByName(model);
  if (!found) throw new ApiError("unknown_model", "That speech model is not offered.");
  return found;
}

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(MODEL_CACHE);
  } catch {
    return null;
  }
}

function minutesLeft(ms: number): string {
  if (ms < 60_000) return "less than a minute left";
  const m = Math.round(ms / 60_000);
  return `about ${String(m)} ${m === 1 ? "minute" : "minutes"} left`;
}

export class BrowserSpeechEngine implements SpeechEngine {
  private worker: Worker | null = null;
  private loadedRepo: string | null = null;

  available() {
    if (typeof WebAssembly !== "object" || typeof Worker === "undefined") {
      return { ok: false, detail: "This browser cannot run speech recognition. Use a recent Chrome or Safari." };
    }
    if (typeof caches === "undefined") {
      return {
        ok: false,
        detail: "This browser is not allowing downloads to be kept (private browsing?). Use a normal window.",
      };
    }
    return { ok: true, detail: null };
  }

  async isInstalled(model: string): Promise<boolean> {
    const cache = await openCache();
    if (!cache) return false;
    const { repo } = info(model);
    for (const file of MODEL_FILES) if (!(await cache.match(fileUrl(repo, file)))) return false;
    return true;
  }

  async sizeOnDisk(model: string): Promise<number> {
    const cache = await openCache();
    if (!cache) return 0;
    const { repo } = info(model);
    let total = 0;
    for (const file of MODEL_FILES) {
      const hit = await cache.match(fileUrl(repo, file));
      total += Number(hit?.headers.get("content-length") ?? 0);
    }
    return total;
  }

  async deleteModel(model: string): Promise<boolean> {
    const cache = await openCache();
    if (!cache) return false;
    const { repo } = info(model);
    if (this.loadedRepo === repo) this.reset();
    let removed = false;
    for (const file of MODEL_FILES) removed = (await cache.delete(fileUrl(repo, file))) || removed;
    // The speech runtime (about 12 MB) is shared by all models: drop it with the last one.
    const stillInstalled = await Promise.all(SPEECH_MODELS.map((m) => this.isInstalled(m.name)));
    if (!stillInstalled.some(Boolean)) {
      const runtime = new URL(ORT_BASE, location.href).href;
      for (const req of await cache.keys()) if (req.url.startsWith(runtime)) await cache.delete(req);
    }
    return removed;
  }

  private reset(): void {
    this.worker?.terminate();
    this.worker = null;
    this.loadedRepo = null;
  }

  private ensureWorker(): Worker {
    this.worker ??= new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    return this.worker;
  }

  /** Sends one request and resolves when `until` says the work is finished. */
  private request(
    message: WorkerRequest,
    signal: AbortSignal,
    onMessage: (m: WorkerMessage) => boolean,
    transfer: Transferable[] = [],
  ): Promise<void> {
    const worker = this.ensureWorker();
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener("message", handle);
        worker.removeEventListener("error", fail);
        signal.removeEventListener("abort", abort);
      };
      const handle = (event: MessageEvent<WorkerMessage>) => {
        const m = event.data;
        if (m.type === "error") {
          cleanup();
          reject(new ApiError("speech_failed", m.message));
          return;
        }
        if (onMessage(m)) {
          cleanup();
          resolve();
        }
      };
      const fail = () => {
        cleanup();
        this.reset();
        reject(new ApiError("speech_failed", "Speech recognition stopped unexpectedly."));
      };
      const abort = () => {
        cleanup();
        this.reset(); // stopping the worker is the only way to interrupt recognition
        reject(new DOMException("Cancelled", "AbortError"));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      worker.addEventListener("message", handle);
      worker.addEventListener("error", fail);
      signal.addEventListener("abort", abort);
      worker.postMessage(message, transfer);
    });
  }

  private async load(repo: string, signal: AbortSignal, onDownload?: (loaded: number, total: number) => void) {
    if (this.loadedRepo === repo) return;
    if (this.loadedRepo !== null) this.reset(); // one model in memory at a time
    const files = new Map<string, { loaded: number; total: number }>();
    await this.request({ type: "load", repo, ortBase: ORT_BASE }, signal, (m) => {
      if (m.type === "download") {
        files.set(m.file, { loaded: m.loaded, total: m.total });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        onDownload?.(loaded, total);
      }
      return m.type === "ready";
    });
    this.loadedRepo = repo;
  }

  async download(model: string, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<void> {
    const m = info(model);
    const expected = m.approx_size_mb * 1_000_000;
    onProgress({ fraction: null, message: `Downloading the ${m.label} model (about ${String(m.approx_size_mb)} MB)…` });
    try {
      await this.load(m.repo, signal, (loaded, total) => {
        const fraction = Math.min(0.99, loaded / Math.max(total, expected));
        onProgress({
          fraction,
          message: `Downloading the ${m.label} model: ${String(Math.round(loaded / 1_000_000))} of about ${String(m.approx_size_mb)} MB`,
        });
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ApiError(
        "download_failed",
        "The model could not be downloaded. Check the internet connection and that there is free space, then try again (models come from Hugging Face).",
      );
    }
  }

  async transcribe(
    audio: Blob,
    options: { model: string; language: string | null },
    onProgress: (p: Progress) => void,
    signal: AbortSignal,
  ): Promise<EngineTranscript> {
    const m = info(options.model);
    onProgress({ fraction: null, message: "Preparing the audio…" });
    const samples = await decodeToMono16k(audio, signal);
    const durationMs = Math.round((samples.length / SAMPLE_RATE) * 1000);
    const plan = planWindows(samples);
    const speech = plan.filter((w) => !w.silent);
    onProgress({ fraction: 0.02, message: "Loading the speech model…" });
    await this.load(m.repo, signal);
    const segments: SpeechSegment[] = [];
    let language: string | null = options.language;
    if (speech.length === 0) return { language, durationMs, segments };
    const totalSamples = speech.reduce((n, w) => n + (w.end - w.start), 0);
    const windows = speech.map((w) => ({
      offsetMs: Math.round((w.start / SAMPLE_RATE) * 1000),
      durationMs: Math.round(((w.end - w.start) / SAMPLE_RATE) * 1000),
      audio: samples.slice(w.start, w.end),
    }));
    const started = performance.now();
    let doneSamples = 0;
    onProgress({ fraction: 0.05, message: "Recognising speech…" });
    await this.request(
      { type: "transcribe", language: options.language, windows },
      signal,
      (msg) => {
        if (msg.type === "segments") {
          segments.push(...msg.segments);
          language = language ?? msg.language;
          const w = speech[msg.index];
          doneSamples += w.end - w.start;
          const done = doneSamples / totalSamples;
          const elapsed = performance.now() - started;
          onProgress({
            fraction: 0.05 + 0.95 * done,
            message: done < 1 ? `Recognising speech… ${minutesLeft((elapsed / done) * (1 - done))}` : "Finishing…",
          });
        }
        return msg.type === "done";
      },
      windows.map((w) => w.audio.buffer),
    );
    return { language, durationMs, segments };
  }
}
