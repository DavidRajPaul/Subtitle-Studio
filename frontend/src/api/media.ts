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

/** Client-side check before sending anything; the backend validates again. */
export function validateVideoFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".mp4")) {
    return "Choose a video file ending in .mp4.";
  }
  if (file.size === 0) {
    return "This file is empty. Choose a different video.";
  }
  return null;
}

interface ErrorBody {
  detail?: { code?: string; message?: string };
}

/** Sends the file to the local backend (127.0.0.1) for inspection. Nothing leaves the device. */
export async function importMedia(file: File, signal?: AbortSignal): Promise<ImportedMedia> {
  const form = new FormData();
  form.append("file", file, file.name);
  let response: Response;
  try {
    response = await fetch("/api/media", { method: "POST", body: form, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new MediaImportError(
      "backend_unreachable",
      "The local backend is not running, so the video could not be inspected. Start it, then try again.",
    );
  }
  if (!response.ok) {
    let body: ErrorBody = {};
    try {
      body = (await response.json()) as ErrorBody;
    } catch {
      // fall through to the generic message
    }
    throw new MediaImportError(
      body.detail?.code ?? "import_failed",
      body.detail?.message ?? "The video could not be imported. Try again or choose another file.",
    );
  }
  return (await response.json()) as ImportedMedia;
}

export async function removeMedia(id: string): Promise<void> {
  try {
    await fetch(`/api/media/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // Best effort: the working copy is app-owned and can be cleaned later.
  }
}
