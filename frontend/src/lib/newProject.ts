import { newId } from "../api/http";
import type { ImportedMedia } from "../api/media";
import { saveProject, type LoadedProject, type SubtitleStyle } from "../api/projects";
import type { Segmentation, TimingMode, TimingSettings } from "../api/subtitles";
import type { Workflow } from "../types";
import { baseName } from "./videoFormats";

export interface NewProjectContent {
  cues: { id: string; text: string; start_ms: number; end_ms: number }[];
  mode: TimingMode;
  segmentation: Segmentation;
  settings: TimingSettings;
}

/** Saves the first version of a project (and its video copy) before any editing starts. */
export async function createProject(
  media: ImportedMedia,
  workflow: Workflow,
  content: NewProjectContent,
  style: SubtitleStyle,
): Promise<LoadedProject> {
  const m = media.metadata;
  const project: LoadedProject = {
    version: 1,
    id: newId(),
    name: baseName(media.filename) || "Untitled project",
    workflow,
    media: {
      id: media.id,
      filename: media.filename,
      duration_ms: m.duration_ms,
      width: m.width,
      height: m.height,
      has_audio: m.has_audio,
    },
    cues: content.cues.map((c) => ({ id: c.id, text: c.text, start_ms: c.start_ms, end_ms: c.end_ms })),
    style,
    timing: { mode: content.mode, segmentation: content.segmentation, settings: content.settings },
    media_available: true,
  };
  await saveProject(project);
  return project;
}
