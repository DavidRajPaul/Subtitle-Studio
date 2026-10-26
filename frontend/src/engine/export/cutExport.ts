/**
 * Export of a cut video: only the kept parts of the original are decoded, each frame is drawn with
 * the subtitles at its time on the cut timeline and re-encoded, and the sound is copied packet by
 * packet (re-encoded only when MP4 cannot hold it). The original file is only read.
 */
import {
  AudioSampleSink,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  getFirstEncodableAudioCodec,
  type AudioCodec,
  type Input,
  type InputAudioTrack,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
} from "mediabunny";
import { ApiError } from "../../api/http";
import { cutDuration, partStarts, type Range } from "../../lib/cuts";
import { drawSubtitles } from "../render/draw";
import type { ExportOptions, ExportProgress } from "./videoExport";

export interface CutVideo {
  blob: Blob;
  hasAudio: boolean;
}

const EPS = 1e-6;

function minutesLeft(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 60_000) return " · less than a minute left";
  const m = Math.round(ms / 60_000);
  return ` · about ${String(m)} ${m === 1 ? "minute" : "minutes"} left`;
}

/** Copies (or, if needed, re-encodes) the sound of the kept parts, end to end. */
async function addAudio(output: Output, track: InputAudioTrack, parts: Range[], signal: AbortSignal): Promise<() => Promise<void>> {
  const codec = await track.getCodec();
  const mp4Codecs = new Mp4OutputFormat().getSupportedCodecs() as string[];
  const starts = partStarts(parts);

  if (codec && mp4Codecs.includes(codec)) {
    const source = new EncodedAudioPacketSource(codec);
    output.addAudioTrack(source);
    return async () => {
      const sink = new EncodedPacketSink(track);
      const decoderConfig = (await track.getDecoderConfig()) ?? undefined;
      let first = true;
      let last = -Infinity;
      for (let i = 0; i < parts.length; i++) {
        const from = parts[i].start_ms / 1000;
        const to = parts[i].end_ms / 1000;
        const offset = starts[i] / 1000;
        const startPacket = (await sink.getPacket(from)) ?? (await sink.getFirstPacket());
        if (!startPacket) continue;
        for await (const packet of sink.packets(startPacket)) {
          signal.throwIfAborted();
          if (packet.timestamp >= to - EPS) break;
          if (packet.timestamp + packet.duration <= from + EPS) continue;
          // Keep packets in order; a packet that straddles a cut edge is placed just after the previous one.
          const ts = Math.max(offset + Math.max(0, packet.timestamp - from), last);
          await source.add(packet.clone({ timestamp: ts }), first && decoderConfig ? { decoderConfig } : undefined);
          first = false;
          last = ts + packet.duration;
        }
      }
      source.close();
    };
  }

  // MP4 cannot hold this sound as it is (e.g. Vorbis from WebM): decode and re-encode it.
  const target = await getFirstEncodableAudioCodec(["aac", "opus"] as AudioCodec[]);
  if (!target) {
    throw new ApiError(
      "cannot_keep_audio",
      "This browser cannot keep this video's sound in the new file, so nothing was made. Try another browser or device. You can still save the subtitle (SRT) file.",
    );
  }
  const source = new AudioSampleSource({ codec: target, bitrate: new Quality("high") });
  output.addAudioTrack(source);
  return async () => {
    const sink = new AudioSampleSink(track);
    for (let i = 0; i < parts.length; i++) {
      const from = parts[i].start_ms / 1000;
      const offset = starts[i] / 1000;
      for await (const sample of sink.samples(from, parts[i].end_ms / 1000)) {
        signal.throwIfAborted();
        sample.setTimestamp(offset + Math.max(0, sample.timestamp - from));
        await source.add(sample);
        sample.close();
      }
    }
    source.close();
  };
}

export async function burnInCut(
  options: ExportOptions & { parts: Range[] },
  input: Input,
  setup: {
    width: number;
    height: number;
    codec: import("mediabunny").VideoCodec;
    canvas: OffscreenCanvas | HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  },
): Promise<CutVideo> {
  const { cues, style, onProgress, signal, parts } = options;
  const { width, height, codec, canvas, ctx } = setup;
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new ApiError("no_video", "This file has no video track.");
  if (!(await video.canDecode())) {
    throw new ApiError(
      "cannot_read_video",
      "This browser cannot read this video's format, so it cannot add the subtitles. Try Chrome or Safari on another device, or a computer. You can still save the subtitle (SRT) file.",
    );
  }
  const audio = await input.getPrimaryAudioTrack();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const picture = new CanvasSource(canvas, { codec, bitrate: new Quality("high") });
  output.addVideoTrack(picture);
  const writeAudio = audio ? await addAudio(output, audio, parts, signal) : null;

  const totalMs = cutDuration(parts);
  const starts = partStarts(parts);
  const started = performance.now();
  const report = (doneMs: number) => {
    const p = Math.min(1, doneMs / totalMs);
    const elapsed = performance.now() - started;
    const left = p > 0.02 ? (elapsed / p) * (1 - p) : NaN;
    onProgress({ fraction: p, message: `Making your video${minutesLeft(left)}` } satisfies ExportProgress);
  };

  const state = { cancelled: false };
  const stop = () => {
    state.cancelled = true;
  };
  signal.addEventListener("abort", stop);
  try {
    await output.start();
    const sink = new VideoSampleSink(video);
    let last = -Infinity;
    for (let i = 0; i < parts.length; i++) {
      const from = parts[i].start_ms / 1000;
      const to = parts[i].end_ms / 1000;
      const offset = starts[i] / 1000;
      for await (const sample of sink.samples(from, to)) {
        if (state.cancelled) {
          sample.close();
          break;
        }
        const t = offset + Math.max(0, sample.timestamp - from);
        const end = offset + (Math.min(sample.timestamp + sample.duration, to) - from);
        if (t <= last + EPS || end <= t + EPS) {
          sample.close();
          continue;
        }
        ctx.clearRect(0, 0, width, height);
        sample.draw(ctx, 0, 0, width, height);
        sample.close();
        drawSubtitles(ctx, width, height, cues, Math.round(t * 1000), style, { clear: false });
        await picture.add(t, end - t);
        last = t;
        report(Math.round(end * 1000));
      }
      if (state.cancelled) break;
    }
    picture.close();
    if (!state.cancelled && writeAudio) await writeAudio();
    if (state.cancelled || signal.aborted) {
      await output.cancel();
      throw new DOMException("Cancelled", "AbortError");
    }
    await output.finalize();
  } catch (error) {
    if (signal.aborted || state.cancelled) {
      await output.cancel().catch(() => undefined);
      throw new DOMException("Cancelled", "AbortError");
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError("export_failed", `The video could not be made: ${error instanceof Error ? error.message : "unknown error"}. Try again; a shorter clip uses less memory.`);
  } finally {
    signal.removeEventListener("abort", stop);
  }
  const buffer = output.target.buffer;
  if (!buffer || buffer.byteLength === 0) throw new ApiError("export_empty", "The video came out empty. Try again.");
  return { blob: new Blob([buffer], { type: "video/mp4" }), hasAudio: audio !== null };
}
