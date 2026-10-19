import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { GenerateRequest, TimingResult } from "./api/subtitles";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const media = {
  id: "3f2b8c1e-0000-4000-8000-000000000001",
  filename: "clip.mp4",
  size_bytes: 1000,
  metadata: {
    duration_ms: 12_000,
    width: 1280,
    height: 720,
    frame_rate: 30,
    video_codec: "h264",
    has_audio: false,
    audio_codec: null,
    container: "mp4",
  },
};

function timingFor(req: GenerateRequest): TimingResult {
  const cues = req.segments.map((text, i) => ({
    id: `cue-${String(i + 1)}`,
    index: i + 1,
    text,
    start_ms: i * 2000,
    end_ms: i * 2000 + 1500,
  }));
  return {
    cues,
    issues: [
      { code: "compressed", message: "Shown faster than comfortable.", cue_number: null },
      { code: "too_fast", message: "Subtitle 2 may be hard to read.", cue_number: 2 },
    ],
    summary: {
      cue_count: cues.length,
      first_start_ms: 0,
      last_end_ms: cues[cues.length - 1].end_ms,
      blank_end_ms: req.duration_ms - cues[cues.length - 1].end_ms,
      video_duration_ms: req.duration_ms,
      seeded: req.mode === "manual",
    },
  };
}

let parseFailure: { code: string; message: string } | null = null;

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

function installBackend() {
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = urlOf(input);
    if (url === "/api/media") return Promise.resolve(json(media));
    if (url === "/api/text/parse") {
      if (parseFailure) return Promise.resolve(json({ detail: parseFailure }, 422));
      const form = init?.body as FormData;
      const mode = form.get("segmentation") as string;
      const segments = mode === "sentence" ? ["One.", "Two.", "Three.", "Four."] : ["வணக்கம்", "Second", "Third"];
      return Promise.resolve(
        json({ filename: "script.txt", segmentation: mode, count: segments.length, segments }),
      );
    }
    if (url === "/api/timing/generate") {
      const req = JSON.parse(init?.body as string) as GenerateRequest;
      return Promise.resolve(json(timingFor(req)));
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  });
}

const fileInputs = () => document.querySelectorAll<HTMLInputElement>('input[type="file"]');
const calls = (url: string) => vi.mocked(fetch).mock.calls.filter(([u]) => urlOf(u) === url);
const lastTiming = () => {
  const list = calls("/api/timing/generate");
  return JSON.parse(list[list.length - 1][1]?.body as string) as GenerateRequest;
};

async function openTextWorkflowWithVideo() {
  render(<App />);
  fireEvent.click(screen.getAllByRole("button", { name: "Start" })[1]);
  fireEvent.change(fileInputs()[0], {
    target: { files: [new File([new Uint8Array([1])], "clip.mp4", { type: "video/mp4" })] },
  });
  await screen.findByRole("button", { name: "Select TXT" });
}

const pickTxt = (name = "script.txt") => {
  fireEvent.change(fileInputs()[1], { target: { files: [new File(["hello"], name, { type: "text/plain" })] } });
};

