/// <reference lib="webworker" />
/**
 * Runs Whisper (transformers.js + ONNX Runtime WebAssembly) off the main thread so the screen
 * stays responsive. Audio arrives as 16 kHz mono windows; text and times go back as segments.
 * Cancelling terminates this worker.
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

export type WorkerRequest =
  | { type: "load"; repo: string; ortBase: string; remoteHost?: string }
  | {
      type: "transcribe";
      language: string | null;
      windows: { offsetMs: number; durationMs: number; audio: Float32Array }[];
    };

export type WorkerMessage =
  | { type: "download"; file: string; loaded: number; total: number }
  | { type: "ready" }
  | { type: "segments"; index: number; language: string | null; segments: { start_ms: number; end_ms: number; text: string }[] }
  | { type: "done" }
  | { type: "error"; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let asr: AutomaticSpeechRecognitionPipeline | null = null;

const post = (message: WorkerMessage) => {
  scope.postMessage(message);
};

interface Chunk {
  timestamp: [number, number | null];
  text: string;
  language?: string | null;
}

async function load(request: Extract<WorkerRequest, { type: "load" }>): Promise<void> {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  if (request.remoteHost) env.remoteHost = request.remoteHost;
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    // Served from this site (not a third-party CDN). Threads need cross-origin isolation.
    wasm.wasmPaths = {
      mjs: `${request.ortBase}ort-wasm-simd-threaded.mjs`,
      wasm: `${request.ortBase}ort-wasm-simd-threaded.wasm`,
    };
    wasm.numThreads = scope.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  }
  asr = await pipeline("automatic-speech-recognition", request.repo, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress" && p.file) {
        post({ type: "download", file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
      }
    },
  });
  post({ type: "ready" });
}

async function transcribe(request: Extract<WorkerRequest, { type: "transcribe" }>): Promise<void> {
  if (!asr) throw new Error("The speech model is not loaded.");
  for (const [index, w] of request.windows.entries()) {
    const output = (await asr(w.audio, {
      ...(request.language ? { language: request.language } : {}),
      task: "transcribe",
      return_timestamps: true,
      return_language: true,
      // Whisper can get stuck repeating a phrase; blocking repeated 3-word runs prevents it.
      no_repeat_ngram_size: 3,
    })) as { chunks?: Chunk[]; text: string };
    const chunks: Chunk[] = output.chunks ?? [{ timestamp: [0, null], text: output.text }];
    let language: string | null = null;
    const segments = chunks.map((c) => {
      language = language ?? c.language ?? null;
      const start = Math.min(w.durationMs, Math.round(c.timestamp[0] * 1000));
      const end = c.timestamp[1] === null ? w.durationMs : Math.min(w.durationMs, Math.round(c.timestamp[1] * 1000));
      return { start_ms: w.offsetMs + start, end_ms: w.offsetMs + Math.max(end, start), text: c.text };
    });
    post({ type: "segments", index, language, segments });
  }
  post({ type: "done" });
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const run = request.type === "load" ? load(request) : transcribe(request);
  run.catch((error: unknown) => {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  });
};
