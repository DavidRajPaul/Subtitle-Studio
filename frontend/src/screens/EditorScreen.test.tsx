import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedProject } from "../api/projects";
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Backend {
  puts: LoadedProject[];
  generateCalls: number;
  failSaves: boolean;
  issues: { code: string; message: string; cue_number: number | null }[];
}

function installBackend(): Backend {
  const state: Backend = { puts: [], generateCalls: 0, failSaves: false, issues: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/projects/") && method === "PUT") {
        if (state.failSaves) {
          return Promise.resolve(
            json({ detail: { code: "write_failed", message: "Check free space." } }, 500),
          );
        }
        state.puts.push(JSON.parse(init?.body as string) as LoadedProject);
        return Promise.resolve(json({ id: PID, updated_at: "now" }));
      }
      if (url === "/api/timing/validate") return Promise.resolve(json({ issues: state.issues }));
      if (url === "/api/timing/generate") {
        state.generateCalls += 1;
        return Promise.resolve(
          json({
            cues: [
              { id: "x", index: 1, text: "ignored", start_ms: 500, end_ms: 1500 },
              { id: "y", index: 2, text: "ignored", start_ms: 6000, end_ms: 9000 },
            ],
            issues: [],
            summary: {},
          }),
        );
      }
      return Promise.reject(new TypeError(`unexpected ${method} ${url}`));
    }),
  );
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
  it("shows the cue list and draws the active subtitle over the video", () => {
    renderEditor();
    const list = screen.getByRole("list", { name: "Subtitles" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByTestId("subtitle-overlay")).toHaveTextContent("வணக்கம்");
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
    expect(backend.puts[0]).not.toHaveProperty("media_available");
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
    backend.issues = [{ code: "overlap", message: "Overlaps subtitle 1 by 0.5 s.", cue_number: 2 }];
    renderEditor();
    const list = screen.getByRole("list", { name: "Subtitles" });
    expect(await within(list).findByText(/Overlaps subtitle 1/)).toBeInTheDocument();
    expect(within(list).getByText("Warning:")).toBeInTheDocument();
    expect(backend.puts).toHaveLength(0);
  });

  it("asks before regenerating timing and keeps manual edits if cancelled", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate timing…" }));
    const dialog = screen.getByRole("dialog", { name: "Replace the timing of all subtitles?" });
    expect(dialog).toHaveTextContent("Any timing you set by hand will be lost");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(backend.generateCalls).toBe(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(backend.puts).toHaveLength(0);
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
    expect(saved.cues.map((c) => [c.start_ms, c.end_ms])).toEqual([
      [500, 1500],
      [6000, 9000],
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

  it("explains why Export is not available yet", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: /Export/ })).toBeDisabled();
  });
});
