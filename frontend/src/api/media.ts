/**
 * Video import, entirely in the browser: the file is inspected here and kept in memory until
 * a project is saved, which stores a working copy in this browser. The original file on the
 * device is never changed, and nothing is uploaded.
 */
import { newId } from "./http";
import { getOne, MEDIA, type MediaRecord } from "../engine/db";
import type { MediaMetadata } from "../engine/inspect";
import { videoNameProblem } from "../lib/videoFormats";

export type { MediaMetadata };

export interface ImportedMedia {
  id: string;
  filename: string;
  size_bytes: number;
  metadata: MediaMetadata;
}

export class MediaImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MediaImportError";
  }
}

export const MAX_VIDEO_BYTES = 2 * 1024 ** 3;

/** Videos chosen in this session that are not saved in a project yet. */
const pending = new Map<string, File>();

export function validateVideoFile(file: File): string | null {
  const nameProblem = videoNameProblem(file);
  if (nameProblem) return nameProblem;
  if (file.size === 0) {
    return "This file is empty. Choose a different video.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "This video is larger than 2 GB, which is too big to keep in the browser. Choose a shorter clip.";
  }
  return null;
}

export async function importMedia(file: File, signal?: AbortSignal): Promise<ImportedMedia> {
  const problem = validateVideoFile(file);
  if (problem) throw new MediaImportError("invalid_file", problem);
  let metadata: MediaMetadata;
  // The video reader is loaded only when a video is chosen, keeping the first visit quick.
  const { InspectError, inspectVideo } = await import("../engine/inspect");
  try {
    metadata = await inspectVideo(file, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof InspectError) throw new MediaImportError(error.code, error.message);
    throw new MediaImportError(
      "unreadable",
      "This file could not be read as a video. It may be damaged. Try converting it to MP4.",
    );
  }
  const id = newId();
  pending.set(id, file);
  return { id, filename: file.name, size_bytes: file.size, metadata };
}

/** Forgets a chosen video that was not saved. Saved projects keep their own copy. */
export function removeMedia(id: string): Promise<void> {
  pending.delete(id);
  return Promise.resolve();
}

/** The not-yet-saved file for this id, if any (used when a project is first saved). */
export const pendingMedia = (id: string): File | undefined => pending.get(id);
export const forgetPending = (id: string): void => {
  pending.delete(id);
};

/** A playable URL for a project's video, or null if it is not on this device any more. */
export async function loadMediaUrl(id: string): Promise<string | null> {
  const file = pending.get(id);
  if (file) return URL.createObjectURL(file);
  try {
    const record = await getOne<MediaRecord>(MEDIA, id);
    return record ? URL.createObjectURL(record.blob) : null;
  } catch {
    return null;
  }
}

/** The video itself (for export): the not-yet-saved file or the project's stored copy. */
export async function loadMediaBlob(id: string): Promise<Blob | null> {
  const file = pending.get(id);
  if (file) return file;
  try {
    return (await getOne<MediaRecord>(MEDIA, id))?.blob ?? null;
  } catch {
    return null;
  }
}
