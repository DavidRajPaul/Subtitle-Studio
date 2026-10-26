/**
 * The versioned project document (version 1), checked the same way the Python backend's
 * pydantic model did: missing optional fields get defaults, anything out of range is refused.
 */
import type { Project, SubtitleStyle } from "../api/projects";
import { partsProblem } from "../lib/cuts";
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

const IN_ANIMS = ["none", "fade", "scale", "spin", "slide", "reveal", "gradient"] as const;
const LOOP_ANIMS = ["none", "pulse", "bounce", "float", "shake", "wobble"] as const;
const CAPTION_ANIMS = ["none", "highlight", "pop", "word"] as const;

function hex(v: unknown, what: string): string {
  if (typeof v !== "string" || !HEX.test(v)) fail(what);
  return v;
}

/** A complete, checked style (missing newer fields get defaults); throws ProjectSchemaError. */
export function checkStyle(raw: unknown): SubtitleStyle {
  const s: Rec = { ...DEFAULT_STYLE, ...(isRec(raw) ? raw : {}) };
  const bg: Rec = { ...DEFAULT_STYLE.background, ...(isRec(s.background) ? s.background : {}) };
  const an: Rec = { ...DEFAULT_STYLE.animation, ...(isRec(s.animation) ? s.animation : {}) };
  if (!isStr(s.font_family, 80, 1)) fail("style.font_family");
  if (!isInt(s.font_size, 8, 200)) fail("style.font_size");
  for (const k of ["bold", "italic", "shadow"] as const) if (typeof s[k] !== "boolean") fail(`style.${k}`);
  if (!oneOf(s.text_case, ["none", "upper"] as const)) fail("style.text_case");
  for (const k of ["text_opacity", "outline_opacity", "shadow_opacity"] as const) {
    if (!isNum(s[k], 0, 1)) fail(`style.${k}`);
  }
  if (!isInt(s.outline_px, 0, 20)) fail("style.outline_px");
  if (!isInt(s.shadow_blur_px, 0, 60)) fail("style.shadow_blur_px");
  if (!isInt(s.shadow_offset_px, 0, 30)) fail("style.shadow_offset_px");
  if (typeof bg.enabled !== "boolean") fail("style.background.enabled");
  if (!isNum(bg.opacity, 0, 1)) fail("style.background.opacity");
  if (!isInt(bg.padding_px, 0, 80)) fail("style.background.padding_px");
  if (!isInt(bg.radius_px, 0, 80)) fail("style.background.radius_px");
  if (!oneOf(s.position, ["top", "middle", "bottom"] as const)) fail("style.position");
  if (!oneOf(s.align, ["left", "center", "right"] as const)) fail("style.align");
  if (!isInt(s.safe_margin_pct, 0, 25)) fail("style.safe_margin_pct");
  if (!isInt(s.vertical_offset_px, -300, 300)) fail("style.vertical_offset_px");
  if (!isInt(s.max_width_pct, 30, 100)) fail("style.max_width_pct");
  if (!isInt(s.letter_spacing_px, -10, 40)) fail("style.letter_spacing_px");
  if (!isInt(s.line_spacing_pct, -30, 150)) fail("style.line_spacing_pct");
  if (!oneOf(an.in, IN_ANIMS)) fail("style.animation.in");
  if (!oneOf(an.out, IN_ANIMS)) fail("style.animation.out");
  if (!oneOf(an.loop, LOOP_ANIMS)) fail("style.animation.loop");
  if (!oneOf(an.caption, CAPTION_ANIMS)) fail("style.animation.caption");
  if (!isInt(an.in_ms, 50, 3000) || !isInt(an.out_ms, 50, 3000)) fail("style.animation duration");
  return {
    font_family: s.font_family,
    font_size: s.font_size,
    text_color: hex(s.text_color, "style.text_color"),
    text_opacity: s.text_opacity as number, // checked above
    bold: s.bold as boolean,
    italic: s.italic as boolean,
    text_case: s.text_case,
    outline_color: hex(s.outline_color, "style.outline_color"),
    outline_px: s.outline_px,
    outline_opacity: s.outline_opacity as number, // checked above
    shadow: s.shadow as boolean,
    shadow_color: hex(s.shadow_color, "style.shadow_color"),
    shadow_opacity: s.shadow_opacity as number, // checked above
    shadow_blur_px: s.shadow_blur_px,
    shadow_offset_px: s.shadow_offset_px,
    background: {
      enabled: bg.enabled,
      color: hex(bg.color, "style.background.color"),
      opacity: bg.opacity,
      padding_px: bg.padding_px,
      radius_px: bg.radius_px,
    },
    position: s.position,
    align: s.align,
    safe_margin_pct: s.safe_margin_pct,
    vertical_offset_px: s.vertical_offset_px,
    max_width_pct: s.max_width_pct,
    letter_spacing_px: s.letter_spacing_px,
    line_spacing_pct: s.line_spacing_pct,
    animation: {
      in: an.in,
      out: an.out,
      loop: an.loop,
      caption: an.caption,
      in_ms: an.in_ms,
      out_ms: an.out_ms,
      highlight_color: hex(an.highlight_color, "style.animation.highlight_color"),
    },
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
  let parts: { start_ms: number; end_ms: number }[] | undefined;
  if (raw.parts !== undefined) {
    if (!Array.isArray(raw.parts) || raw.parts.length > 10_000) fail("parts");
    parts = raw.parts.map((p: unknown, i) => {
      if (!isRec(p) || !isInt(p.start_ms, 0, BOUND) || !isInt(p.end_ms, 0, BOUND)) fail(`parts[${String(i)}]`);
      return { start_ms: p.start_ms, end_ms: p.end_ms };
    });
    const problem = partsProblem(parts, m.duration_ms);
    if (problem) fail(`parts: ${problem}`);
  }
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
    ...(parts ? { parts } : {}),
    cues,
    style: checkStyle(raw.style),
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
