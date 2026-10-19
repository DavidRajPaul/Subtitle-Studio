/**
 * The versioned project document (version 1), checked the same way the Python backend's
 * pydantic model did: missing optional fields get defaults, anything out of range is refused.
 */
import type { Project, SubtitleStyle } from "../api/projects";
import { DEFAULT_STYLE } from "../lib/style";
import { MAX_SEGMENTS } from "./text";
import { DEFAULT_SETTINGS } from "./timing";

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[0-9a-fA-F-]{32,36}$/;
const BOUND = 1_000_000_000;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const isStr = (v: unknown, max: number, min = 0): v is string =>
  typeof v === "string" && v.length >= min && v.length <= max;
const oneOf = <T extends string>(v: unknown, options: readonly T[]): v is T =>
  typeof v === "string" && (options as readonly string[]).includes(v);

export class ProjectSchemaError extends Error {}

function fail(what: string): never {
  throw new ProjectSchemaError(what);
}

function style(raw: unknown): SubtitleStyle {
  const s: Rec = { ...DEFAULT_STYLE, ...(isRec(raw) ? raw : {}) };
  const bg: Rec = { ...DEFAULT_STYLE.background, ...(isRec(s.background) ? s.background : {}) };
  if (!isStr(s.font_family, 40)) fail("style.font_family");
  if (!isInt(s.font_size, 8, 200)) fail("style.font_size");
  for (const k of ["text_color", "outline_color"] as const) {
    if (typeof s[k] !== "string" || !HEX.test(s[k])) fail(`style.${k}`);
  }
  for (const k of ["bold", "italic", "shadow"] as const) if (typeof s[k] !== "boolean") fail(`style.${k}`);
  if (!isInt(s.outline_px, 0, 12)) fail("style.outline_px");
  if (typeof bg.enabled !== "boolean") fail("style.background.enabled");
  if (typeof bg.color !== "string" || !HEX.test(bg.color)) fail("style.background.color");
  if (!isNum(bg.opacity, 0, 1)) fail("style.background.opacity");
  if (!oneOf(s.position, ["top", "middle", "bottom"] as const)) fail("style.position");
  if (!oneOf(s.align, ["left", "center", "right"] as const)) fail("style.align");
  if (!isInt(s.safe_margin_pct, 0, 25)) fail("style.safe_margin_pct");
  if (!isInt(s.vertical_offset_px, -300, 300)) fail("style.vertical_offset_px");
  return {
    font_family: s.font_family,
    font_size: s.font_size,
    text_color: s.text_color as string,
    bold: s.bold as boolean,
    italic: s.italic as boolean,
    outline_color: s.outline_color as string,
    outline_px: s.outline_px,
    shadow: s.shadow as boolean,
    background: { enabled: bg.enabled, color: bg.color, opacity: bg.opacity },
    position: s.position,
    align: s.align,
    safe_margin_pct: s.safe_margin_pct,
    vertical_offset_px: s.vertical_offset_px,
  };
}

/** Returns a clean, complete version-1 project, or throws ProjectSchemaError. */
export function checkProject(raw: unknown): Project {
  if (!isRec(raw)) fail("not an object");
  if (raw.version !== 1) fail("version");
  if (typeof raw.id !== "string" || !ID.test(raw.id)) fail("id");
  if (!isStr(raw.name, 120, 1)) fail("name");
  if (!oneOf(raw.workflow, ["speech", "text"] as const)) fail("workflow");
  for (const k of ["created_at", "updated_at"] as const) {
    if (raw[k] !== undefined && raw[k] !== null && typeof raw[k] !== "string") fail(k);
  }
  const m = raw.media;
  if (!isRec(m)) fail("media");
  if (typeof m.id !== "string" || !ID.test(m.id)) fail("media.id");
  if (!isStr(m.filename, 255)) fail("media.filename");
  if (!isInt(m.duration_ms, 1, Number.MAX_SAFE_INTEGER)) fail("media.duration_ms");
  if (!isInt(m.width, 0, Number.MAX_SAFE_INTEGER) || !isInt(m.height, 0, Number.MAX_SAFE_INTEGER)) {
    fail("media size");
  }
  if (typeof m.has_audio !== "boolean") fail("media.has_audio");
  if (!Array.isArray(raw.cues) || raw.cues.length > MAX_SEGMENTS) fail("cues");
  const cues = raw.cues.map((c: unknown, i) => {
    if (!isRec(c)) fail(`cues[${String(i)}]`);
    if (!isStr(c.id, 64, 1) || !isStr(c.text, 5000)) fail(`cues[${String(i)}]`);
    if (!isInt(c.start_ms, -BOUND, BOUND) || !isInt(c.end_ms, -BOUND, BOUND)) fail(`cues[${String(i)}]`);
    return { id: c.id, text: c.text, start_ms: c.start_ms, end_ms: c.end_ms };
  });
  const t: Rec = isRec(raw.timing) ? raw.timing : {};
  const mode = t.mode ?? "readable";
  const segmentation = t.segmentation ?? "line";
  if (!oneOf(mode, ["equal", "readable", "fit", "manual"] as const)) fail("timing.mode");
  if (!oneOf(segmentation, ["line", "paragraph", "sentence"] as const)) fail("timing.segmentation");
  const st: Rec = { ...DEFAULT_SETTINGS, ...(isRec(t.settings) ? t.settings : {}) };
  if (!isNum(st.chars_per_second, Number.MIN_VALUE, 60)) fail("timing.settings.chars_per_second");
  if (!isInt(st.min_duration_ms, 1, 60_000)) fail("timing.settings.min_duration_ms");
  if (!isInt(st.max_duration_ms, 1, 600_000)) fail("timing.settings.max_duration_ms");
  if (!isInt(st.gap_ms, 0, 5000)) fail("timing.settings.gap_ms");
  return {
    version: 1,
    id: raw.id,
    name: raw.name,
    workflow: raw.workflow,
    created_at: (raw.created_at as string | null | undefined) ?? null,
    updated_at: (raw.updated_at as string | null | undefined) ?? null,
    media: {
      id: m.id,
      filename: m.filename,
      duration_ms: m.duration_ms,
      width: m.width,
      height: m.height,
      has_audio: m.has_audio,
    },
    cues,
    style: style(raw.style),
    timing: {
      mode,
      segmentation,
      settings: {
        chars_per_second: st.chars_per_second,
        min_duration_ms: st.min_duration_ms,
        max_duration_ms: st.max_duration_ms,
        gap_ms: st.gap_ms,
      },
    },
  };
}
