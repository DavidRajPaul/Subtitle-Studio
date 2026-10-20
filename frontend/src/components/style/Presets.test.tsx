import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { SubtitleStyle } from "../../api/projects";
import { listPresets, savePreset } from "../../api/presets";
import { LOOKS } from "../../engine/looks";
import { DEFAULT_STYLE } from "../../lib/style";
import { freshDb } from "../../test/freshDb";
import { StyleStudio } from "./StyleStudio";

beforeEach(async () => {
  await freshDb();
  localStorage.clear();
});

let current: SubtitleStyle = DEFAULT_STYLE;
function Harness({ start = DEFAULT_STYLE }: { start?: SubtitleStyle }) {
  const [style, setStyle] = useState(start);
  current = style;
  return <StyleStudio style={style} onChange={setStyle} />;
}

describe("Presets", () => {
  it("offers Save as preset after an edit, asks for a name, then shows it as saved", async () => {
    render(<Harness />);
    expect(await screen.findByText(/No presets yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Size/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save as preset" }));
    const name = screen.getByLabelText("Preset name");
    expect(name).toHaveValue("My style 1");
    fireEvent.change(name, { target: { value: "Wedding" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
    expect(await screen.findByText("Wedding", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save as preset" })).not.toBeInTheDocument();
    const [p] = await listPresets();
    expect(p.name).toBe("Wedding");
    expect(p.style).toEqual(current);
  });

  it("refuses a name that is already used", async () => {
    await savePreset("Neon", LOOKS[1].style);
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Save as preset" }));
    fireEvent.change(screen.getByLabelText("Preset name"), { target: { value: "neon" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
    expect(screen.getByRole("alert")).toHaveTextContent("already exists");
    expect(await listPresets()).toHaveLength(1);
  });

  it("applies a preset to the current video with every style setting, including the font", async () => {
    const style = { ...LOOKS[2].style, font_family: "Mukta Malar", font_size: 70, letter_spacing_px: 4 };
    await savePreset("Tamil big", style);
    render(<Harness />);
    const group = await screen.findByRole("radiogroup", { name: "My presets" });
    fireEvent.click(within(group).getByRole("radio", { name: /Tamil big/ }));
    await waitFor(() => {
      expect(current).toEqual(style);
    });
    expect(within(group).getByRole("radio", { name: /Tamil big/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Tamil big", { selector: "strong" })).toBeInTheDocument();
    expect(localStorage.getItem("subtitle-studio.look")).toMatch(/^preset:/);
  });

  it("renames, replaces with the current style, and deletes after asking", async () => {
    await savePreset("First", DEFAULT_STYLE);
    render(<Harness start={LOOKS[3].style} />);
    fireEvent.click(await screen.findByRole("button", { name: "Options for First" }));
    const manage = screen.getByRole("region", { name: "Preset “First”" });
    fireEvent.change(within(manage).getByLabelText("Name"), { target: { value: "Renamed" } });
    fireEvent.click(within(manage).getByRole("button", { name: "Rename" }));
    expect(await screen.findByRole("radio", { name: /Renamed/ })).toBeInTheDocument();
    const m2 = await screen.findByRole("region", { name: "Preset “Renamed”" }); // stays open
    expect(within(m2).getByText("Renamed.")).toBeInTheDocument();
    fireEvent.click(within(m2).getByRole("button", { name: "Replace with the current style" }));
    await waitFor(async () => {
      expect((await listPresets())[0].style).toEqual(LOOKS[3].style);
    });
    fireEvent.click(within(m2).getByRole("button", { name: "Delete…" }));
    expect(within(m2).getByText(/Videos that already use this style keep it/)).toBeInTheDocument();
    fireEvent.click(within(m2).getByRole("button", { name: "Delete preset" }));
    expect(await screen.findByText(/No presets yet/)).toBeInTheDocument();
    expect(current).toEqual(LOOKS[3].style); // the video keeps its style
  });
});
