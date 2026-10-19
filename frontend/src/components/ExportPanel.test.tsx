import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setExportEngineForTests, type ExportEngine } from "../api/export";
import { ApiError } from "../api/http";
import type { Project } from "../api/projects";
import { DEFAULT_STYLE } from "../lib/style";
import { ExportPanel } from "./ExportPanel";

vi.mock("../api/media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/media")>()),
  loadMediaBlob: vi.fn(() => Promise.resolve(new Blob([new Uint8Array(8)], { type: "video/mp4" }))),
}));

const download = vi.fn();
vi.mock("../lib/saveFile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/saveFile")>()),
  downloadFile: (...args: unknown[]) => {
    download(...args);
  },
  canShareFile: () => false,
}));

const project = (overrides: Partial<Project> = {}): Project => ({
  version: 1,
  id: "p1",
  name: "Holiday clip",
  workflow: "text",
  media: { id: "m1", filename: "holiday.mp4", duration_ms: 10_000, width: 1280, height: 720, has_audio: true },
  cues: [
    { id: "a", text: "வணக்கம்", start_ms: 0, end_ms: 2000 },
    { id: "b", text: "Hello", start_ms: 2500, end_ms: 4000 },
  ],
  style: DEFAULT_STYLE,
  timing: {
    mode: "readable",
    segmentation: "line",
    settings: { chars_per_second: 17, min_duration_ms: 1000, max_duration_ms: 7000, gap_ms: 100 },
  },
  ...overrides,
});

interface Fake extends ExportEngine {
  calls: Parameters<ExportEngine["exportVideo"]>[0][];
  gate: Promise<void> | null;
  fail: Error | null;
  ok: boolean;
}

let fake: Fake;
beforeEach(() => {
  download.mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:out"), revokeObjectURL: vi.fn() }));
  fake = {
    calls: [],
    gate: null,
    fail: null,
    ok: true,
    supported: () => fake.ok,
    exportVideo: async (options) => {
      fake.calls.push(options);
      options.onProgress({ fraction: 0.4, message: "Making your video · about 1 minute left" });
      if (fake.gate) {
        await Promise.race([
          fake.gate,
          new Promise<never>((_, reject) => {
            options.signal.addEventListener("abort", () => {
              reject(new DOMException("Cancelled", "AbortError"));
            });
          }),
        ]);
      }
      if (fake.fail) throw fake.fail;
      return {
        blob: new Blob([new Uint8Array(2048)], { type: "video/mp4" }),
        codec: "vp9",
        width: 1280,
        height: 720,
        durationMs: 10_000,
        hasAudio: true,
        notes: ["This browser could not use H.264, so the video uses VP9."],
      };
    },
  };
  setExportEngineForTests(fake);
});
afterEach(() => {
  setExportEngineForTests(null);
  vi.unstubAllGlobals();
});

describe("Export", () => {
  it("says the original is not changed and nothing is uploaded", () => {
    render(<ExportPanel project={project()} />);
    expect(screen.getByText(/original video is not changed/)).toBeInTheDocument();
    expect(screen.getByText(/nothing is uploaded/)).toBeInTheDocument();
  });

  it("downloads an SRT named after the project, never the original file", async () => {
    render(<ExportPanel project={project()} />);
    fireEvent.click(screen.getByRole("button", { name: "Download SRT" }));
    expect(download).toHaveBeenCalledTimes(1);
    const [file, name] = download.mock.calls[0] as [File, string];
    expect(name).toBe("Holiday clip - subtitles.srt");
    expect(name).not.toBe("holiday.mp4");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.readAsText(file);
    });
    expect(text).toContain("00:00:00,000 --> 00:00:02,000\r\nவணக்கம்");
  });

  it("makes the video with progress, then shows the checked result and the codec note", async () => {
    let release: () => void = () => undefined;
    fake.gate = new Promise<void>((r) => {
      release = r;
    });
    render(<ExportPanel project={project()} />);
    fireEvent.click(screen.getByRole("button", { name: "Make video" }));
    expect(await screen.findByRole("progressbar", { name: "Export progress" })).toHaveValue(40);
    expect(screen.getByText(/about 1 minute left \(40%\)/)).toBeInTheDocument();
    expect(screen.getByText("Keep this screen open.")).toBeInTheDocument();
    release();
    expect(await screen.findByText(/ready and checked: 0:10, 1280×720/)).toBeInTheDocument();
    expect(screen.getByText(/uses VP9/)).toBeInTheDocument();
    expect(fake.calls[0].cues).toHaveLength(2);
    expect(fake.calls[0].style).toBe(DEFAULT_STYLE);
    fireEvent.click(screen.getByRole("button", { name: "Download video" }));
    expect((download.mock.calls[0] as [File, string])[1]).toBe("Holiday clip - subtitles.mp4");
  });

  it("can be cancelled and says nothing was saved", async () => {
    fake.gate = new Promise<void>(() => undefined);
    render(<ExportPanel project={project()} />);
    fireEvent.click(screen.getByRole("button", { name: "Make video" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Export cancelled. Nothing was saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("explains a failure and still offers the SRT", async () => {
    fake.fail = new ApiError("export_invalid", "The new video lost its sound. Nothing was saved; try again.");
    render(<ExportPanel project={project()} />);
    fireEvent.click(screen.getByRole("button", { name: "Make video" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("lost its sound");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download SRT" })).toBeEnabled();
  });

  it("explains when this browser cannot make videos", () => {
    fake.ok = false;
    render(<ExportPanel project={project()} />);
    expect(screen.queryByRole("button", { name: "Make video" })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot make video files/)).toBeInTheDocument();
  });

  it("shows timing warnings before exporting", () => {
    render(
      <ExportPanel
        project={project({
          cues: [
            { id: "a", text: "One", start_ms: 0, end_ms: 3000 },
            { id: "b", text: "Two", start_ms: 2000, end_ms: 4000 },
          ],
        })}
      />,
    );
    expect(screen.getByText(/timing warning/)).toBeInTheDocument();
  });

  it("does not make a video when there are no subtitles", async () => {
    render(<ExportPanel project={project({ cues: [] })} />);
    expect(screen.getByRole("button", { name: "Make video" })).toBeDisabled();
    expect(screen.getByText("There are no subtitles to save yet.")).toBeInTheDocument();
    await waitFor(() => {
      expect(fake.calls).toHaveLength(0);
    });
  });
});
