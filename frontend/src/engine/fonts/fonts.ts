/**
 * The font library: free fonts bundled with the site (Google Fonts via Fontsource, OFL-1.1 /
 * Apache-2.0) plus fonts the user adds, kept in this browser. Fonts load only when used, and a
 * Tamil and a Devanagari font are always behind the chosen one so those letters never show as
 * boxes when a Latin-only font is picked.
 */
import rawCatalog from "./catalog.json";
import { deleteOne, FONTS, getAll, putOne } from "../db";

export interface FontFaceFile {
  weight: number;
  subset: string;
  file: string;
  unicodeRange: string | null;
}

export interface FontEntry {
  id: string;
  family: string;
  group: string;
  scripts: string[];
  weights: number[];
  license: string;
  faces: FontFaceFile[];
}

export interface CustomFontRecord {
  id: string;
  name: string;
  type: string;
  blob: Blob;
}

export const FONT_CATALOG = rawCatalog as FontEntry[];
export const FONT_GROUPS = ["Tamil", "Sans", "Display", "Script", "Serif", "Mono"] as const;
const BY_ID = new Map(FONT_CATALOG.map((f) => [f.id, f]));

/** The original three choices, kept so earlier projects look the same. */
const SYSTEM = new Map<string, { label: string; css: string; generic: string }>([
  ["sans", { label: "System Sans", css: 'system-ui, -apple-system, "Segoe UI", Roboto', generic: "sans-serif" }],
  ["serif", { label: "System Serif", css: 'Georgia, "Times New Roman"', generic: "serif" }],
  ["mono", { label: "System Mono", css: 'ui-monospace, Menlo, Consolas, "Courier New"', generic: "monospace" }],
]);
export const SYSTEM_FONTS = [...SYSTEM.entries()].map(([id, v]) => ({ id, label: v.label }));

const FALLBACKS = ["noto-sans-tamil", "noto-sans-devanagari"];
const TAMIL = /[஀-௿]/;
const DEVANAGARI = /[ऀ-ॿ]/;

export const fontEntry = (id: string) => BY_ID.get(id);
export const isCustomFont = (id: string) => id.startsWith("custom:");
const familyOf = (id: string) => (isCustomFont(id) ? `SSU ${id.slice(7)}` : `SS ${BY_ID.get(id)?.family ?? id}`);

let customNames = new Map<string, string>();

export function fontLabel(id: string): string {
  const system = SYSTEM.get(id);
  if (system) return system.label;
  if (isCustomFont(id)) return customNames.get(id) ?? "Added font";
  return BY_ID.get(id)?.family ?? id;
}

/** CSS / canvas font-family list for a style's font, with Tamil and Hindi fallbacks. */
export function fontFamilyList(id: string): string {
  const fallbacks = FALLBACKS.map((f) => `"${familyOf(f)}"`).join(", ");
  const system = SYSTEM.get(id);
  if (system) return `${system.css}, ${fallbacks}, ${system.generic}`;
  return `"${familyOf(id)}", ${fallbacks}, sans-serif`;
}

const registered = new Set<string>();
const fontsApi = (): FontFaceSet | null =>
  typeof document !== "undefined" && "fonts" in document && typeof FontFace !== "undefined" ? document.fonts : null;

function registerCatalog(id: string): void {
  const entry = BY_ID.get(id);
  const api = fontsApi();
  if (!entry || !api || registered.has(id)) return;
  registered.add(id);
  for (const face of entry.faces) {
    const descriptors: FontFaceDescriptors = { weight: String(face.weight), display: "swap" };
    if (face.unicodeRange) descriptors.unicodeRange = face.unicodeRange;
    api.add(new FontFace(familyOf(id), `url(${import.meta.env.BASE_URL}fonts/${face.file})`, descriptors));
  }
}

async function registerCustom(id: string): Promise<boolean> {
  const api = fontsApi();
  if (!api) return false;
  if (registered.has(id)) return true;
  const record = (await getAll<CustomFontRecord>(FONTS)).find((f) => `custom:${f.id}` === id);
  if (!record) return false;
  const face = new FontFace(familyOf(id), await record.blob.arrayBuffer());
  await face.load();
  api.add(face);
  registered.add(id);
  customNames.set(id, record.name);
  return true;
}

/** Makes sure the glyphs needed for `text` are loaded; resolves false if a font is missing. */
export async function ensureFont(id: string, bold: boolean, text: string): Promise<boolean> {
  const api = fontsApi();
  if (!api) return true;
  let ok = true;
  if (isCustomFont(id)) ok = await registerCustom(id).catch(() => false);
  else registerCatalog(id);
  const needs = [id];
  if (TAMIL.test(text)) needs.push("noto-sans-tamil");
  if (DEVANAGARI.test(text)) needs.push("noto-sans-devanagari");
  for (const f of needs.slice(1)) registerCatalog(f);
  const weight = bold ? 700 : 400;
  try {
    await Promise.all(
      needs
        .filter((f) => !SYSTEM.has(f))
        .map((f) => api.load(`${String(weight)} 32px "${familyOf(f)}"`, text || "Aa")),
    );
  } catch {
    ok = false;
  }
  return ok;
}

/** Loads the Latin face of a font for showing its name in the picker. */
export function previewFont(id: string): void {
  if (isCustomFont(id)) {
    void registerCustom(id).catch(() => false);
    return;
  }
  registerCatalog(id);
  const api = fontsApi();
  if (api && BY_ID.has(id)) void api.load(`400 20px "${familyOf(id)}"`, "Aa").catch(() => undefined);
}

export function previewFamily(id: string): string {
  const system = SYSTEM.get(id);
  return system ? `${system.css}, ${system.generic}` : `"${familyOf(id)}", sans-serif`;
}

// ---- Fonts the user adds -------------------------------------------------------------------

const FONT_TYPES = /\.(ttf|otf|woff2?)$/i;
export const MAX_FONT_BYTES = 15 * 1024 * 1024;

export async function listCustomFonts(): Promise<{ id: string; name: string }[]> {
  try {
    const records = await getAll<CustomFontRecord>(FONTS);
    customNames = new Map(records.map((r) => [`custom:${r.id}`, r.name]));
    return records.map((r) => ({ id: `custom:${r.id}`, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Checks the file really is a font before keeping it. Returns the new font id. */
export async function addCustomFont(file: File): Promise<string> {
  if (!FONT_TYPES.test(file.name)) throw new Error("Choose a font file ending in .ttf, .otf, .woff or .woff2.");
  if (file.size === 0 || file.size > MAX_FONT_BYTES) throw new Error("This font file is empty or larger than 15 MB.");
  const bytes = await file.arrayBuffer();
  try {
    await new FontFace("SS font check", bytes).load();
  } catch {
    throw new Error("This file could not be read as a font. Try another file.");
  }
  const id = crypto.randomUUID();
  const name = file.name.replace(FONT_TYPES, "").replace(/[-_]+/g, " ").trim() || "My font";
  await putOne(FONTS, { id, name, type: file.type, blob: new Blob([bytes], { type: file.type || "font/ttf" }) });
  customNames.set(`custom:${id}`, name);
  return `custom:${id}`;
}

export async function removeCustomFont(id: string): Promise<void> {
  await deleteOne(FONTS, id.replace(/^custom:/, ""));
  customNames.delete(id);
}

// ---- Recently used (a convenience kept in this browser) -----------------------------------

const RECENT_KEY = "subtitle-studio.fonts.recent";
export function recentFonts(): string[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}
export function rememberFont(id: string): void {
  try {
    const next = [id, ...recentFonts().filter((f) => f !== id)].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not available here.
  }
}
