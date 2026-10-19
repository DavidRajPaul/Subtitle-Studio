import type { CSSProperties } from "react";
import type { SubtitleStyle } from "../api/projects";

export const REFERENCE_HEIGHT = 1080;

export const FONT_OPTIONS = [
  {
    key: "sans",
    label: "System Sans",
    css: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Tamil", sans-serif',
  },
  { key: "serif", label: "Serif", css: 'Georgia, "Times New Roman", "Noto Serif", serif' },
  { key: "mono", label: "Monospace", css: 'ui-monospace, Menlo, Consolas, "Courier New", monospace' },
] as const;

export const DEFAULT_STYLE: SubtitleStyle = {
  font_family: "sans",
  font_size: 48,
  text_color: "#FFFFFF",
  bold: false,
  italic: false,
  outline_color: "#000000",
  outline_px: 2,
  shadow: true,
  background: { enabled: false, color: "#000000", opacity: 0.6 },
  position: "bottom",
  align: "center",
  safe_margin_pct: 5,
  vertical_offset_px: 0,
};

export function fontCss(key: string): string {
  return (FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0]).css;
}

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

/** Container that positions the subtitle block inside the video frame. */
export function overlayBlockStyle(style: SubtitleStyle, size: StageSize): CSSProperties {
  const scale = size.h / REFERENCE_HEIGHT;
  const marginY = (size.h * style.safe_margin_pct) / 100;
  const marginX = (size.w * style.safe_margin_pct) / 100;
  const justify = { top: "flex-start", middle: "center", bottom: "flex-end" }[style.position];
  return {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: justify,
    alignItems: { left: "flex-start", center: "center", right: "flex-end" }[style.align],
    padding: `${String(marginY)}px ${String(marginX)}px`,
    transform: `translateY(${String(style.vertical_offset_px * scale)}px)`,
    pointerEvents: "none",
    textAlign: style.align,
  };
}

/** One subtitle's text. The same style model will drive the renderer in the export phase. */
export function overlayTextStyle(style: SubtitleStyle, size: StageSize): CSSProperties {
  const scale = size.h / REFERENCE_HEIGHT;
  const css: CSSProperties = {
    fontFamily: fontCss(style.font_family),
    fontSize: `${String(style.font_size * scale)}px`,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    color: style.text_color,
    lineHeight: 1.25,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    maxWidth: "100%",
  };
  if (style.outline_px > 0) {
    css.WebkitTextStroke = `${String(style.outline_px * scale * 2)}px ${style.outline_color}`;
    css.paintOrder = "stroke fill";
  }
  if (style.shadow) {
    css.textShadow = `0 ${String(2 * scale)}px ${String(4 * scale)}px rgba(0, 0, 0, 0.85)`;
  }
  if (style.background.enabled) {
    css.background = hexToRgba(style.background.color, style.background.opacity);
    css.padding = `${String(0.1 * style.font_size * scale)}px ${String(0.4 * style.font_size * scale)}px`;
    css.borderRadius = `${String(0.15 * style.font_size * scale)}px`;
  }
  return css;
}
