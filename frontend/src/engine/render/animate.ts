/** Animation maths for one subtitle at time t: pure, deterministic, shared with export. */
import type { AnimationStyle } from "../../api/projects";

export interface AnimState {
  alpha: number;
  scale: number;
  rotateDeg: number;
  dx: number; // in units of the font size
  dy: number;
  /** 0..1 share of the text shown from the left (reveal / gradient wipes), or 1 when not wiping. */
  wipe: number;
  /** Soft edge for the gradient wipe (share of width), 0 for a hard edge. */
  wipeSoftness: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
export const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

function apply(kind: AnimationStyle["in"], p: number, s: AnimState): void {
  // p: 0 = fully hidden, 1 = fully shown.
  const e = easeOutCubic(p);
  switch (kind) {
    case "fade":
      s.alpha *= e;
      break;
    case "scale":
      s.alpha *= clamp01(p * 2);
      s.scale *= 0.6 + 0.4 * easeOutBack(p);
      break;
    case "spin":
      s.alpha *= e;
      s.rotateDeg += -90 * (1 - e);
      s.scale *= 0.7 + 0.3 * e;
      break;
    case "slide":
      s.alpha *= e;
      s.dy += 0.8 * (1 - e);
      break;
    case "reveal":
      s.wipe = Math.min(s.wipe, e);
      break;
    case "gradient":
      s.wipe = Math.min(s.wipe, e);
      s.wipeSoftness = 0.35;
      break;
    case "none":
      break;
  }
}

export function animState(anim: AnimationStyle, startMs: number, endMs: number, tMs: number): AnimState {
  const s: AnimState = { alpha: 1, scale: 1, rotateDeg: 0, dx: 0, dy: 0, wipe: 1, wipeSoftness: 0 };
  const duration = Math.max(1, endMs - startMs);
  // In and out never take more than half the subtitle each.
  const inMs = Math.min(anim.in_ms, duration / 2);
  const outMs = Math.min(anim.out_ms, duration / 2);
  const since = tMs - startMs;
  const until = endMs - tMs;
  if (anim.in !== "none" && since < inMs) apply(anim.in, clamp01(since / inMs), s);
  if (anim.out !== "none" && until < outMs) apply(anim.out, clamp01(until / outMs), s);
  const phase = (since / 1000) * 2 * Math.PI; // one cycle per second
  switch (anim.loop) {
    case "pulse":
      s.scale *= 1 + 0.05 * Math.sin(phase);
      break;
    case "bounce":
      s.dy -= 0.18 * Math.abs(Math.sin(phase / 1.2));
      break;
    case "float":
      s.dy += 0.08 * Math.sin(phase / 2);
      break;
    case "shake":
      s.dx += 0.04 * Math.sin(phase * 6);
      break;
    case "wobble":
      s.rotateDeg += 3 * Math.sin(phase);
      break;
    case "none":
      break;
  }
  return s;
}
