import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { getProject, saveProject, type LoadedProject } from "../api/projects";
import { setSpeechEngineForTests } from "../api/speech";
import { inspectMp4 } from "../engine/inspect";
import { FakeSpeechEngine } from "../test/fakeSpeechEngine";

vi.mock("../engine/inspect", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/inspect")>()),
  inspectMp4: vi.fn(),
}));

const saved: LoadedProject[] = [];
vi.mock("../api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/projects")>()),
  listProjects: vi.fn().mockResolvedValue([]),
  saveProject: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock("../api/media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/media")>()),
  loadMediaUrl: vi.fn(() => Promise.resolve("blob:clip")),
}));

const LONG = { timeout: 3000 };
let fake: FakeSpeechEngine;

beforeEach(() => {
  window.localStorage.clear();
  saved.length = 0;
  vi.mocked(saveProject).mockReset();
  vi.mocked(saveProject).mockImplementation((p) => {
    saved.push(structuredClone(p) as LoadedProject);
    return Promise.resolve();
  });
  vi.mocked(getProject).mockImplementation((id) => {
    const p = [...saved].reverse().find((x) => x.id === id);
    return p ? Promise.resolve({ ...p, media_available: true }) : Promise.reject(new Error("missing"));
  });
  vi.mocked(inspectMp4).mockResolvedValue({
    duration_ms: 12_000,
    width: 1080,
    height: 1920,
    frame_rate: 30,
    video_codec: "h264",
    has_audio: true,
    audio_codec: "aac",
    container: "mp4",
  });
  fake = new FakeSpeechEngine();
  setSpeechEngineForTests(fake);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:clip"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  setSpeechEngineForTests(null);
  vi.unstubAllGlobals();
});

async function chooseVideo() {
  fireEvent.click(screen.getByRole("button", { name: "Make subtitles" }));
  const input = document.querySelector<HTMLInputElement>('input[type="file"][accept=".mp4,video/mp4"]');
  if (!input) throw new Error("video input missing");
  fireEvent.change(input, { target: { files: [new File([new Uint8Array([1, 2, 3])], "trip.mp4", { type: "video/mp4" })] } });
  fireEvent.click(await screen.findByRole("button", { name: "Next: the words" }));
}

describe("Easy mode", () => {
  it("is the default, and Editor mode is one tap away and remembered", () => {
    const { unmount } = render(<App />);
    expect(screen.getByRole("heading", { name: "Subtitles in three steps" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Easy" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByRole("heading", { name: "Create a subtitle project" })).toBeInTheDocument();
    unmount();
    render(<App />);
    expect(screen.getByRole("button", { name: "Editor" })).toHaveAttribute("aria-pressed", "true");
  });

  it("makes subtitles from typed words, then lets her pick a look that is saved", async () => {
    render(<App />);
    await chooseVideo();
    expect(screen.getByRole("heading", { name: "Where do the words come from?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Type or paste the words/ }));
    fireEvent.change(screen.getByLabelText("The words"), { target: { value: "வணக்கம் நண்பர்களே\nWelcome to the channel" } });
    fireEvent.click(screen.getByRole("button", { name: "Make subtitles" }));
    expect(await screen.findByRole("heading", { name: "Pick a look" }, LONG)).toBeInTheDocument();
    const first = saved[0];
    expect(first.workflow).toBe("text");
    expect(first.cues.map((c) => c.text)).toEqual(["வணக்கம் நண்பர்களே", "Welcome to the channel"]);
    expect(first.cues[0].start_ms).toBe(0);
    expect(first.cues.at(-1)?.end_ms).toBe(12_000); // spread across the whole video
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Looks" })).getByRole("radio", { name: /Karaoke/ }));
    await waitFor(() => {
      expect(saved.at(-1)?.style.animation.caption).toBe("highlight");
    }, LONG);
  });

  it("makes subtitles from the voice with the on-device recogniser", async () => {
    render(<App />);
    await chooseVideo();
    fireEvent.click(screen.getByRole("radio", { name: /From the voice in the video/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Make subtitles" }, LONG));
    expect(await screen.findByRole("heading", { name: "Pick a look" }, LONG)).toBeInTheDocument();
    expect(saved[0].workflow).toBe("speech");
    expect(saved[0].cues.map((c) => c.text)).toEqual(["வணக்கம்", "Hello world."]);
    expect(fake.calls[0].language).toBe("ta"); // Tamil is the default language
  });

  it("asks for the one-time model download before recognising", async () => {
    fake.installed.clear();
    render(<App />);
    await chooseVideo();
    fireEvent.click(screen.getByRole("radio", { name: /From the voice in the video/ }));
    expect(await screen.findByText(/One-time download needed/, {}, LONG)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make subtitles" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Download Base/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Make subtitles" })).toBeEnabled();
    }, LONG);
  });

  it("lets her fix a word without touching the timing", async () => {
    render(<App />);
    await chooseVideo();
    fireEvent.click(screen.getByRole("radio", { name: /Type or paste the words/ }));
    fireEvent.change(screen.getByLabelText("The words"), { target: { value: "Helo world" } });
    fireEvent.click(screen.getByRole("button", { name: "Make subtitles" }));
    await screen.findByRole("heading", { name: "Pick a look" }, LONG);
    const before = saved[0].cues[0];
    fireEvent.click(screen.getByText(/Fix words/));
    fireEvent.change(screen.getByLabelText("Subtitle 1"), { target: { value: "Hello world" } });
    await waitFor(() => {
      expect(saved.at(-1)?.cues[0]).toMatchObject({ text: "Hello world", start_ms: before.start_ms, end_ms: before.end_ms });
    }, LONG);
  });

  it("opens the same project in Editor mode for timing", async () => {
    render(<App />);
    await chooseVideo();
    fireEvent.click(screen.getByRole("radio", { name: /Type or paste the words/ }));
    fireEvent.change(screen.getByLabelText("The words"), { target: { value: "One line" } });
    fireEvent.click(screen.getByRole("button", { name: "Make subtitles" }));
    await screen.findByRole("heading", { name: "Pick a look" }, LONG);
    fireEvent.click(screen.getByRole("button", { name: "Edit timing in Editor mode" }));
    expect(await screen.findByRole("list", { name: "Subtitles" }, LONG)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editor" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens Export from the finished project", async () => {
    render(<App />);
    await chooseVideo();
    fireEvent.click(screen.getByRole("radio", { name: /Type or paste the words/ }));
    fireEvent.change(screen.getByLabelText("The words"), { target: { value: "One line" } });
    fireEvent.click(screen.getByRole("button", { name: "Make subtitles" }));
    await screen.findByRole("heading", { name: "Pick a look" }, LONG);
    fireEvent.click(screen.getByRole("button", { name: "Export video" }));
    expect(await screen.findByRole("dialog", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download SRT" })).toBeEnabled();
  });

  it("explains a video without sound and offers the other ways", async () => {
    vi.mocked(inspectMp4).mockResolvedValue({
      duration_ms: 5000, width: 640, height: 360, frame_rate: 25, video_codec: "h264", has_audio: false, audio_codec: null, container: "mp4",
    });
    render(<App />);
    await chooseVideo();
    expect(screen.getByRole("radio", { name: /From the voice/ })).toBeDisabled();
    expect(screen.getByText(/This video has no sound/)).toBeInTheDocument();
  });
});
