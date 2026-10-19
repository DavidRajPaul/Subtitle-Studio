import { useEffect, useRef, useState } from "react";
import type { SubtitleStyle } from "../../api/projects";
import { ensureFont } from "../../engine/fonts/fonts";
import { drawSubtitles } from "../../engine/render/draw";

const SAMPLE = [{ id: "s", text: "வணக்கம் Hello", start_ms: 0, end_ms: 4000 }];

/**
 * Sizes are a share of the frame height, so a tiny frame would show tiny text. For the still,
 * every size is enlarged by the same factor so the look keeps its proportions but is readable.
 */
export function thumbStyle(style: SubtitleStyle): SubtitleStyle {
  const k = 230 / style.font_size;
  const r = (v: number) => Math.round(v * k);
  return {
    ...style,
    font_size: 230,
    outline_px: r(style.outline_px),
    shadow_blur_px: r(style.shadow_blur_px),
    shadow_offset_px: r(style.shadow_offset_px),
    letter_spacing_px: r(style.letter_spacing_px),
    background: { ...style.background, padding_px: r(style.background.padding_px), radius_px: r(style.background.radius_px) },
    position: "middle",
    vertical_offset_px: 0,
    safe_margin_pct: 3,
    max_width_pct: 98,
  };
}

/** A small still of a style, drawn by the same renderer as the video. */
export function LookThumb({ style, at = 2600 }: { style: SubtitleStyle; at?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void ensureFont(style.font_family, style.bold, SAMPLE[0].text).then(() => {
      if (!cancelled) setReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [style.font_family, style.bold]);
  useEffect(() => {
    const canvas = ref.current;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas?.getContext("2d") ?? null;
    } catch {
      ctx = null;
    }
    if (!canvas || !ctx) return;
    drawSubtitles(ctx, canvas.width, canvas.height, SAMPLE, at, thumbStyle(style));
  }, [style, at, ready]);
  return <canvas ref={ref} className="look-thumb" width={320} height={180} aria-hidden="true" />;
}
