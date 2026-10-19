import { describe, expect, it } from "vitest";
import { checkProject } from "./projectSchema";
import { FONT_CATALOG } from "./fonts/fonts";
import { LOOKS } from "./looks";
import { DEFAULT_STYLE } from "../lib/style";

const project = (style: unknown) => ({
  version: 1,
  id: "11111111-1111-4111-8111-111111111111",
  name: "x",
  workflow: "text",
  media: { id: "22222222-2222-4222-8222-222222222222", filename: "a.mp4", duration_ms: 1000, width: 1, height: 1, has_audio: false },
  cues: [],
  style,
});

describe("looks and style rules", () => {
  it("every look is a valid style and uses a bundled font", () => {
    const ids = new Set(FONT_CATALOG.map((f) => f.id));
    for (const look of LOOKS) {
      expect(() => checkProject(project(look.style)), look.id).not.toThrow();
      expect(ids.has(look.style.font_family), look.id).toBe(true);
    }
  });

  it("older projects without the new options keep their look and get defaults", () => {
    const old = { font_family: "sans", font_size: 60, text_color: "#FFFFFF", bold: true, italic: false, outline_color: "#000000", outline_px: 2, shadow: true, background: { enabled: true, color: "#000000", opacity: 0.6 }, position: "top", align: "center", safe_margin_pct: 5, vertical_offset_px: 0 };
    const style = checkProject(project(old)).style;
    expect(style).toMatchObject({ font_family: "sans", font_size: 60, position: "top", text_opacity: 1, letter_spacing_px: 0 });
    expect(style.animation).toEqual(DEFAULT_STYLE.animation);
    expect(style.background.padding_px).toBe(DEFAULT_STYLE.background.padding_px);
  });

  it("refuses out-of-range new values", () => {
    expect(() => checkProject(project({ ...DEFAULT_STYLE, letter_spacing_px: 99 }))).toThrow();
    expect(() => checkProject(project({ ...DEFAULT_STYLE, animation: { ...DEFAULT_STYLE.animation, in: "explode" } }))).toThrow();
  });

  it("the font catalog has Tamil fonts with Tamil glyph files", () => {
    const tamil = FONT_CATALOG.filter((f) => f.group === "Tamil");
    expect(tamil.length).toBeGreaterThanOrEqual(10);
    for (const f of tamil) expect(f.faces.some((x) => x.subset === "tamil"), f.id).toBe(true);
    expect(FONT_CATALOG.every((f) => ["OFL-1.1", "Apache-2.0"].includes(f.license))).toBe(true);
  });
});
