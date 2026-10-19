import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, SpeechInfo, TranscriptionResult } from "../api/speech";
import { SpeechSetup } from "./SpeechSetup";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const RESULT: TranscriptionResult = {
  language: "ta",
  language_name: "Tamil",
  language_probability: 0.91,
  audio_duration_ms: 4000,
  used_mp3: false,
  model: "base",
  cues: [
    { id: "c1", text: "வணக்கம்", start_ms: 0, end_ms: 1200 },
    { id: "c2", text: "Hello world.", start_ms: 1300, end_ms: 2500 },
  ],
};

interface Backend {
  installed: boolean;
  requests: { url: string; method: string; body: unknown }[];
  /** Successive states returned for the transcription job. */
  transcribeStates: Partial<Job<TranscriptionResult>>[];
  downloadStates: Partial<Job<unknown>>[];
}

let backend: Backend;

function info(): SpeechInfo {
  return {
    engine: { available: true, version: "1.2.1", detail: null },
    cache_dir: "/data/models",
    default_model: "base",
    models: [
      {
        name: "base",
        label: "Base",
        approx_size_mb: 145,
        description: "Fast with fair accuracy.",
        installed: backend.installed,
        size_on_disk_bytes: backend.installed ? 150_000_000 : 0,
        download_job_id: null,
      },
      {
        name: "small",
        label: "Small",
        approx_size_mb: 485,
        description: "More accurate.",
        installed: false,
        size_on_disk_bytes: 0,
        download_job_id: null,
      },
    ],
    languages: [
      { code: "en", name: "English" },
      { code: "ta", name: "Tamil" },
    ],
  };
}

function job(id: string, kind: string, partial: Partial<Job<unknown>>): Job<unknown> {
  return {
    id,
    kind,
    status: "running",
    progress: null,
    message: "Working…",
    result: null,
    error: null,
    ...partial,
  };
}

