import { send } from "./http";
import type { Segmentation, TimingIssue, TimingMode, TimingSettings } from "./subtitles";
import type { Workflow } from "../types";

export interface BackgroundStyle {
  enabled: boolean;
  color: string;
  opacity: number;
}

/** One global style. font_size is in pixels for a 1080-pixel-tall video and is scaled. */
export interface SubtitleStyle {
  font_family: string;
  font_size: number;
  text_color: string;
  bold: boolean;
  italic: boolean;
  outline_color: string;
  outline_px: number;
  shadow: boolean;
  background: BackgroundStyle;
  position: "top" | "middle" | "bottom";
  align: "left" | "center" | "right";
  safe_margin_pct: number;
  vertical_offset_px: number;
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

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function listProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
  const body = await send<{ projects?: unknown }>("/api/projects", { signal });
  return Array.isArray(body.projects) ? (body.projects as ProjectSummary[]) : [];
}

export function getProject(id: string, signal?: AbortSignal): Promise<LoadedProject> {
  return send<LoadedProject>(`/api/projects/${encodeURIComponent(id)}`, { signal });
}

export async function saveProject(project: Project): Promise<void> {
  // media_available is a read-only hint from the server and is never part of the saved file.
  const doc: Record<string, unknown> = { ...project };
  delete doc.media_available;
  await send(`/api/projects/${encodeURIComponent(project.id)}`, { method: "PUT", ...json(doc) });
}

export async function deleteProject(id: string): Promise<void> {
  await send(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function validateCues(
  cues: ProjectCue[],
  durationMs: number,
  settings: TimingSettings,
  signal?: AbortSignal,
): Promise<TimingIssue[]> {
  const body = await send<{ issues: TimingIssue[] }>("/api/timing/validate", {
    method: "POST",
    signal,
    ...json({ cues, duration_ms: durationMs, settings }),
  });
  return body.issues;
}

export const mediaFileUrl = (mediaId: string): string =>
  `/api/media/${encodeURIComponent(mediaId)}/file`;
