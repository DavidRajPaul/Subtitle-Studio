import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importMedia } from "../api/media";
import { setSpeechEngineForTests } from "../api/speech";
import { FakeSpeechEngine } from "../test/fakeSpeechEngine";
import { SpeechSetup } from "./SpeechSetup";

vi.mock("../engine/inspect", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/inspect")>()),
  inspectMp4: vi.fn(() =>
    Promise.resolve({
      duration_ms: 4000,
      width: 64,
      height: 48,
      frame_rate: 25,
      video_codec: "h264",
      has_audio: true,
      audio_codec: "aac",
      container: "mp4",
    }),
  ),
}));

vi.mock("../engine/audioDecode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/audioDecode")>()),
  readAudioDuration: vi.fn(() => Promise.resolve(3000)),
}));

let fake: FakeSpeechEngine;
let mediaId: string;

beforeEach(async () => {
  fake = new FakeSpeechEngine();
  setSpeechEngineForTests(fake);
  const media = await importMedia(new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" }));
  mediaId = media.id;
});

afterEach(() => {
  setSpeechEngineForTests(null);
});

const setup = (props: Partial<Parameters<typeof SpeechSetup>[0]> = {}) => {
  const onOpenEditor = vi.fn(() => Promise.resolve());
  const onSwitchToText = vi.fn();
  render(
    <SpeechSetup
      mediaId={mediaId}
      videoHasAudio
      videoDurationMs={4000}
      onSwitchToText={onSwitchToText}
      onOpenEditor={onOpenEditor}
      {...props}
    />,
  );
  return { onOpenEditor, onSwitchToText };
};

const LONG = { timeout: 3000 };

describe("Speech workflow", () => {
  it("says recognition happens on this device", async () => {
    setup();
    expect(await screen.findByText(/recognised on this device/)).toBeInTheDocument();
    expect(screen.getByText(/audio is not sent anywhere/)).toBeInTheDocument();
  });

  it("transcribes with the chosen language, shows progress, then opens the result", async () => {
    let release: () => void = () => undefined;
    fake.gate = new Promise<void>((r) => {
      release = r;
    });
    const { onOpenEditor } = setup();
    fireEvent.change(await screen.findByLabelText("Spoken language"), { target: { value: "ta" } });
    expect(screen.getByText(/Small/, { selector: "strong" })).toBeInTheDocument(); // accuracy hint
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    expect(await screen.findByRole("progressbar", { name: "Transcription progress" })).toBeInTheDocument();
    expect(await screen.findByText(/about 1 minute left \(40%\)/, {}, LONG)).toBeInTheDocument();
    release();
    expect(await screen.findByText(/recognised in Tamil/, {}, LONG)).toBeInTheDocument();
    expect(screen.getByText("வணக்கம்")).toBeInTheDocument();
    expect(fake.calls[0]).toMatchObject({ model: "base", language: "ta" });
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));
    await waitFor(() => {
      expect(onOpenEditor).toHaveBeenCalled();
    });
    const calls = onOpenEditor.mock.calls as unknown as [{ cues: { text: string }[] }][];
    expect(calls[0][0].cues.map((c) => c.text)).toEqual(["வணக்கம்", "Hello world."]);
  });

  it("asks for the model download first, then allows transcription", async () => {
    fake.installed.clear();
    setup();
    expect(await screen.findByText(/The Base model is not installed yet/)).toBeInTheDocument();
    expect(screen.getByText(/needs the internet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transcribe" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Download Base/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Transcribe" })).toBeEnabled();
    }, LONG);
    expect(screen.queryByText(/not installed yet/)).not.toBeInTheDocument();
  });

  it("explains a failed download and offers to try again", async () => {
    fake.installed.clear();
    fake.failDownload = true;
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Download Base/ }));
    expect(await screen.findByText("Check the internet connection.", {}, LONG)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try the download again" })).toBeInTheDocument();
  });

  it("can be cancelled and says nothing was changed", async () => {
    fake.gate = new Promise<void>(() => undefined);
    const { onOpenEditor } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Transcribe" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }, LONG));
    expect(await screen.findByText(/Transcription cancelled. Nothing was changed./, {}, LONG)).toBeInTheDocument();
    expect(onOpenEditor).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Transcribe" })).toBeEnabled();
  });

  it("shows why a transcription failed and keeps the choices", async () => {
    fake.segments = [];
    setup();
    fireEvent.change(await screen.findByLabelText("Spoken language"), { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    expect(await screen.findByText(/No speech was recognised/, {}, LONG)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transcribe again" })).toBeEnabled();
    expect(screen.getByLabelText("Spoken language")).toHaveValue("en");
  });

  it("needs an MP3 for a silent video and uses it", async () => {
    const { onSwitchToText } = setup({ videoHasAudio: false });
    expect(await screen.findByText("This video has no audio.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transcribe" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use a text file instead" }));
    expect(onSwitchToText).toHaveBeenCalled();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("file input missing");
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array(10)], "voice.mp3", { type: "audio/mpeg" })] },
    });
    expect(await screen.findByText(/will be used instead of the video/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    await waitFor(() => {
      expect(fake.calls).toHaveLength(1);
    });
    expect(fake.calls[0].size).toBe(10);
  });

  it("rejects a non-MP3 before reading it", async () => {
    setup({ videoHasAudio: false });
    await screen.findByText("This video has no audio.");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("file input missing");
    fireEvent.change(input, { target: { files: [new File(["x"], "voice.wav")] } });
    expect(screen.getByRole("alert")).toHaveTextContent("ending in .mp3");
  });

  it("explains when this browser cannot run recognition", async () => {
    fake.ok = false;
    setup();
    expect(await screen.findByRole("heading", { name: "Speech recognition is not available in this browser" })).toBeInTheDocument();
    expect(screen.getByText("Not in this browser.")).toBeInTheDocument();
  });
});
