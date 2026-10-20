import { beforeEach, describe, expect, it } from "vitest";
import { getAll, PRESETS, putOne } from "../engine/db";
import { LOOKS } from "../engine/looks";
import { lastStyle, rememberLook, rememberPreset } from "../lib/prefs";
import { DEFAULT_STYLE } from "../lib/style";
import { freshDb } from "../test/freshDb";
import {
  deletePreset,
  findPreset,
  listPresets,
  presetNameProblem,
  renamePreset,
  resetPresetsForTests,
  sameStyle,
  savePreset,
  suggestName,
  updatePresetStyle,
} from "./presets";

beforeEach(freshDb);

const neon = LOOKS.find((l) => l.id === "neon")?.style ?? LOOKS[1].style;
const custom = { ...DEFAULT_STYLE, font_family: "Mukta Malar", font_size: 61, letter_spacing_px: 3, animation: { ...DEFAULT_STYLE.animation, in: "pop" as never } };

describe("presets", () => {
  it("saves every style setting under a name and keeps it after a reload", async () => {
    const style = { ...DEFAULT_STYLE, font_family: "Mukta Malar", font_size: 61, letter_spacing_px: 3, background: { ...DEFAULT_STYLE.background, enabled: true, radius_px: 12 } };
    const saved = await savePreset("  Tamil bold ", style);
    expect(saved.name).toBe("Tamil bold");
    resetPresetsForTests(); // as if the app was opened again
    const [again] = await listPresets();
    expect(again.name).toBe("Tamil bold");
    expect(sameStyle(again.style, style)).toBe(true);
  });

  it("refuses empty, too long and duplicate names (any letter case)", async () => {
    await savePreset("Neon", neon);
    const all = await listPresets();
    expect(presetNameProblem(" ", all)).toMatch(/Give the preset a name/);
    expect(presetNameProblem("x".repeat(41), all)).toMatch(/40 characters/);
    expect(presetNameProblem("neon", all)).toMatch(/already exists/);
    await expect(savePreset("NEON", DEFAULT_STYLE)).rejects.toThrow(/already exists/);
    expect(presetNameProblem("Neon", all, all[0].id)).toBeNull(); // renaming to itself
  });

  it("finds the preset that matches a style regardless of key order", async () => {
    const p = await savePreset("Mine", neon);
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(neon).reverse()))) as typeof neon;
    expect(findPreset(await listPresets(), reordered)?.id).toBe(p.id);
    expect(findPreset(await listPresets(), DEFAULT_STYLE)).toBeUndefined();
  });

  it("renames, replaces the style and deletes", async () => {
    const p = await savePreset("One", DEFAULT_STYLE);
    await renamePreset(p.id, "Two");
    await updatePresetStyle(p.id, neon);
    let [q] = await listPresets();
    expect(q.name).toBe("Two");
    expect(sameStyle(q.style, neon)).toBe(true);
    await deletePreset(p.id);
    expect(await listPresets()).toHaveLength(0);
    expect(await getAll(PRESETS)).toHaveLength(0);
    q = await savePreset("Two", DEFAULT_STYLE); // name is free again
    expect(q.name).toBe("Two");
  });

  it("does not change the saved preset when the video's style changes later", async () => {
    const style = structuredClone(DEFAULT_STYLE);
    await savePreset("Snapshot", style);
    style.font_size = 99;
    expect((await listPresets())[0].style.font_size).toBe(DEFAULT_STYLE.font_size);
  });

  it("fills in newer style options for an older preset and skips a damaged one", async () => {
    const old: Partial<typeof DEFAULT_STYLE> = structuredClone(DEFAULT_STYLE);
    delete old.animation;
    delete old.letter_spacing_px;
    await putOne(PRESETS, { id: "a", name: "Old", style: old, created_at: "2026-01-01", updated_at: "2026-01-01" });
    await putOne(PRESETS, { id: "b", name: "Broken", style: { font_size: "huge" }, created_at: "2026-01-02", updated_at: "2026-01-02" });
    const list = await listPresets();
    expect(list.map((p) => p.name)).toEqual(["Old"]);
    expect(list[0].style.animation).toEqual(DEFAULT_STYLE.animation);
  });

  it("suggests a free name", async () => {
    await savePreset("My style 1", DEFAULT_STYLE);
    expect(suggestName(await listPresets())).toBe("My style 2");
  });

  it("ignores an unknown animation value by refusing it", async () => {
    await expect(savePreset("Bad", custom)).rejects.toThrow();
  });

  it("starts new Easy projects with the preset chosen last, or the default look if it was deleted", async () => {
    const p = await savePreset("Last used", neon);
    rememberPreset(p.id);
    expect(await lastStyle()).toEqual(neon);
    await deletePreset(p.id);
    expect(await lastStyle()).toEqual(LOOKS[0].style);
    rememberLook(LOOKS[2].id);
    expect(await lastStyle()).toEqual(LOOKS[2].style);
  });
});
