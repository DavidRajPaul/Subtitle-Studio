import type { SubtitleStyle } from "../api/projects";

/** Style sizes are pixels for a frame this tall; they scale with the video. */
export const REFERENCE_HEIGHT = 1080;

/**
 * Defaults for every style field. The original fields keep their first values, so projects
 * saved before the new options existed look exactly the same.
 */
export const DEFAULT_STYLE: SubtitleStyle = {
  font_family: "sans",
  font_size: 48,
  text_color: "#FFFFFF",
  text_opacity: 1,
  bold: false,
  italic: false,
  text_case: "none",
  outline_color: "#000000",
  outline_px: 2,
  outline_opacity: 1,
  shadow: true,
  shadow_color: "#000000",
  shadow_opacity: 0.85,
  shadow_blur_px: 4,
  shadow_offset_px: 2,
  background: { enabled: false, color: "#000000", opacity: 0.6, padding_px: 12, radius_px: 8 },
  position: "bottom",
  align: "center",
  safe_margin_pct: 5,
  vertical_offset_px: 0,
  max_width_pct: 90,
  letter_spacing_px: 0,
  line_spacing_pct: 0,
  animation: {
    in: "none",
    out: "none",
    loop: "none",
    caption: "none",
    in_ms: 400,
    out_ms: 300,
    highlight_color: "#FFD60A",
  },
};

export function hexToRgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

export interface StageSize {
  w: number;
  h: number;
}
