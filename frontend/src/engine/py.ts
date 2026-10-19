/**
 * Small helpers that reproduce Python's string and number behaviour exactly, so the browser
 * engine gives the same results (and messages) as the original Python engine.
 */

/** Characters Python's str.isspace() treats as whitespace (differs slightly from JS \s). */
const WS = "\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const WS_ONE = new RegExp(`^[${WS}]$`, "u");
const WS_LEFT = new RegExp(`^[${WS}]+`, "u");
const WS_RIGHT = new RegExp(`[${WS}]+$`, "u");
const WS_RUN = new RegExp(`[${WS}]+`, "u");

export const isSpace = (ch: string): boolean => WS_ONE.test(ch);
export const strip = (s: string): string => s.replace(WS_LEFT, "").replace(WS_RIGHT, "");
/** Python's str.split() with no arguments. */
export const splitWs = (s: string): string[] => {
  const t = strip(s);
  return t === "" ? [] : t.split(WS_RUN);
};

/** Length in code points, like Python's len() (an emoji counts once). */
export const pyLen = (s: string): number => codePoints(s).length;

/** Code points, the unit Python strings are indexed by (deliberately not grapheme clusters). */
export const codePoints = (s: string): string[] => Array.from(s);

/** Python's round() for a value that is exactly representable: ties go to even. */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** f"{ms / 1000:.1f}" — exact ties (ms ≡ 250 mod 500) round to even like Python. */
export function secondsOneDecimal(ms: number): string {
  if (Number.isInteger(ms) && ((ms % 500) + 500) % 500 === 250) {
    const tenths = roundHalfEven(ms / 100);
    return (tenths / 10).toFixed(1);
  }
  return (ms / 1000).toFixed(1);
}

/** f"{num / den:.0f}" for positive integers, with Python's ties-to-even. */
export function ratioNoDecimals(num: number, den: number): string {
  if ((2 * num) % den === 0) {
    const twice = (2 * num) / den;
    if (twice % 2 === 1) return String(roundHalfEven(twice / 2));
  }
  return (num / den).toFixed(0);
}

/** f"{x:g}" for the modest numbers used in messages. */
export function formatG(x: number): string {
  return String(Number(x.toPrecision(6)));
}

/** Integer floor division for non-negative values (Python //). */
export const floorDiv = (a: number, b: number): number => Math.floor(a / b);