beforeEach(() => {
  parseFailure = null;
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:clip"), revokeObjectURL: vi.fn() }));
  installBackend();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Text workflow", () => {
  it("shows the segmentation and timing choices only after a TXT is read", async () => {
    await openTextWorkflowWithVideo();
    expect(screen.queryByText("How should subtitles be timed?")).not.toBeInTheDocument();
    pickTxt();
    expect(await screen.findByText(/Found 3 subtitles/)).toBeInTheDocument();
    expect(screen.getByText("How should the text be split?")).toBeInTheDocument();
    expect(screen.getByText("How should subtitles be timed?")).toBeInTheDocument();
  });

  it("generates timing with the video duration and explains the result", async () => {
    await openTextWorkflowWithVideo();
    pickTxt();
    expect(await screen.findByText(/3 subtitles from 00:00:00.000 to 00:00:05.500/)).toBeInTheDocument();
    expect(screen.getByText(/00:00:06.500 of the video stays blank at the end/)).toBeInTheDocument();
    const req = lastTiming();
    expect(req.mode).toBe("readable");
    expect(req.duration_ms).toBe(12_000);
    expect(req.settings).toEqual({ chars_per_second: 17, min_duration_ms: 1000, max_duration_ms: 7000, gap_ms: 100 });
    expect(req.segments[0]).toBe("வணக்கம்");
  });

  it("describes each timing mode before it is applied", async () => {
    await openTextWorkflowWithVideo();
    pickTxt();
    await screen.findByText(/Found 3 subtitles/);
    expect(screen.getByText(/Every subtitle gets the same duration/)).toBeInTheDocument();
    expect(screen.getByText(/Unused video time stays blank at the end/)).toBeInTheDocument();
    expect(screen.getByText(/Spread subtitles across the whole video/)).toBeInTheDocument();
    expect(screen.getByText(/You set each subtitle's start and duration/)).toBeInTheDocument();
  });

  it("re-times when the mode changes, and says Manual starts from readable timing", async () => {
    await openTextWorkflowWithVideo();
    pickTxt();
    await screen.findByText(/Found 3 subtitles/);
    fireEvent.click(screen.getByRole("radio", { name: /Fit to video/ }));
    await waitFor(() => {
      expect(lastTiming().mode).toBe("fit");
    });
    fireEvent.click(screen.getByRole("radio", { name: /Manual/ }));
    await waitFor(() => {
      expect(lastTiming().mode).toBe("manual");
    });
    expect(screen.getByText(/Manual starts from readable timing/)).toBeInTheDocument();
  });

  it("re-reads the file when the segmentation changes", async () => {
    await openTextWorkflowWithVideo();
    pickTxt();
    await screen.findByText(/Found 3 subtitles/);
    fireEvent.click(screen.getByRole("radio", { name: /Split into sentences/ }));
    expect(await screen.findByText(/Found 4 subtitles/)).toBeInTheDocument();
    const form = calls("/api/text/parse")[1][1]?.body as FormData;
    expect(form.get("segmentation")).toBe("sentence");
  });

  it("lists cues with warnings as text, not only colour, and never changes them", async () => {
    await openTextWorkflowWithVideo();
    pickTxt();
    const list = await screen.findByRole("list", { name: "Generated subtitles" });
    const second = within(list).getAllByRole("listitem")[1];
    expect(second).toHaveTextContent("Warning: Subtitle 2 may be hard to read.");
    expect(screen.getByText(/Shown faster than comfortable/)).toBeInTheDocument();
    expect(screen.getByText(/1 warning/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing was changed automatically/)).toBeInTheDocument();
  });

  it("rejects a non-TXT file before contacting the backend", async () => {
    await openTextWorkflowWithVideo();
    const before = calls("/api/text/parse").length;
    pickTxt("script.docx");
    expect(await screen.findByText("Choose a plain text file ending in .txt.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a different file" })).toBeInTheDocument();
    expect(calls("/api/text/parse").length).toBe(before);
  });

  it("shows the backend's UTF-8 guidance beside the file with a way to replace it", async () => {
    parseFailure = { code: "not_utf8", message: "Save it again as UTF-8." };
    await openTextWorkflowWithVideo();
    pickTxt();
    expect(await screen.findByText("Save it again as UTF-8.")).toBeInTheDocument();
    expect(screen.getByText("script.txt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a different file" })).toBeInTheDocument();
    expect(screen.queryByText("How should subtitles be timed?")).not.toBeInTheDocument();
  });

  it("validates readability settings and sends nothing until they are valid", async () => {
    await openTextWorkflowWithVideo();
    pickTxt();
    await screen.findByText(/Found 3 subtitles/);
    await screen.findByRole("list", { name: "Generated subtitles" });
    const before = calls("/api/timing/generate").length;
    fireEvent.change(screen.getByLabelText(/Minimum duration/), { target: { value: "9" } });
    expect(screen.getByText("The minimum cannot be longer than the maximum.")).toBeInTheDocument();
    expect(screen.getByText(/Fix the readability settings/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 350));
    expect(calls("/api/timing/generate").length).toBe(before);
    fireEvent.change(screen.getByLabelText(/Maximum duration/), { target: { value: "10" } });
    await waitFor(() => {
      expect(lastTiming().settings.min_duration_ms).toBe(9000);
    });
    expect(lastTiming().settings.max_duration_ms).toBe(10_000);
  });

  it("removing the TXT clears the choices", async () => {
    await openTextWorkflowWithVideo();
    pickTxt();
    await screen.findByText(/Found 3 subtitles/);
    // Two Remove buttons exist: the video's (first) and the text file's (second).
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(screen.getByRole("button", { name: "Select TXT" })).toBeInTheDocument();
    expect(screen.queryByText("How should subtitles be timed?")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Generated subtitles" })).not.toBeInTheDocument();
    // The imported video is untouched.
    expect(screen.getByLabelText("Preview of clip.mp4")).toBeInTheDocument();
  });
});
