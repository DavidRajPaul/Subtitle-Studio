/**
 * Projects, saved in this browser (IndexedDB) on this device. Each saved project also keeps a
 * working copy of its video here, so it can be reopened later. Nothing is uploaded.
 */
import { ApiError } from "./http";
import { forgetPending, pendingMedia } from "./media";
import { deleteOne, getAll, getAllKeys, getOne, MEDIA, PROJECTS, putOne } from "../engine/db";
import { checkProject, ProjectSchemaError } from "../engine/projectSchema";
import { validateCues as engineValidate, type TimingIssue } from "../engine/timing";
import type { Segmentation, TimingMode, TimingSettings } from "./subtitles";
import type { Workflow } from "../types";

export interface BackgroundStyle {
  enabled: boolean;
  color: string;
  opacity: number;
  /** Space around the text, px at the 1080 reference. */
  padding_px: number;
  radius_px: number;
}

export type InAnimation = "none" | "fade" | "scale" | "spin" | "slide" | "reveal" | "gradient";
export type LoopAnimation = "none" | "pulse" | "bounce" | "float" | "shake" | "wobble";
export type CaptionAnimation = "none" | "highlight" | "pop" | "word";

export interface AnimationStyle {
  in: InAnimation;
  out: InAnimation;
  loop: LoopAnimation;
  caption: CaptionAnimation;
  in_ms: number;
  out_ms: number;
  /** Colour of the spoken word in Highlight and Pop captions. */
  highlight_color: string;
}

/**
 * One global style. Sizes are pixels for a 1080-pixel-tall frame and scale with the video.
 * The same object drives the preview and (next stage) the exported video.
 */
export interface SubtitleStyle {
  /** A font from the library (its id), "custom:<id>" for an added font, or sans/serif/mono. */
  font_family: string;
  font_size: number;
  text_color: string;
  text_opacity: number;
  bold: boolean;
  italic: boolean;
  text_case: "none" | "upper";
  outline_color: string;
  outline_px: number;
  outline_opacity: number;
  shadow: boolean;
  shadow_color: string;
  shadow_opacity: number;
  shadow_blur_px: number;
  shadow_offset_px: number;
  background: BackgroundStyle;
  position: "top" | "middle" | "bottom";
  align: "left" | "center" | "right";
  safe_margin_pct: number;
  vertical_offset_px: number;
  /** Widest a line may be, as a share of the frame width. */
  max_width_pct: number;
  letter_spacing_px: number;
  /** Extra space between lines, in percent of the font size. */
  line_spacing_pct: number;
  animation: AnimationStyle;
}

export interface ProjectCue {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface MediaRef {
  id: string;
  filename: string;
  duration_ms: number;
  width: number;
  height: number;
  has_audio: boolean;
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  workflow: Workflow;
  created_at?: string | null;
  updated_at?: string | null;
  media: MediaRef;
  cues: ProjectCue[];
  style: SubtitleStyle;
  timing: { mode: TimingMode; segmentation: Segmentation; settings: TimingSettings };
}

export interface LoadedProject extends Project {
  media_available: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  workflow: Workflow;
  updated_at: string | null;
  media_filename: string;
  media_available: boolean;
  cue_count: number;
}

const unavailable = () =>
  new ApiError(
    "storage_unavailable",
    "This browser is not allowing Subtitle Studio to save. Turn off private browsing, or try another browser.",
  );

function storageError(error: unknown, fallback: string): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new ApiError(
      "storage_full",
      "There is not enough free space on this device to save. Delete old projects or free some space, then try again.",
    );
  }
  if (error instanceof Error && /IndexedDB/.test(error.message)) return unavailable();
  return new ApiError("storage_failed", fallback);
}

let persistAsked = false;
/** Asks the browser not to clear projects when space runs low (best effort). */
function askToPersist(): void {
  if (persistAsked) return;
  persistAsked = true;
  try {
    void navigator.storage.persist().catch(() => undefined);
  } catch {
    // Not offered by this browser.
  }
}

