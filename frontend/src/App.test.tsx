import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { HealthResponse } from "./api/health";
import type { ImportedMedia } from "./api/media";

// Home lists saved projects; these tests are about import and diagnostics, so keep it empty and
// out of the fetch call log.
vi.mock("./api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api/projects")>()),
  listProjects: vi.fn().mockResolvedValue([]),
}));

const okHealth: HealthResponse = {
  status: "ok",
  version: "0.1.0",
  tools: {
    ffmpeg: { available: true, version: "ffmpeg version 6.1.1", detail: null },
    ffprobe: { available: true, version: "ffprobe version 6.1.1", detail: null },
  },
};

const imported = (hasAudio: boolean): ImportedMedia => ({
  id: "3f2b8c1e-0000-4000-8000-000000000001",
  filename: "clip.mp4",
  size_bytes: 2_500_000,
  metadata: {
    duration_ms: 12_000,
    width: 1080,
    height: 1920,
    frame_rate: 30,
    video_codec: "h264",
    has_audio: hasAudio,
    audio_codec: hasAudio ? "aac" : null,
    container: "mp4",
  },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function pickFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input missing");
  fireEvent.change(input, { target: { files: [file] } });
}

const mp4 = () => new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:clip"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("offers the two workflows", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Transcribe speech" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create subtitles from text" })).toBeInTheDocument();
  });
});

describe("Diagnostics", () => {
  it("reports ready from Settings", async () => {
    vi.mocked(fetch).mockResolvedValue(json(okHealth));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByText("Ready")).toBeInTheDocument();
  });

  it("shows retry when the backend is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the local backend");
    vi.mocked(fetch).mockResolvedValueOnce(json(okHealth));
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    await waitFor(() => {
      expect(screen.getByText("Ready")).toBeInTheDocument();
    });
  });
});

describe("Import", () => {
  const startText = () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "Start" })[1]);
  };

  it("imports an MP4 and shows metadata and preview", async () => {
    vi.mocked(fetch).mockResolvedValue(json(imported(true)));
    startText();
    pickFile(mp4());
    expect(await screen.findByText("00:00:12.000", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/1080×1920 \(portrait\)/)).toBeInTheDocument();
    expect(screen.getByText("Audio track detected")).toBeInTheDocument();
    expect(screen.getByLabelText("Preview of clip.mp4")).toBeInTheDocument();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/media");
    expect(init?.method).toBe("POST");
  });

  it("rejects non-MP4 files before contacting the backend", () => {
    startText();
    pickFile(new File(["x"], "clip.mov", { type: "video/quicktime" }));
    expect(screen.getByRole("alert")).toHaveTextContent("ending in .mp4");
    expect(screen.getByRole("button", { name: "Choose a different file" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the backend's reason beside the field", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json({ detail: { code: "no_video_stream", message: "This MP4 has no video track." } }, 422),
    );
    startText();
    pickFile(mp4());
    expect(await screen.findByRole("alert")).toHaveTextContent("This MP4 has no video track.");
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
  });

  it("explains an unreachable backend", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    startText();
    pickFile(mp4());
    expect(await screen.findByRole("alert")).toHaveTextContent("local backend is not running");
  });

  it("offers the text workflow when a speech video has no audio", async () => {
    vi.mocked(fetch).mockResolvedValue(json(imported(false)));
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "Start" })[0]);
    pickFile(mp4());
    fireEvent.click(await screen.findByRole("button", { name: "Use a text file instead" }));
    expect(screen.getByText("Create subtitles from text", { selector: "strong" })).toBeInTheDocument();
    // The imported video survives the workflow switch.
    expect(screen.getByLabelText("Preview of clip.mp4")).toBeInTheDocument();
  });

  it("validates the numeric seek field", async () => {
    vi.mocked(fetch).mockResolvedValue(json(imported(true)));
    startText();
    pickFile(mp4());
    const input = await screen.findByLabelText(/Go to time/);
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByRole("alert")).toHaveTextContent("HH:MM:SS.mmm");
    fireEvent.change(input, { target: { value: "00:00:20" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByRole("alert")).toHaveTextContent("past the end");
    fireEvent.change(input, { target: { value: "5.2" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current time")).toHaveTextContent("00:00:05.200");
  });

  it("removes the working copy when the video is removed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(imported(true)));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    startText();
    pickFile(mp4());
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(screen.getByRole("button", { name: "Select MP4" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/media/3f2b8c1e-0000-4000-8000-000000000001",
        { method: "DELETE" },
      );
    });
  });
});
