/** TXT decoding and segmentation (line, paragraph, sentence) — the browser engine. */
import { ApiError } from "../api/http";
import { codePoints, isSpace, pyLen, splitWs, strip } from "./py";

export const MAX_TXT_BYTES = 2 * 1024 * 1024;
export const MAX_SEGMENTS = 5000;
export type Segmentation = "line" | "paragraph" | "sentence";

const TERMINATORS = ".!?…。！？।॥";
const CJK_TERMINATORS = "。！？";
const CLOSERS = "\"'”’)]»」』";
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "e.g", "i.e"]);
const LEADING_QUOTES = /^["'“‘([]+/u;

export function decodeText(raw: Uint8Array): string {
  if ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff)) {
    throw new ApiError(
      "not_utf8",
      "This text file is saved as UTF-16. Open it in a text editor and save it again " +
        "as UTF-8 (in Notepad: File > Save As > Encoding: UTF-8).",
    );
  }
  if (raw.includes(0)) {
    throw new ApiError(
      "not_text",
      "This does not look like a plain text file. Choose a .txt script.",
    );
  }
  let text: string;
  try {
    // fatal: refuse invalid bytes; the default ignoreBOM=false removes a UTF-8 BOM.
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new ApiError(
      "not_utf8",
      "This text file is not saved as UTF-8, so some characters could not be read. " +
        "Open it in a text editor and save it again as UTF-8 " +
        "(in Notepad: File > Save As > Encoding: UTF-8).",
    );
  }
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function paragraphs(text: string): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    const stripped = strip(line);
    if (stripped) current.push(stripped);
    else if (current.length > 0) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function isAbbreviation(before: string): boolean {
  const words = splitWs(before);
  const last = words.at(-1);
  if (last === undefined) return false;
  const word = last.replace(LEADING_QUOTES, "").toLowerCase();
  if (ABBREVIATIONS.has(word)) return true;
  const lastChar = codePoints(last).at(-1) ?? "";
  return pyLen(word) === 1 && /^[a-z]$/.test(word) && /^[A-Z]$/.test(lastChar);
}

export function splitSentences(input: string): string[] {
  const text = codePoints(input); // indexed like a Python string
  const out: string[] = [];
  const n = text.length;
  let start = 0;
  let i = 0;
  while (i < n) {
    if (!TERMINATORS.includes(text[i])) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < n && (TERMINATORS.includes(text[j]) || CLOSERS.includes(text[j]))) j += 1;
    const run = text.slice(i, j);
    let boundary = j >= n || isSpace(text[j]) || run.some((c) => CJK_TERMINATORS.includes(c));
    if (boundary && run.join("") === "." && isAbbreviation(text.slice(start, i).join(""))) {
      boundary = false;
    }
    if (boundary) {
      const sentence = strip(text.slice(start, j).join(""));
      if (sentence) out.push(sentence);
      start = j;
    }
    i = j;
  }
  const tail = strip(text.slice(start).join(""));
  if (tail) out.push(tail);
  return out;
}

export function segmentText(text: string, mode: Segmentation): string[] {
  const groups = paragraphs(text);
  let segments: string[];
  if (mode === "line") segments = groups.flat();
  else if (mode === "paragraph") segments = groups.map((g) => g.join("\n"));
  // Hard-wrapped lines inside a paragraph are joined with spaces before splitting.
  else segments = groups.flatMap((g) => splitSentences(g.join(" ")));
  if (segments.length === 0) {
    throw new ApiError("empty_text", "No text was found in this file. Add some text and try again.");
  }
  if (segments.length > MAX_SEGMENTS) {
    throw new ApiError(
      "too_many_segments",
      `This script has ${String(segments.length)} subtitles; the limit is ${String(MAX_SEGMENTS)}. ` +
        "Split it into smaller files.",
    );
  }
  return segments;
}
