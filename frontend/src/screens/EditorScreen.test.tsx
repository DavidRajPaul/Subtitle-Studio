import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/http";
import { saveProject, type LoadedProject } from "../api/projects";
import { DEFAULT_STYLE } from "../lib/style";
import { EditorScreen } from "./EditorScreen";

const PID = "11111111-1111-4111-8111-111111111111";

function project(overrides: Partial<LoadedProject> = {}): LoadedProject {
  return {
    version: 1,
    id: PID,
    name: "Demo",
    workflow: "text",
    media: {
      id: "22222222-2222-4222-8222-222222222222",
      filename: "clip.mp4",
      duration_ms: 12_000,
      width: 1280,
      height: 720,
      has_audio: false,
    },
    cues: [
      { id: "a", text: "வணக்கம்", start_ms: 0, end_ms: 2000 },
      { id: "b", text: "Second line", start_ms: 3000, end_ms: 5000 },
    ],
    style: DEFAULT_STYLE,
    timing: {
      mode: "readable",
      segmentation: "line",
      settings: { chars_per_second: 17, min_duration_ms: 1000, max_duration_ms: 7000, gap_ms: 100 },
    },
    media_available: true,
    ...overrides,
  };
}

interface Backend {
  puts: LoadedProject[];
  failSaves: boolean;
}

vi.mock("../api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/projects")>()),
  saveProject: vi.fn(),
}));

vi.mock("../api/media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/media")>()),
  loadMediaUrl: vi.fn(() => Promise.resolve("blob:clip")),
}));

function installBackend(): Backend {
  const state: Backend = { puts: [], failSaves: false };
  vi.mocked(saveProject).mockReset();
  vi.mocked(saveProject).mockImplementation((p) => {
    if (state.failSaves) {
      return Promise.reject(new ApiError("storage_full", "There is not enough free space."));
    }
    state.puts.push(structuredClone(p) as LoadedProject);
    return Promise.resolve();
  });
  return state;
}

function wideLayout() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

let backend: Backend;
beforeEach(() => {
  backend = installBackend();
  wideLayout();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const renderEditor = (p: LoadedProject = project()) =>
  render(<EditorScreen projectId={p.id} initial={p} onExit={vi.fn()} />);

describe("Editor", () => {
  it("shows the cue list and draws the active subtitle over the video", async () => {
    renderEditor();
    const list = screen.getByRole("list", { name: "Subtitles" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(await screen.findByTestId("subtitle-overlay")).toHaveTextContent("வணக்கம்");
  });

  it("saves numeric timing edits automatically, keeping the duration when Start changes", async () => {
    renderEditor();
    const start = screen.getByLabelText("Start");
    fireEvent.change(start, { target: { value: "00:00:01.000" } });
    fireEvent.keyDown(start, { key: "Enter" });
    await waitFor(() => {
      expect(backend.puts).toHaveLength(1);
    }, { timeout: 3000 });
    expect(backend.puts[0].cues[0]).toMatchObject({ id: "a", start_ms: 1000, end_ms: 3000 });
    expect(backend.puts[0].cues[1]).toMatchObject({ start_ms: 3000, end_ms: 5000 });
    expect(await screen.findByText("✓ Saved")).toBeInTheDocument();
  });

  it("explains an invalid time and saves nothing", async () => {
    renderEditor();
    const start = screen.getByLabelText("Start");
    fireEvent.change(start, { target: { value: "abc" } });
    fireEvent.keyDown(start, { key: "Enter" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 900));
    expect(backend.puts).toHaveLength(0);
  });

  it("saves text edits with Tamil and line breaks intact", async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "உலகம்\nவணக்கம்" } });
    await waitFor(() => {
      expect(backend.puts).toHaveLength(1);
    }, { timeout: 3000 });
    expect(backend.puts[0].cues[0].text).toBe("உலகம்\nவணக்கம்");
  });

  it("shows Could not save with a retry that works once the problem is fixed", async () => {
    backend.failSaves = true;
    renderEditor();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Changed" } });
    expect(await screen.findByText("Could not save", {}, { timeout: 3000 })).toBeInTheDocument();
    backend.failSaves = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("✓ Saved")).toBeInTheDocument();
    expect(backend.puts.at(-1)?.cues[0].text).toBe("Changed");
  });

  it("shows validation warnings in words and does not move any subtitle", async () => {
    const overlapping = project();
    overlapping.cues[1] = { ...overlapping.cues[1], start_ms: 1500 };
    renderEditor(overlapping);
    const list = screen.getByRole("list", { name: "Subtitles" });
    expect(
      await within(list).findByText(/starts at 00:00:01.500, before subtitle 1 ends at 00:00:02.000/),
    ).toBeInTheDocument();
    expect(within(list).getAllByText("Warning:").length).toBeGreaterThan(0);
    expect(backend.puts).toHaveLength(0);
  });

  it("asks before regenerating timing and keeps manual edits if cancelled", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate timing…" }));
    const dialog = screen.getByRole("dialog", { name: "Replace the timing of all subtitles?" });
    expect(dialog).toHaveTextContent("Any timing you set by hand will be lost");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(backend.puts).toHaveLength(0);
  });

  it("warns that regenerating loses the timing that came from speech", () => {
    renderEditor(project({ workflow: "speech", timing: { ...project().timing, mode: "manual" } }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate timing…" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("timed from the speech");
  });

  it("regenerates timing only after confirmation and keeps the text", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate timing…" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace timing" }));
    await waitFor(() => {
      expect(backend.puts).toHaveLength(1);
    }, { timeout: 3000 });
    const saved = backend.puts[0];
    expect(saved.cues.map((c) => c.text)).toEqual(["வணக்கம்", "Second line"]);
    // Readable duration with the defaults: both lines are short, so 1 s each with a 0.1 s gap.
    expect(saved.cues.map((c) => [c.start_ms, c.end_ms])).toEqual([
      [0, 1000],
      [1100, 2100],
    ]);
  });

  it("deletes a subtitle only after confirmation", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete this subtitle" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(backend.puts).toHaveLength(1);
    }, { timeout: 3000 });
    expect(backend.puts[0].cues.map((c) => c.id)).toEqual(["b"]);
  });

  it("keeps the subtitles visible and offers to relink when the video is missing", () => {
    renderEditor(project({ media_available: false }));
    expect(screen.getByRole("heading", { name: "The video for this project is missing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose the video again" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Subtitles" })).getAllByRole("listitem")).toHaveLength(2);
  });

  it("opens Export with the video and SRT choices", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const dialog = await screen.findByRole("dialog", { name: "Export" });
    expect(within(dialog).getByRole("heading", { name: "Video with subtitles (MP4)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download SRT" })).toBeEnabled();
  });

  it("still offers the SRT when the video is missing", async () => {
    renderEditor(project({ media_available: false }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const dialog = await screen.findByRole("dialog", { name: "Export" });
    expect(within(dialog).getByText(/video for this project is not on this device/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Make video" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download SRT" })).toBeEnabled();
  });
});
