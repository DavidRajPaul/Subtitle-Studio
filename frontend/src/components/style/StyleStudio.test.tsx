import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { SubtitleStyle } from "../../api/projects";
import { FONT_CATALOG } from "../../engine/fonts/fonts";
import { LOOKS } from "../../engine/looks";
import { DEFAULT_STYLE } from "../../lib/style";
import { StyleStudio } from "./StyleStudio";

let last: SubtitleStyle = DEFAULT_STYLE;
function Harness() {
  const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);
  return (
    <StyleStudio
      style={style}
      onChange={(s) => {
        last = s;
        setStyle(s);
      }}
    />
  );
}

const tab = (name: string) => {
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(name) }));
};

describe("Style tools", () => {
  it("has the seven tabs and starts with Looks", () => {
    render(<Harness />);
    const tabs = within(screen.getByRole("tablist", { name: "Style tools" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent.replace(/[^A-Za-z]/g, ""))).toEqual(
      expect.arrayContaining(["TLooks", "Animation", "FfFont", "AASize", "Colour", "Align", "Spacing"]),
    );
    expect(within(screen.getByRole("radiogroup", { name: "Looks" })).getAllByRole("radio")).toHaveLength(LOOKS.length);
  });

  it("applies a look in one tap", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /Boxed/ }));
    expect(last.background.enabled).toBe(true);
    expect(screen.getByRole("radio", { name: /Boxed/ })).toHaveAttribute("aria-checked", "true");
  });

  it("sets in, out, loop and caption animations", () => {
    render(<Harness />);
    tab("Animation");
    fireEvent.click(screen.getByRole("radio", { name: "Fade" }));
    expect(last.animation.in).toBe("fade");
    fireEvent.change(screen.getByRole("textbox", { name: /Duration value/ }), { target: { value: "0.8" } });
    fireEvent.blur(screen.getByRole("textbox", { name: /Duration value/ }));
    expect(last.animation.in_ms).toBe(800);
    fireEvent.click(screen.getByRole("tab", { name: "Loop" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bounce" }));
    expect(last.animation.loop).toBe("bounce");
    fireEvent.click(screen.getByRole("tab", { name: "Caption" }));
    fireEvent.click(screen.getByRole("radio", { name: "Highlight" }));
    expect(last.animation.caption).toBe("highlight");
    expect(screen.getByRole("group", { name: "Highlight colour" })).toBeInTheDocument();
  });

  it("lists many fonts, filters Tamil ones, searches and picks", () => {
    render(<Harness />);
    tab("Font");
    const list = screen.getByRole("list", { name: "Fonts" });
    expect(within(list).getAllByRole("button").length).toBeGreaterThanOrEqual(FONT_CATALOG.length);
    fireEvent.click(screen.getByRole("radio", { name: "Tamil" }));
    expect(within(list).getAllByRole("button").length).toBe(FONT_CATALOG.filter((f) => f.group === "Tamil").length);
    fireEvent.change(screen.getByLabelText("Search fonts"), { target: { value: "mukta" } });
    fireEvent.click(within(list).getByRole("button", { name: /Mukta Malar/ }));
    expect(last.font_family).toBe("mukta-malar");
    fireEvent.click(screen.getByRole("button", { name: /Bold/ }));
    expect(last.bold).toBe(true);
  });

  it("refuses a file that is not a font", async () => {
    render(<Harness />);
    tab("Font");
    const input = document.querySelector<HTMLInputElement>('input[accept=".ttf,.otf,.woff,.woff2"]');
    if (!input) throw new Error("font input missing");
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.txt")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(".ttf, .otf");
  });

  it("sets size from presets and by typing", () => {
    render(<Harness />);
    tab("Size");
    fireEvent.click(screen.getByRole("button", { name: /Title/ }));
    expect(last.font_size).toBe(72);
    const box = screen.getByRole("textbox", { name: /Font size value/ });
    fireEvent.change(box, { target: { value: "500" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(last.font_size).toBe(200); // clamped to the allowed range
  });

  it("sets text, stroke, shadow and background colours with opacity", () => {
    render(<Harness />);
    tab("Colour");
    fireEvent.click(screen.getByRole("button", { name: "Text #FFD60A, outline #000000" }));
    expect([last.text_color, last.outline_color]).toEqual(["#FFD60A", "#000000"]);
    fireEvent.click(within(screen.getByRole("group", { name: "Text colour" })).getByRole("button", { name: "#E53935" }));
    expect(last.text_color).toBe("#E53935");
    fireEvent.click(screen.getByRole("tab", { name: "Background" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Background box" }));
    expect(last.background.enabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Shadow" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Blur \(glow\) value/ }), { target: { value: "20" } });
    fireEvent.blur(screen.getByRole("textbox", { name: /Blur \(glow\) value/ }));
    expect(last.shadow_blur_px).toBe(20);
  });

  it("sets alignment, position and spacing", () => {
    render(<Harness />);
    tab("Align");
    fireEvent.click(screen.getByRole("radio", { name: /Top/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Left/ }));
    expect([last.position, last.align]).toEqual(["top", "left"]);
    tab("Spacing");
    fireEvent.change(screen.getByRole("textbox", { name: /Letter spacing value/ }), { target: { value: "-2" } });
    fireEvent.blur(screen.getByRole("textbox", { name: /Letter spacing value/ }));
    fireEvent.click(screen.getByRole("radio", { name: "ALL CAPS" }));
    expect([last.letter_spacing_px, last.text_case]).toEqual([-2, "upper"]);
  });
});
