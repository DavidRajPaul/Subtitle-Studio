/**
 * Decodes the audio of a video (MP4, MOV, WebM, MKV…) or an MP3 in the browser and converts it to 16 kHz mono, the format
 * Whisper expects. Uses the browser's own decoders (no upload). Runs on the main thread because
 * audio decoding is not available inside workers.
 */
import { ApiError } from "../api/http";
import { SAMPLE_RATE } from "./chunking";

type OfflineCtor = new (channels: number, length: number, rate: number) => OfflineAudioContext;

function offlineContext(): OfflineCtor | undefined {
  const w = window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
}

export async function decodeToMono16k(file: Blob, signal?: AbortSignal): Promise<Float32Array> {
  const Offline = offlineContext();
  if (!Offline) {
    throw new ApiError("audio_unsupported", "This browser cannot read audio. Try Chrome or Safari.");
  }
  const bytes = await file.arrayBuffer();
  signal?.throwIfAborted();
  let decoded: AudioBuffer;
  try {
    decoded = await new Offline(1, 1, 44_100).decodeAudioData(bytes);
  } catch {
    // Some browsers cannot read the sound straight from MOV/MKV/WebM files; pull it out as WAV.
    try {
      const wav = await extractWav(file, signal);
      decoded = await new Offline(1, 1, 44_100).decodeAudioData(wav);
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(
        "audio_unreadable",
        "The audio in this file could not be read on this device. Try an MP3 of the same audio.",
      );
    }
  }
  signal?.throwIfAborted();
  if (decoded.duration <= 0) throw new ApiError("no_audio", "No audio could be read from this file.");
  const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
  const ctx = new Offline(1, length, SAMPLE_RATE);
  const source = ctx.createBufferSource();
  source.buffer = decoded; // channels are mixed down to mono by the 1-channel destination
  source.connect(ctx.destination);
  source.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

/** Length of an audio file in ms, read by the browser's media element (fast, no decoding). */
export function readAudioDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const done = () => {
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
    };
    const timer = setTimeout(() => {
      done();
      reject(new ApiError("audio_unreadable", "This MP3 could not be read. Try another file."));
    }, 15_000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      const seconds = audio.duration;
      done();
      if (Number.isFinite(seconds) && seconds > 0) resolve(Math.round(seconds * 1000));
      else reject(new ApiError("no_duration", "The audio's length could not be read. The file may be damaged."));
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done();
      reject(new ApiError("audio_unreadable", "This MP3 could not be read on this device. Try another file."));
    };
    audio.src = url;
  });
}

/** The file's sound as 16 kHz mono WAV, decoded with WebCodecs (fallback for odd containers). */
async function extractWav(file: Blob, signal?: AbortSignal): Promise<ArrayBuffer> {
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, WavOutputFormat } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: { discard: true },
      audio: { codec: "pcm-s16", sampleRate: SAMPLE_RATE, numberOfChannels: 1 },
    });
    if (!conversion.isValid) throw new Error("no readable audio");
    const stop = () => void conversion.cancel();
    signal?.addEventListener("abort", stop);
    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener("abort", stop);
    }
    signal?.throwIfAborted();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("empty audio");
    return buffer;
  } finally {
    input.dispose();
  }
}
