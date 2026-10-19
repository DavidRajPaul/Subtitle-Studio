/**
 * Makes a new MP4 with the subtitles burned into the picture, entirely in the browser:
 * decode each frame → draw it plus the subtitles with the shared renderer → encode with the
 * device's video encoder (WebCodecs). The audio is copied unchanged. The original file is only
 * read, never changed. The result is checked before it is offered.
 */
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  type VideoCodec,
} from "mediabunny";
import { ApiError } from "../../api/http";
import type { ProjectCue, SubtitleStyle } from "../../api/projects";
import { ensureFont } from "../fonts/fonts";
import { displayText, drawSubtitles } from "../render/draw";

export interface ExportProgress {
  fraction: number | null;
  message: string;
}

export interface ExportResult {
  blob: Blob;
  codec: VideoCodec;
  width: number;
  height: number;
  durationMs: number;
  hasAudio: boolean;
  /** Plain-language notes about the result (for example a less common video format). */
  notes: string[];
}

/** Codecs that MP4 can hold, most widely playable first (H.264 plays everywhere). */
const CODECS: VideoCodec[] = ["avc", "hevc", "vp9", "av1"];
/** If no frame is finished for this long, stop and say so rather than hang. */
const STALL_MS = 60_000;
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

export const CODEC_NAMES: Record<string, string> = { avc: "H.264", hevc: "HEVC", vp9: "VP9", av1: "AV1" };

export function exportSupported(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
}

function minutesLeft(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 60_000) return " · less than a minute left";
  const m = Math.round(ms / 60_000);
  return ` · about ${String(m)} ${m === 1 ? "minute" : "minutes"} left`;
}

export async function exportBurnedIn(options: {
  video: Blob;
  cues: ProjectCue[];
  style: SubtitleStyle;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
}): Promise<ExportResult> {
  const { video, cues, style, onProgress, signal } = options;
  if (!exportSupported()) {
    throw new ApiError(
      "export_unsupported",
      "This browser cannot make video files. Use Chrome on Android, Safari on iPhone (iOS 17 or later) or a computer. You can still save the subtitle (SRT) file.",
    );
  }
  onProgress({ fraction: null, message: "Getting ready…" });
  const input = new Input({ source: new BlobSource(video), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new ApiError("no_video", "This file has no video track.");
  const hasAudio = (await input.getPrimaryAudioTrack()) !== null;
  const sourceDuration = await input.computeDuration();
  const width = even(await track.getDisplayWidth());
  const height = even(await track.getDisplayHeight());
  const quality = new Quality("high");
  const codec = await getFirstEncodableVideoCodec(CODECS, { width, height, quality });
  if (!codec) {
    throw new ApiError(
      "no_encoder",
      `This device cannot encode video at ${String(width)}×${String(height)}. Try a computer or a newer phone. You can still save the subtitle (SRT) file.`,
    );
  }

  // Load every glyph the subtitles need before the first frame is drawn.
  const allText = cues.map((c) => displayText(c.text, style)).join(" ");
  await ensureFont(style.font_family, style.bold, allText);
  signal.throwIfAborted();

  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) throw new ApiError("no_canvas", "This browser cannot draw the subtitles for export.");

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    video: {
      codec,
      quality,
      forceTranscode: true,
      allowTransformationMetadata: false, // bake phone rotation into the picture
      processedWidth: width,
      processedHeight: height,
      process: (sample) => {
        ctx.clearRect(0, 0, width, height);
        sample.draw(ctx, 0, 0, width, height);
        drawSubtitles(ctx, width, height, cues, Math.round(sample.timestamp * 1000), style, { clear: false });
        return canvas;
      },
    },
    audio: {}, // copied as is when MP4 can hold it
  });
  const lost = (type: "video" | "audio") => conversion.discardedTracks.find((d) => d.track.type === type);
  const lostVideo = lost("video");
  if (lostVideo) {
    throw new ApiError(
      "cannot_read_video",
      lostVideo.reason === "undecodable_source_codec"
        ? "This browser cannot read this video's format, so it cannot add the subtitles. Try Chrome or Safari on another device, or a computer. You can still save the subtitle (SRT) file."
        : "This video could not be prepared for export. Try converting it to a standard MP4 first. You can still save the subtitle (SRT) file.",
    );
  }
  if (hasAudio && lost("audio")) {
    throw new ApiError(
      "cannot_keep_audio",
      "This browser cannot keep this video's sound in the new file, so nothing was made. Try another browser or device. You can still save the subtitle (SRT) file.",
    );
  }
  if (!conversion.isValid) {
    throw new ApiError("cannot_convert", "This video could not be prepared for export. Try converting it to a standard MP4 first.");
  }
  const started = performance.now();
  let lastProgressAt = started;
  const watch = { stalled: false };
  const watchdog = setInterval(() => {
    if (performance.now() - lastProgressAt > STALL_MS) {
      watch.stalled = true;
      void conversion.cancel();
    }
  }, 5000);
  conversion.onProgress = (p) => {
    lastProgressAt = performance.now();
    const elapsed = performance.now() - started;
    const left = p > 0.02 ? (elapsed / p) * (1 - p) : NaN;
    onProgress({ fraction: p, message: `Making your video${minutesLeft(left)}` });
  };
  const abort = () => {
    void conversion.cancel();
  };
  signal.addEventListener("abort", abort);
  try {
    await conversion.execute();
  } catch (error) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (watch.stalled) {
      throw new ApiError(
        "export_stalled",
        "Making the video stopped moving for over a minute, so it was stopped. Keep the screen on and the app open, then try again. You can still save the subtitle (SRT) file.",
      );
    }
    throw new ApiError("export_failed", `The video could not be made: ${error instanceof Error ? error.message : "unknown error"}. Try again; a shorter clip uses less memory.`);
  } finally {
    clearInterval(watchdog);
    signal.removeEventListener("abort", abort);
  }
  signal.throwIfAborted();
  const buffer = output.target.buffer;
  if (!buffer || buffer.byteLength === 0) throw new ApiError("export_empty", "The video came out empty. Try again.");
  const blob = new Blob([buffer], { type: "video/mp4" });

  onProgress({ fraction: 1, message: "Checking the new video…" });
  const durationMs = await checkOutput(blob, sourceDuration, hasAudio);
  const notes: string[] = [];
  if (codec !== "avc") {
    notes.push(
      `This browser could not use H.264, so the video uses ${CODEC_NAMES[codec] ?? codec}. It plays in Chrome and on Android, but some apps and older iPhones may not play it.`,
    );
  }
  return { blob, codec, width, height, durationMs, hasAudio, notes };
}

/** Re-opens the new file and makes sure it is a complete video before calling it a success. */
export async function checkOutput(blob: Blob, sourceDurationS: number, expectAudio: boolean): Promise<number> {
  const check = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const v = await check.getPrimaryVideoTrack();
  if (!v) throw new ApiError("export_invalid", "The new file has no video. Nothing was saved; try again.");
  if (expectAudio && !(await check.getPrimaryAudioTrack())) {
    throw new ApiError("export_invalid", "The new video lost its sound. Nothing was saved; try again.");
  }
  const duration = await check.computeDuration();
  if (Math.abs(duration - sourceDurationS) > Math.max(1, sourceDurationS * 0.02)) {
    throw new ApiError("export_invalid", "The new video is shorter than the original. Nothing was saved; try again.");
  }
  return Math.round(duration * 1000);
}
