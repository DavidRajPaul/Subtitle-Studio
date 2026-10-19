/**
 * Draws subtitles onto a canvas at time t. This one function is the preview and will be the
 * export renderer, so what you see is what the exported video gets.
 */
import type { ProjectCue, SubtitleStyle } from "../../api/projects";
import { hexToRgba, REFERENCE_HEIGHT } from "../../lib/style";
import { activeCues } from "../../lib/timeline";
import { fontFamilyList } from "../fonts/fonts";
import { animState } from "./animate";
import { graphemes, wordTimes, wrapText, type WordTime } from "./layout";

type Ctx = CanvasRenderingContext2D;

export function displayText(text: string, style: SubtitleStyle): string {
  return style.text_case === "upper" ? text.toLocaleUpperCase() : text;
}

export function canvasFont(style: SubtitleStyle, px: number): string {
  return `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${px.toFixed(2)}px ${fontFamilyList(style.font_family)}`;
}

const hasNativeSpacing = (ctx: Ctx) => "letterSpacing" in ctx;

function setSpacing(ctx: Ctx, px: number): void {
  if (hasNativeSpacing(ctx)) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${px.toFixed(2)}px`;
}

/** Width of text including letter spacing (also where the browser lacks native support). */
function measureWith(ctx: Ctx, spacing: number): (t: string) => number {
  if (spacing === 0 || hasNativeSpacing(ctx)) return (t) => ctx.measureText(t).width;
  return (t) => graphemes(t).reduce((w, g) => w + ctx.measureText(g).width + spacing, 0);
}

/** Draws a run of text; per-grapheme when spacing must be emulated (keeps Tamil clusters whole). */
function paintRun(ctx: Ctx, text: string, x: number, y: number, spacing: number, mode: "fill" | "stroke"): void {
  if (spacing === 0 || hasNativeSpacing(ctx)) {
    if (mode === "fill") ctx.fillText(text, x, y);
    else ctx.strokeText(text, x, y);
    return;
  }
  let cx = x;
  for (const g of graphemes(text)) {
    if (mode === "fill") ctx.fillText(g, cx, y);
    else ctx.strokeText(g, cx, y);
    cx += ctx.measureText(g).width + spacing;
  }
}

interface Piece {
  text: string;
  x: number;
  width: number;
  color: string;
  scale: number;
  visible: boolean;
}

interface Laid {
  lines: { pieces: Piece[]; y: number; width: number; x: number }[];
  box: { x: number; y: number; w: number; h: number };
  px: number;
}

function layout(ctx: Ctx, cue: ProjectCue, t: number, style: SubtitleStyle, w: number, h: number): Laid {
  const scale = h / REFERENCE_HEIGHT;
  const px = style.font_size * scale;
  const spacing = style.letter_spacing_px * scale;
  ctx.font = canvasFont(style, px);
  setSpacing(ctx, spacing);
  const measure = measureWith(ctx, spacing);
  const pad = style.background.enabled ? style.background.padding_px * scale : 0;
  const margin = (w * style.safe_margin_pct) / 100;
  const maxWidth = Math.max(px, Math.min((w * style.max_width_pct) / 100, w - 2 * margin) - 2 * pad);
  const text = displayText(cue.text, style);
  const lines = wrapText(text, maxWidth, measure);
  const lineHeight = px * (1.25 + style.line_spacing_pct / 100);
  const caption = style.animation.caption;
  const words: WordTime[] = caption === "none" ? [] : wordTimes(text, cue.start_ms, cue.end_ms);
  let wordIndex = 0;
  const textColor = hexToRgba(style.text_color, style.text_opacity);
  const highlight = hexToRgba(style.animation.highlight_color, style.text_opacity);
  const spaceW = measure(" ");
  const laidLines = lines.map((line, i) => {
    const pieces: Piece[] = [];
    if (caption === "none") {
      pieces.push({ text: line, x: 0, width: measure(line), color: textColor, scale: 1, visible: true });
    } else {
      let x = 0;
      for (const word of line.split(/\s+/).filter(Boolean)) {
        const wt = words[wordIndex] as WordTime | undefined;
        wordIndex += 1;
        const spoken = wt ? t >= wt.start : true;
        const current = wt ? t >= wt.start && t < wt.end : false;
        const width = measure(word);
        pieces.push({
          text: word,
          x,
          width,
          color: (caption === "highlight" && spoken) || (caption === "pop" && current) ? highlight : textColor,
          scale: caption === "pop" && current ? 1.18 : 1,
          visible: caption !== "word" || spoken,
        });
        x += width + spaceW;
      }
    }
    const last = pieces.at(-1);
    const width = last ? last.x + last.width : 0;
    return { pieces, y: i * lineHeight, width, x: 0 };
  });
  const blockW = Math.max(0, ...laidLines.map((l) => l.width));
  const blockH = lines.length * lineHeight;
  const marginY = (h * style.safe_margin_pct) / 100;
  const offset = style.vertical_offset_px * scale;
  const top =
    style.position === "top"
      ? marginY + pad
      : style.position === "middle"
        ? (h - blockH) / 2
        : h - marginY - pad - blockH;
  const left =
    style.align === "left" ? margin + pad : style.align === "right" ? w - margin - pad - blockW : (w - blockW) / 2;
  for (const l of laidLines) {
    l.x = style.align === "left" ? left : style.align === "right" ? left + blockW - l.width : left + (blockW - l.width) / 2;
    l.y += top + offset;
  }
  return {
    lines: laidLines,
    box: { x: left - pad, y: top + offset - pad, w: blockW + 2 * pad, h: blockH + 2 * pad },
    px,
  };
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function paintBlock(ctx: Ctx, laid: Laid, style: SubtitleStyle, scale: number): void {
  const { box, px } = laid;
  if (style.background.enabled) {
    ctx.fillStyle = hexToRgba(style.background.color, style.background.opacity);
    roundRect(ctx, box.x, box.y, box.w, box.h, style.background.radius_px * scale);
    ctx.fill();
  }
  const spacing = style.letter_spacing_px * scale;
  ctx.font = canvasFont(style, px);
  setSpacing(ctx, spacing);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  const ascent = px * 0.95; // baseline within a 1.25 line box
  const outline = style.outline_px * scale;
  for (const line of laid.lines) {
    for (const piece of line.pieces) {
      if (!piece.visible || piece.text === "") continue;
      const x = line.x + piece.x;
      const y = line.y + ascent;
      ctx.save();
      if (piece.scale !== 1) {
        const cx = x + piece.width / 2;
        const cy = line.y + px * 0.6;
        ctx.translate(cx, cy);
        ctx.scale(piece.scale, piece.scale);
        ctx.translate(-cx, -cy);
      }
      const shadowOn = style.shadow && style.shadow_opacity > 0;
      const setShadow = (on: boolean) => {
        ctx.shadowColor = on ? hexToRgba(style.shadow_color, style.shadow_opacity) : "transparent";
        ctx.shadowBlur = on ? style.shadow_blur_px * scale : 0;
        ctx.shadowOffsetX = on ? style.shadow_offset_px * scale * 0.5 : 0;
        ctx.shadowOffsetY = on ? style.shadow_offset_px * scale : 0;
      };
      if (outline > 0 && style.outline_opacity > 0) {
        setShadow(shadowOn);
        ctx.strokeStyle = hexToRgba(style.outline_color, style.outline_opacity);
        ctx.lineWidth = outline * 2;
        paintRun(ctx, piece.text, x, y, spacing, "stroke");
        setShadow(false);
      } else setShadow(shadowOn);
      ctx.fillStyle = piece.color;
      paintRun(ctx, piece.text, x, y, spacing, "fill");
      ctx.restore();
    }
  }
}

let scratch: HTMLCanvasElement | null = null;

/**
 * Draws every subtitle active at tMs. Size is in canvas pixels. The preview clears first; the
 * export draws on top of the video frame already on the canvas (`clear: false`).
 */
export function drawSubtitles(
  ctx: Ctx,
  width: number,
  height: number,
  cues: ProjectCue[],
  tMs: number,
  style: SubtitleStyle,
  options: { clear?: boolean } = {},
): void {
  if (options.clear ?? true) ctx.clearRect(0, 0, width, height);
  const scale = height / REFERENCE_HEIGHT;
  for (const cue of activeCues(cues, tMs)) {
    if (cue.text.trim() === "") continue;
    const laid = layout(ctx, cue, tMs, style, width, height);
    const a = animState(style.animation, cue.start_ms, cue.end_ms, tMs);
    if (a.alpha <= 0.001 || a.wipe <= 0.001) continue;
    const cx = laid.box.x + laid.box.w / 2;
    const cy = laid.box.y + laid.box.h / 2;
    const transform = (c: Ctx) => {
      c.translate(cx + a.dx * laid.px, cy + a.dy * laid.px);
      c.rotate((a.rotateDeg * Math.PI) / 180);
      c.scale(a.scale, a.scale);
      c.translate(-cx, -cy);
    };
    if (a.wipe < 1 && a.wipeSoftness > 0 && typeof document !== "undefined") {
      // Gradient wipe: draw into a scratch canvas, then fade its right edge out.
      scratch ??= document.createElement("canvas");
      scratch.width = width;
      scratch.height = height;
      const s = scratch.getContext("2d");
      if (!s) continue;
      s.clearRect(0, 0, width, height);
      s.save();
      transform(s);
      paintBlock(s, laid, style, scale);
      s.restore();
      const edge = laid.box.x + laid.box.w * a.wipe * (1 + a.wipeSoftness);
      const soft = laid.box.w * a.wipeSoftness;
      const g = s.createLinearGradient(edge - soft, 0, edge, 0);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      s.globalCompositeOperation = "destination-in";
      s.fillStyle = g;
      s.fillRect(0, 0, width, height);
      s.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.globalAlpha = a.alpha;
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.globalAlpha = a.alpha;
    if (a.wipe < 1) {
      ctx.beginPath();
      ctx.rect(laid.box.x - laid.px, 0, (laid.box.w + 2 * laid.px) * a.wipe, height);
      ctx.clip();
    }
    transform(ctx);
    paintBlock(ctx, laid, style, scale);
    ctx.restore();
  }
}

/** Every font-relevant piece of text currently on screen (for loading glyphs before drawing). */
export function visibleText(cues: ProjectCue[], tMs: number, style: SubtitleStyle): string {
  return activeCues(cues, tMs)
    .map((c) => displayText(c.text, style))
    .join(" ");
}
