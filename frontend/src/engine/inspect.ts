/**
 * Reads an MP4's details in the browser (no upload, no FFprobe): duration, picture size,
 * frame rate, codecs and whether there is an audio track. Only the file's index boxes are
 * read; mp4box skips the media data, so large files are inspected quickly.
 */
import { createFile, MP4BoxBuffer, type Movie, type Track } from "mp4box";

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

const CHUNK = 1024 * 1024;

const CODEC_NAMES: Record<string, string> = {
  avc1: "h264",
  avc3: "h264",
  hvc1: "hevc",
  hev1: "hevc",
  vp09: "vp9",
  av01: "av1",
  mp4a: "aac",
  opus: "opus",
  "ac-3": "ac3",
  "ec-3": "eac3",
  alac: "alac",
  flac: "flac",
};

export function codecName(codec: string | undefined): string | null {
  if (!codec) return null;
  const four = codec.split(".")[0];
  return CODEC_NAMES[four] ?? four;
}

function frameRate(track: Track): number | null {
  if (!track.timescale || !track.duration || !track.nb_samples) return null;
  const seconds = track.duration / track.timescale;
  return seconds > 0 ? Math.round((track.nb_samples / seconds) * 1000) / 1000 : null;
}

/** Phones often store portrait video as landscape plus a 90° rotation; report what is shown. */
function displaySize(track: Track): { width: number; height: number } {
  const width = track.video?.width ?? Math.round(track.track_width);
  const height = track.video?.height ?? Math.round(track.track_height);
  const m = track.matrix as ArrayLike<number> | undefined;
  const quarterTurn = m !== undefined && m[0] === 0 && m[4] === 0 && m[1] !== 0;
  return quarterTurn ? { width: height, height: width } : { width, height };
}

export function metadataFromMovie(info: Movie): MediaMetadata {
  const video = info.videoTracks.at(0);
  if (!video) {
    throw new InspectError(
      "no_video_stream",
      "This MP4 has no video track (it may be audio only). Choose a file with video.",
    );
  }
  const audio = info.audioTracks.at(0);
  const movieSeconds = info.timescale ? info.duration / info.timescale : 0;
  const trackSeconds = video.timescale ? video.duration / video.timescale : 0;
  const durationMs = Math.round((movieSeconds || trackSeconds) * 1000);
  if (durationMs <= 0) {
    throw new InspectError(
      "no_duration",
      "The video's length could not be read. The file may be incomplete or damaged.",
    );
  }
  return {
    duration_ms: durationMs,
    ...displaySize(video),
    frame_rate: frameRate(video),
    video_codec: codecName(video.codec),
    has_audio: audio !== undefined,
    audio_codec: codecName(audio?.codec),
    container: "mp4",
  };
}

export async function inspectMp4(file: Blob, signal?: AbortSignal): Promise<MediaMetadata> {
  const mp4 = createFile(false);
  // Set from mp4box callbacks while chunks are appended.
  const state: { info: Movie | null; failed: boolean } = { info: null, failed: false };
  mp4.onReady = (movie) => {
    state.info = movie;
  };
  mp4.onError = () => {
    state.failed = true;
  };
  let offset = 0;
  try {
    while (offset < file.size && state.info === null && !state.failed) {
      signal?.throwIfAborted();
      const end = Math.min(file.size, offset + CHUNK);
      const buffer = await file.slice(offset, end).arrayBuffer();
      const next = mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer, offset), end >= file.size);
      // mp4box says where it wants to read next; that lets it jump over the media data.
      offset = next > offset ? next : end;
    }
    mp4.flush();
  } catch (error) {
    if (signal?.aborted) throw error;
    state.failed = true;
  }
  const movie = state.info;
  if (state.failed || movie === null || !movie.hasMoov) {
    throw new InspectError(
      "not_mp4",
      "This file could not be read as an MP4 video. It may be damaged, or another format " +
        "renamed to .mp4. Convert it to MP4 and try again.",
    );
  }
  return metadataFromMovie(movie);
}
