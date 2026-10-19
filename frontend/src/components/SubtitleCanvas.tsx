import { useEffect, useRef, useState } from "react";
import type { ProjectCue, SubtitleStyle } from "../api/projects";
import { ensureFont } from "../engine/fonts/fonts";
import { drawSubtitles, displayText, visibleText } from "../engine/render/draw";
import type { StageSize } from "../lib/style";
import { activeCues } from "../lib/timeline";

interface Props {
  cues: ProjectCue[];
  tMs: number;
  style: SubtitleStyle;
  size: StageSize;
}

/**
 * Draws the subtitles at tMs with the shared renderer (the same one export will use). A hidden
 * copy of the current text keeps tests and assistive tools informed; the video is the content.
 */
export function SubtitleCanvas({ cues, tMs, style, size }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fontTick, setFontTick] = useState(0);
  const text = visibleText(cues, tMs, style);

  // Load the glyphs this text needs, then redraw once they are ready.
  useEffect(() => {
    let cancelled = false;
    void ensureFont(style.font_family, style.bold, text).then(() => {
      if (!cancelled) setFontTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [style.font_family, style.bold, text]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const w = Math.max(1, Math.round(size.w * dpr));
    const h = Math.max(1, Math.round(size.h * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null; // e.g. test environments without canvas
    }
    if (ctx) drawSubtitles(ctx, w, h, cues, tMs, style);
  }, [cues, tMs, style, size.w, size.h, fontTick]);

  const active = activeCues(cues, tMs).filter((c) => c.text.trim() !== "");
  return (
    <div className="subtitle-canvas" data-testid="subtitle-overlay" aria-hidden="true">
      <canvas ref={ref} className="subtitle-canvas__canvas" />
      <span className="visually-hidden">{active.map((c) => displayText(c.text, style)).join("\n")}</span>
    </div>
  );
}
