import type { ProjectCue } from "../api/projects";

/** Subtitles on screen at time t (start inclusive, end exclusive). Invalid ones never show. */
export function activeCues(cues: ProjectCue[], tMs: number): ProjectCue[] {
  return cues.filter((c) => c.end_ms > c.start_ms && c.start_ms <= tMs && tMs < c.end_ms);
}

/** Greedy lane assignment so overlapping subtitles never hide each other on the timeline. */
export function assignLanes(cues: ProjectCue[]): number[] {
  const order = cues.map((_, i) => i).sort((a, b) => cues[a].start_ms - cues[b].start_ms || a - b);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(cues.length).fill(0);
  for (const i of order) {
    let lane = laneEnds.findIndex((end) => end <= cues[i].start_ms);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = cues[i].end_ms;
    lanes[i] = lane;
  }
  return lanes;
}

const STEPS_S = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

/** Smallest "nice" tick step (ms) that keeps ticks at least minPx apart. */
export function tickStepMs(pxPerSec: number, minPx = 64): number {
  const step = STEPS_S.find((s) => s * pxPerSec >= minPx) ?? STEPS_S[STEPS_S.length - 1];
  return Math.round(step * 1000);
}

export const msToPx = (ms: number, pxPerSec: number): number => (ms / 1000) * pxPerSec;
export const pxToMs = (px: number, pxPerSec: number): number => Math.round((px / pxPerSec) * 1000);

/** Snap to a grid (default 10 ms) so dragged times stay tidy. */
export const snapMs = (ms: number, grid = 10): number => Math.round(ms / grid) * grid;
