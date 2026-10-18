/** Timecodes are integer milliseconds everywhere; strings are only for display/input. */

const pad = (n: number, width: number) => String(n).padStart(width, "0");

export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

export type ParseResult = { ok: true; ms: number } | { ok: false; error: string };

const FORMAT_HINT = "Use HH:MM:SS.mmm, MM:SS or seconds, for example 00:01:05.250 or 65.25.";

/** Accepts "SS[.mmm]", "MM:SS[.mmm]" or "HH:MM:SS[.mmm]". */
export function parseTimecode(input: string): ParseResult {
  const text = input.trim();
  const match = /^(?:(\d+):)?(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/.exec(text);
  if (!match) return { ok: false, error: FORMAT_HINT };
  // Optional capture groups are undefined when absent, which RegExpExecArray's type omits.
  const [, a, b, s, frac] = match as unknown as [
    string,
    string | undefined,
    string | undefined,
    string,
    string | undefined,
  ];
  // With two colon groups, the first is hours; with one, it is minutes.
  const hours = b !== undefined ? Number(a) : 0;
  const minutes = b !== undefined ? Number(b) : a !== undefined ? Number(a) : 0;
  const seconds = Number(s);
  if ((a !== undefined || b !== undefined) && seconds >= 60) {
    return { ok: false, error: "Seconds must be below 60 when minutes are given." };
  }
  if (b !== undefined && minutes >= 60) {
    return { ok: false, error: "Minutes must be below 60 when hours are given." };
  }
  const millis = frac ? Number(frac.padEnd(3, "0")) : 0;
  return { ok: true, ms: ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis };
}
