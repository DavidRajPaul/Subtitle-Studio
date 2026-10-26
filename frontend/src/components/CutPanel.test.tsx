import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectCue } from "../api/projects";
import { wholeVideo, type Range } from "../lib/cuts";
import { CutPanel, type CutChange } from "./CutPanel";

const CUES: ProjectCue[] = [
  { id: "a", text: "First line", start_ms: 0, end_ms: 1500 },
  { id: "b", text: "Middle line", start_ms: 4000, end_ms: 5000 },
  { id: "c", text: "Last line", start_ms: 8000, end_ms: 9000 },
];

let last: CutChange = { parts: wholeVideo(10_000), cues: CUES };
function Harness({ at = 0, simple = false }: { at?: number; simple?: boolean }) {
  const [state, setState] = useState<{ parts: Range[]; cues: ProjectCue[] }>({ parts: wholeVideo(10_000), cues: CUES });
  const [ms, setMs] = useState(at);
  last = state;
  return (
    <>
      <button type="button" onClick={() => { setMs(4500); }}>move to 4.5</button>
      <button type="button" onClick={() => { setMs(6000); }}>move to 6</button>
      <CutPanel simple={simple} parts={state.parts} originalMs={10_000} cues={state.cues} currentMs={ms} onSeek={vi.fn()} onChange={setState} />
    </>
  );
}

describe("Cut the video", () => {
  it("trims to typed times, asking first because subtitles would go, and can put the start back", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Keep from"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Keep until"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Trim" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask).toHaveTextContent("This also removes 2 subtitles: “First line”, “Last line”");
    fireEvent.click(within(ask).getByRole("button", { name: "Cut anyway" }));
    expect(last.parts).toEqual([{ start_ms: 3000, end_ms: 6000 }]);
    expect(last.cues).toEqual([{ ...CUES[1], start_ms: 1000, end_ms: 2000 }]);
    expect(screen.getByText(/The video is now 00:00:03.000 long/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Put back 00:00:00.000 to 00:00:03.000" }));
    expect(last.parts).toEqual([{ start_ms: 0, end_ms: 6000 }]);
    expect(last.cues[0]).toMatchObject({ start_ms: 4000, end_ms: 5000 });
  });

  it("keeps the subtitles when the person says no", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Keep from"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Trim" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep them" }));
    expect(last.parts).toEqual(wholeVideo(10_000));
    expect(last.cues).toEqual(CUES);
  });

  it("explains bad times", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Keep until"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Trim" }));
    expect(screen.getByRole("alert")).toHaveTextContent("past the end of the video");
    fireEvent.change(screen.getByLabelText("Keep until"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Trim" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("splits twice and deletes the middle part, moving later subtitles up", () => {
    render(<Harness at={3000} />);
    fireEvent.click(screen.getByRole("button", { name: "Split here" }));
    fireEvent.click(screen.getByRole("button", { name: "move to 6" }));
    fireEvent.click(screen.getByRole("button", { name: "Split here" }));
    expect(last.parts).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "move to 4.5" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete this part" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cut anyway" }));
    expect(last.parts).toEqual([
      { start_ms: 0, end_ms: 3000 },
      { start_ms: 6000, end_ms: 10_000 },
    ]);
    expect(last.cues.map((c) => [c.id, c.start_ms])).toEqual([
      ["a", 0],
      ["c", 5000],
    ]);
    expect(screen.getByText("Original 00:00:03.000 – 00:00:06.000 (3.0 s)")).toBeInTheDocument();
  });

  it("deletes after the playhead without asking when no subtitle is lost", () => {
    render(<Harness at={9500} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete after here" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(last.parts).toEqual([{ start_ms: 0, end_ms: 9500 }]);
  });

  it("Easy mode shows only trimming", () => {
    render(<Harness simple />);
    expect(screen.getByRole("heading", { name: "Trim the video" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Split here" })).not.toBeInTheDocument();
  });
});