async function loadRaw(id: string): Promise<unknown> {
  try {
    return await getOne<unknown>(PROJECTS, id);
  } catch (error) {
    throw storageError(error, "Saved projects could not be read.");
  }
}

export async function listProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
  let raws: unknown[];
  let mediaIds: Set<string>;
  try {
    raws = await getAll<unknown>(PROJECTS);
    mediaIds = new Set(await getAllKeys(MEDIA));
  } catch (error) {
    throw storageError(error, "Saved projects could not be read.");
  }
  signal?.throwIfAborted();
  const docs: Project[] = [];
  for (const raw of raws) {
    try {
      docs.push(checkProject(raw));
    } catch {
      // A damaged entry is skipped, never deleted.
    }
  }
  docs.sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? "") || b.id.localeCompare(a.id),
  );
  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    workflow: d.workflow,
    updated_at: d.updated_at ?? null,
    media_filename: d.media.filename,
    media_available: mediaIds.has(d.media.id) || pendingMedia(d.media.id) !== undefined,
    cue_count: d.cues.length,
  }));
}

export async function getProject(id: string, signal?: AbortSignal): Promise<LoadedProject> {
  const raw = await loadRaw(id);
  signal?.throwIfAborted();
  if (raw === undefined) throw new ApiError("not_found", "That project could not be found.");
  let doc: Project;
  try {
    doc = checkProject(raw);
  } catch {
    throw new ApiError(
      "unreadable",
      "This project could not be read. It may be damaged or from a newer version of Subtitle Studio. It was left untouched.",
    );
  }
  let available = pendingMedia(doc.media.id) !== undefined;
  if (!available) {
    try {
      available = (await getOne(MEDIA, doc.media.id)) !== undefined;
    } catch {
      available = false;
    }
  }
  return { ...doc, media_available: available };
}

export async function saveProject(project: Project): Promise<void> {
  // media_available is a hint for the screen and never part of the saved document.
  const raw: Record<string, unknown> = { ...project };
  delete raw.media_available;
  let doc: Project;
  try {
    doc = checkProject(raw);
  } catch (error) {
    const what = error instanceof ProjectSchemaError ? ` (${error.message})` : "";
    throw new ApiError("invalid_project", `The project has a value that is not allowed${what}.`);
  }
  try {
    const file = pendingMedia(doc.media.id);
    if (file) {
      // First save with this video: keep a working copy so the project reopens later.
      await putOne(MEDIA, {
        id: doc.media.id,
        filename: file.name,
        type: file.type || "video/mp4",
        size: file.size,
        blob: new Blob([file], { type: file.type || "video/mp4" }),
      });
      forgetPending(doc.media.id);
    }
    const previous = await getOne<{ created_at?: string | null }>(PROJECTS, doc.id);
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
    await putOne(PROJECTS, {
      ...doc,
      created_at: previous?.created_at ?? doc.created_at ?? now,
      updated_at: now,
    });
  } catch (error) {
    throw storageError(error, "The project could not be saved in this browser.");
  }
  askToPersist();
}

export async function deleteProject(id: string): Promise<void> {
  const raw = await loadRaw(id);
  if (raw === undefined) throw new ApiError("not_found", "That project could not be found.");
  try {
    await deleteOne(PROJECTS, id);
    const mediaId = (raw as { media?: { id?: unknown } }).media?.id;
    if (typeof mediaId === "string") {
      const stillUsed = (await getAll<{ media?: { id?: unknown } }>(PROJECTS)).some(
        (p) => p.media?.id === mediaId,
      );
      if (!stillUsed) await deleteOne(MEDIA, mediaId);
    }
  } catch (error) {
    throw storageError(error, "The project could not be deleted.");
  }
}

export function validateCues(
  cues: ProjectCue[],
  durationMs: number,
  settings: TimingSettings,
  signal?: AbortSignal,
): Promise<TimingIssue[]> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return Promise.resolve(engineValidate(cues, durationMs, settings));
}
