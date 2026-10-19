import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { InspectError, inspectMp4, type MediaMetadata } from "./engine/inspect";

// Home lists saved projects; these tests are about import and settings, so keep it empty.
vi.mock("./api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api/projects")>()),
  listProjects: vi.fn().mockResolvedValue([]),
}));

vi.mock("./api/speech", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api/speech")>()),
  getSpeechInfo: vi.fn().mockResolvedValue({
    engine: { available: true, version: null, detail: null },
    cache_dir: "this browser",
    default_model: "base",
    models: [
      {
        name: "base",
        label: "Base",
        approx_size_mb: 77,
        description: "Fast.",
        installed: true,
        size_on_disk_bytes: 1,
        download_job_id: null,
      },
    ],
    languages: [],
  }),
}));

// The MP4 reader is tested against real files in engine/inspect.test.ts.
vi.mock("./engine/inspect", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./engine/inspect")>()),
  inspectMp4: vi.fn(),
}));

const meta = (hasAudio: boolean): MediaMetadata => ({
  duration_ms: 12_000,
  width: 1080,
  height: 1920,
  frame_rate: 30,
  video_codec: "h264",
  has_audio: hasAudio,
  audio_codec: hasAudio ? "aac" : null,
  container: "mp4",
});

function pickFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input missing");
  fireEvent.change(input, { target: { files: [file] } });
}

const mp4 = () => new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });

const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.mocked(inspectMp4).mockReset();
  revokeObjectURL.mockReset();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:clip"), revokeObjectURL }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("offers the two workflows and says nothing is uploaded", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Transcribe speech" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create subtitles from text" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing is uploaded/)).toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("describes this device instead of a server", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "This device" })).toBeInTheDocument();
    expect(screen.getByText(/runs entirely in this browser/)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });
});

describe("Import", () => {
  const startText = () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "Start" })[1]);
  };

  it("reads an MP4 in the browser and shows its details and a preview", async () => {
    vi.mocked(inspectMp4).mockResolvedValue(meta(true));
    startText();
    pickFile(mp4());
    expect(await screen.findByText("00:00:12.000", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/1080×1920 \(portrait\)/)).toBeInTheDocument();
    expect(screen.getByText("Audio track detected")).toBeInTheDocument();
    expect(screen.getByLabelText("Preview of clip.mp4")).toBeInTheDocument();
  });

  it("rejects non-MP4 files before reading them", () => {
    startText();
    pickFile(new File(["x"], "clip.mov", { type: "video/quicktime" }));
    expect(screen.getByRole("alert")).toHaveTextContent("ending in .mp4");
    expect(screen.getByRole("button", { name: "Choose a different file" })).toBeInTheDocument();
    expect(inspectMp4).not.toHaveBeenCalled();
  });

  it("shows the reason beside the file", async () => {
    vi.mocked(inspectMp4).mockRejectedValue(
      new InspectError("no_video_stream", "This MP4 has no video track."),
    );
    startText();
    pickFile(mp4());
    expect(await screen.findByRole("alert")).toHaveTextContent("This MP4 has no video track.");
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
  });

  it("explains an unreadable file", async () => {
    vi.mocked(inspectMp4).mockRejectedValue(new TypeError("boom"));
    startText();
    pickFile(mp4());
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be read as a video");
  });

  it("offers the text workflow when a speech video has no audio", async () => {
    vi.mocked(inspectMp4).mockResolvedValue(meta(false));
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "Start" })[0]);
    pickFile(mp4());
    expect(await screen.findByText("This video has no audio.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use a text file instead" }));
    expect(screen.getByText("Create subtitles from text", { selector: "strong" })).toBeInTheDocument();
    // The chosen video survives the workflow switch.
    expect(screen.getByLabelText("Preview of clip.mp4")).toBeInTheDocument();
  });

  it("validates the numeric seek field", async () => {
    vi.mocked(inspectMp4).mockResolvedValue(meta(true));
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

  it("forgets the chosen video when it is removed", async () => {
    vi.mocked(inspectMp4).mockResolvedValue(meta(true));
    startText();
    pickFile(mp4());
    await screen.findByLabelText("Preview of clip.mp4");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("button", { name: "Select MP4" })).toBeInTheDocument();
    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:clip");
    });
  });
});
