/**
 * Reads a video's details in the browser (no upload): duration, picture size, frame rate,
 * codecs and whether there is an audio track. Works for MP4, MOV, M4V, 3GP, WebM and MKV.
 * Only the parts of the file that hold this information are read, so large files are quick.
 */
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

export interface MediaMetadata {
  duration_ms: number;
  width: number;
  height: number;
  frame_rate: number | null;
  video_codec: string | null;
  has_audio: boolean;
  audio_codec: string | null;
  container: string;
}

export class InspectError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InspectError";
  }
}

const CODEC_NAMES: Record<string, string> = { avc: "h264", hevc: "hevc" };
const codecName = (c: string | null): string | null => (c === null ? null : (CODEC_NAMES[c] ?? c));

/** Short container names shown to people and stored with the project. */
function containerName(format: string, mime: string): string {
  const f = format.toLowerCase();
  if (f.includes("quicktime")) return "mov";
  if (f.includes("webm")) return "webm";
  if (f.includes("matroska")) return "mkv";
  if (f.includes("mpeg-ts") || f.includes("mpeg ts") || f.includes("transport")) return "ts";
  if (f.includes("ogg")) return "ogg";
  if (mime.includes("3gpp")) return "3gp";
  return "mp4";
}

const UNREADABLE =
  "This file could not be read as a video. It may be damaged, or in a format browsers cannot open (such as AVI or WMV). Convert it to MP4 and try again.";

export async function inspectVideo(file: Blob, signal?: AbortSignal): Promise<MediaMetadata> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    let format;
    try {
      format = await input.getFormat();
    } catch {
      throw new InspectError("unsupported_format", UNREADABLE);
    }
    signal?.throwIfAborted();
    const video = await input.getPrimaryVideoTrack();
    if (!video) {
      throw new InspectError(
        "no_video_stream",
        "This file has no video track (it may be audio only). Choose a file with video.",
      );
    }
    const audio = await input.getPrimaryAudioTrack();
    const seconds = await input.computeDuration();
    signal?.throwIfAborted();
    const durationMs = Math.round(seconds * 1000);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new InspectError("no_duration", "The video's length could not be read. The file may be incomplete or damaged.");
    }
    let frameRate: number | null = null;
    try {
      const stats = await video.computePacketStats(100);
      frameRate = stats.averagePacketRate > 0 ? Math.round(stats.averagePacketRate * 1000) / 1000 : null;
    } catch {
      frameRate = null;
    }
    return {
      duration_ms: durationMs,
      // Phones often store portrait video as landscape plus a rotation; report what is shown.
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      frame_rate: frameRate,
      video_codec: codecName(await video.getCodec()),
      has_audio: audio !== null,
      audio_codec: audio ? codecName(await audio.getCodec()) : null,
      container: containerName(format.name, format.mimeType + " " + file.type),
    };
  } catch (error) {
    if (signal?.aborted || error instanceof InspectError) throw error;
    throw new InspectError("unsupported_format", UNREADABLE);
  } finally {
    input.dispose();
  }
}
