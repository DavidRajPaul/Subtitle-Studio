/**
 * Splits 16 kHz mono audio into windows Whisper can handle (at most 30 s), cutting at the
 * quietest moment near each boundary so words are not chopped, and skipping windows that are
 * silent (Whisper tends to invent text for silence). Pure and deterministic.
 */

export const SAMPLE_RATE = 16_000;

export interface AudioWindow {
  start: number; // sample index, inclusive
  end: number; // sample index, exclusive
  silent: boolean;
}

const FRAME = 1600; // 100 ms

function rms(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  const end = Math.min(to, samples.length);
  for (let i = from; i < end; i++) sum += samples[i] * samples[i];
  return end > from ? Math.sqrt(sum / (end - from)) : 0;
}

/** Below about -54 dBFS a window is treated as silence. */
export const SILENCE_RMS = 0.002;

export function planWindows(
  samples: Float32Array,
  maxSeconds = 30,
  searchSeconds = 5,
  rate = SAMPLE_RATE,
): AudioWindow[] {
  const max = Math.floor(maxSeconds * rate);
  const search = Math.floor(searchSeconds * rate);
  const windows: AudioWindow[] = [];
  let start = 0;
  while (start < samples.length) {
    let end = Math.min(samples.length, start + max);
    if (end < samples.length) {
      // Quietest 100 ms frame in the last `searchSeconds` of the window; cut in its middle.
      let best = end;
      let bestLevel = Infinity;
      for (let f = end - FRAME; f >= Math.max(start + FRAME, end - search); f -= FRAME) {
        const level = rms(samples, f, f + FRAME);
        if (level < bestLevel) {
          bestLevel = level;
          best = f + FRAME / 2;
        }
      }
      end = best;
    }
    windows.push({ start, end, silent: rms(samples, start, end) < SILENCE_RMS });
    start = end;
  }
  return windows;
}
