import type { EngineTranscript, Progress, SpeechEngine } from "../engine/speechEngine";
import type { SpeechSegment } from "../engine/speechCues";

/** Stand-in for the Whisper engine: scripted, instant, and observable. */
export class FakeSpeechEngine implements SpeechEngine {
  installed = new Set<string>(["base"]);
  ok = true;
  calls: { model: string; language: string | null; size: number }[] = [];
  segments: SpeechSegment[] = [
    { start_ms: 0, end_ms: 1200, text: " வணக்கம்" },
    { start_ms: 1300, end_ms: 2500, text: " Hello world." },
  ];
  language: string | null = "ta";
  failDownload = false;
  /** When set, transcription waits until this is resolved (or the job is cancelled). */
  gate: Promise<void> | null = null;

  available() {
    return this.ok ? { ok: true, detail: null } : { ok: false, detail: "Not in this browser." };
  }
  isInstalled(model: string) {
    return Promise.resolve(this.installed.has(model));
  }
  sizeOnDisk(model: string) {
    return Promise.resolve(this.installed.has(model) ? 77_000_000 : 0);
  }
  deleteModel(model: string) {
    return Promise.resolve(this.installed.delete(model));
  }
  async download(model: string, onProgress: (p: Progress) => void, signal: AbortSignal) {
    onProgress({ fraction: 0.5, message: "Downloading the model: 40 of about 77 MB" });
    await Promise.resolve();
    signal.throwIfAborted();
    if (this.failDownload) {
      const { ApiError } = await import("../api/http");
      throw new ApiError("download_failed", "Check the internet connection.");
    }
    this.installed.add(model);
  }
  async transcribe(
    audio: Blob,
    options: { model: string; language: string | null },
    onProgress: (p: Progress) => void,
    signal: AbortSignal,
  ): Promise<EngineTranscript> {
    this.calls.push({ model: options.model, language: options.language, size: audio.size });
    onProgress({ fraction: 0.4, message: "Recognising speech… about 1 minute left" });
    if (this.gate) {
      await Promise.race([
        this.gate,
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Cancelled", "AbortError"));
          });
        }),
      ]);
    }
    signal.throwIfAborted();
    return { language: options.language ?? this.language, durationMs: 2500, segments: this.segments };
  }
}
