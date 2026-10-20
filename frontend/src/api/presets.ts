/**
 * Named style presets, kept in this browser (IndexedDB) like projects. A preset holds a whole
 * subtitle style: font, size, colours, stroke, shadow, box, position, spacing and animations.
 */
import { deleteOne, getAll, PRESETS, putOne } from "../engine/db";
import { checkStyle } from "../engine/projectSchema";
import { newId } from "./http";
import type { SubtitleStyle } from "./projects";

export interface Preset {
  id: string;
  name: string;
  style: SubtitleStyle;
  created_at: string;
  updated_at: string;
}

export const MAX_PRESET_NAME = 40;

export class PresetError extends Error {}

/** Key-order-independent comparison, so equal styles always match. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
export const sameStyle = (a: SubtitleStyle, b: SubtitleStyle) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export const findPreset = (presets: Preset[], style: SubtitleStyle) => presets.find((p) => sameStyle(p.style, style));

/** null if the name can be used, otherwise what to tell the person. */
export function presetNameProblem(name: string, presets: Preset[], exceptId?: string): string | null {
  const clean = name.trim();
  if (!clean) return "Give the preset a name.";
  if (clean.length > MAX_PRESET_NAME) return `Use ${String(MAX_PRESET_NAME)} characters or fewer.`;
  const taken = presets.some((p) => p.id !== exceptId && p.name.toLocaleLowerCase() === clean.toLocaleLowerCase());
  return taken ? `A preset called “${clean}” already exists. Choose another name.` : null;
}

/** A free default name: "My style 1", "My style 2", … */
export function suggestName(presets: Preset[]): string {
  for (let n = presets.length + 1; ; n++) {
    const name = `My style ${String(n)}`;
    if (!presetNameProblem(name, presets)) return name;
  }
}

// ---- Shared, live list ----------------------------------------------------------------------

let cache: Preset[] | null = null;
const listeners = new Set<(p: Preset[]) => void>();
const sorted = (list: Preset[]) => [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));

function publish(next: Preset[]): Preset[] {
  const list = sorted(next);
  cache = list;
  for (const l of listeners) l(list);
  return list;
}

export async function listPresets(): Promise<Preset[]> {
  if (cache) return cache;
  const raw = await getAll<unknown>(PRESETS);
  const good: Preset[] = [];
  for (const r of raw) {
    try {
      const p = r as Preset;
      if (typeof p.id === "string" && typeof p.name === "string") good.push({ ...p, style: checkStyle(p.style) });
    } catch {
      // A damaged preset is skipped rather than breaking the list.
    }
  }
  return publish(good);
}

export function subscribePresets(fn: (p: Preset[]) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function current(): Promise<Preset[]> {
  return cache ?? listPresets();
}

export async function savePreset(name: string, style: SubtitleStyle): Promise<Preset> {
  const all = await current();
  const problem = presetNameProblem(name, all);
  if (problem) throw new PresetError(problem);
  const now = new Date().toISOString();
  const preset: Preset = { id: newId(), name: name.trim(), style: checkStyle(structuredClone(style)), created_at: now, updated_at: now };
  await putOne(PRESETS, preset);
  publish([...all, preset]);
  return preset;
}

async function change(id: string, patch: (p: Preset) => Preset): Promise<Preset> {
  const all = await current();
  const old = all.find((p) => p.id === id);
  if (!old) throw new PresetError("This preset no longer exists.");
  const next = { ...patch(old), updated_at: new Date().toISOString() };
  await putOne(PRESETS, next);
  publish(all.map((p) => (p.id === id ? next : p)));
  return next;
}

export async function renamePreset(id: string, name: string): Promise<Preset> {
  const problem = presetNameProblem(name, await current(), id);
  if (problem) throw new PresetError(problem);
  return change(id, (p) => ({ ...p, name: name.trim() }));
}

export function updatePresetStyle(id: string, style: SubtitleStyle): Promise<Preset> {
  return change(id, (p) => ({ ...p, style: checkStyle(structuredClone(style)) }));
}

export async function deletePreset(id: string): Promise<void> {
  const all = await current();
  await deleteOne(PRESETS, id);
  publish(all.filter((p) => p.id !== id));
}

export async function getPreset(id: string): Promise<Preset | undefined> {
  return (await current()).find((p) => p.id === id);
}

/** For tests. */
export function resetPresetsForTests(): void {
  cache = null;
  listeners.clear();
}