beforeEach(() => {
  backend = {
    installed: true,
    requests: [],
    transcribeStates: [
      { status: "running", progress: 0.4, message: "Recognising speech…" },
      { status: "succeeded", progress: 1, message: "Done.", result: RESULT },
    ],
    downloadStates: [{ status: "succeeded", progress: 1, result: { name: "base" } }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
      backend.requests.push({ url, method, body });
      if (url === "/api/speech/models") return Promise.resolve(json(info()));
      if (url === "/api/speech/models/base/download") {
        return Promise.resolve(json({ job_id: "dl" }, 202));
      }
      if (url === "/api/speech/transcribe") return Promise.resolve(json({ job_id: "tr" }, 202));
      if (url === "/api/jobs/dl") {
        const next = backend.downloadStates.shift() ?? { status: "succeeded" };
        if (next.status === "succeeded") backend.installed = true;
        return Promise.resolve(json(job("dl", "model_download", next)));
      }
      if (url === "/api/jobs/tr") {
        const next =
          backend.transcribeStates.length > 1
            ? backend.transcribeStates.shift()
            : backend.transcribeStates[0];
        return Promise.resolve(json(job("tr", "transcription", next ?? {})));
      }
      if (url === "/api/jobs/tr/cancel") {
        backend.transcribeStates = [{ status: "cancelled", message: "Cancelled." }];
        return Promise.resolve(json(job("tr", "transcription", { message: "Cancelling…" })));
      }
      if (url === "/api/audio" && method === "POST") {
        return Promise.resolve(
          json({
            id: "a1",
            filename: "voice.mp3",
            size_bytes: 10,
            metadata: { duration_ms: 3000, codec: "mp3" },
          }),
        );
      }
      if (url.startsWith("/api/audio/")) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.reject(new TypeError(`unexpected ${method} ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const setup = (props: Partial<Parameters<typeof SpeechSetup>[0]> = {}) => {
  const onOpenEditor = vi.fn(() => Promise.resolve());
  const onSwitchToText = vi.fn();
  render(
    <SpeechSetup
      mediaId="m1"
      videoHasAudio
      videoDurationMs={4000}
      onSwitchToText={onSwitchToText}
      onOpenEditor={onOpenEditor}
      {...props}
    />,
  );
  return { onOpenEditor, onSwitchToText };
};

const requestsTo = (url: string) => backend.requests.filter((r) => r.url === url);

describe("Speech workflow", () => {
  it("transcribes with the chosen language, shows progress, then opens the result", async () => {
    const { onOpenEditor } = setup();
    const lang = await screen.findByLabelText("Spoken language");
    fireEvent.change(lang, { target: { value: "ta" } });
    expect(screen.getByText(/Small/, { selector: "strong" })).toBeInTheDocument(); // accuracy hint
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    expect(await screen.findByRole("progressbar", { name: "Transcription progress" })).toBeInTheDocument();
    expect(await screen.findByText(/Recognising speech… \(40%\)/)).toBeInTheDocument();
    expect(
      await screen.findByText(/recognised in Tamil/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("வணக்கம்")).toBeInTheDocument();
    expect(requestsTo("/api/speech/transcribe")[0].body).toMatchObject({
      media_id: "m1",
      audio_id: null,
      language: "ta",
      model: "base",
    });
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));
    await waitFor(() => {
      expect(onOpenEditor).toHaveBeenCalledWith(RESULT);
    });
  });

  it("asks for the model download first, then allows transcription", async () => {
    backend.installed = false;
    setup();
    expect(await screen.findByText(/The Base model is not installed yet/)).toBeInTheDocument();
    expect(screen.getByText(/needs the internet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transcribe" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Download Base/ }));
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "Transcribe" })).toBeEnabled();
      },
      { timeout: 3000 },
    );
    expect(screen.queryByText(/not installed yet/)).not.toBeInTheDocument();
  });

  it("explains a failed download and offers to try again", async () => {
    backend.installed = false;
    backend.downloadStates = [
      {
        status: "failed",
        error: { code: "download_failed", message: "Check the internet connection." },
      },
    ];
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Download Base/ }));
    expect(
      await screen.findByText("Check the internet connection.", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try the download again" })).toBeInTheDocument();
  });

  it("can be cancelled and says nothing was changed", async () => {
    backend.transcribeStates = [{ status: "running", progress: 0.1, message: "Recognising speech…" }];
    const { onOpenEditor } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Transcribe" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(
      await screen.findByText(/Transcription cancelled. Nothing was changed./, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(requestsTo("/api/jobs/tr/cancel")).toHaveLength(1);
    expect(onOpenEditor).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Transcribe" })).toBeEnabled();
  });

  it("shows why a transcription failed and keeps the choices", async () => {
    backend.transcribeStates = [
      { status: "failed", error: { code: "no_speech", message: "No speech was recognised." } },
    ];
    setup();
    const lang = await screen.findByLabelText("Spoken language");
    fireEvent.change(lang, { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    expect(
      await screen.findByText("No speech was recognised.", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transcribe again" })).toBeEnabled();
    expect(screen.getByLabelText("Spoken language")).toHaveValue("en");
  });

  it("needs an MP3 for a silent video and sends it with the request", async () => {
    const { onSwitchToText } = setup({ videoHasAudio: false });
    expect(await screen.findByText("This video has no audio.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transcribe" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use a text file instead" }));
    expect(onSwitchToText).toHaveBeenCalled();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("file input missing");
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], "voice.mp3", { type: "audio/mpeg" })] },
    });
    expect(await screen.findByText(/will be used instead of the video/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    await waitFor(() => {
      expect(requestsTo("/api/speech/transcribe")).toHaveLength(1);
    });
    expect(requestsTo("/api/speech/transcribe")[0].body).toMatchObject({ audio_id: "a1" });
  });

  it("rejects a non-MP3 before contacting the backend", async () => {
    setup({ videoHasAudio: false });
    await screen.findByText("This video has no audio.");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("file input missing");
    fireEvent.change(input, { target: { files: [new File(["x"], "voice.wav")] } });
    expect(screen.getByRole("alert")).toHaveTextContent("ending in .mp3");
    expect(requestsTo("/api/audio")).toHaveLength(0);
  });
});
