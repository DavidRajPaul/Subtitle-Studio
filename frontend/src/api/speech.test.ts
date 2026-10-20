import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSpeechEngine } from "../test/fakeSpeechEngine";
import { importMedia } from "./media";
import {
  cancelJob,
  deleteModel,
  downloadModel,
  getJob,
  getSpeechInfo,
  importAudio,
  isFinished,
  setSpeechEngineForTests,
  startTranscription,
  type Job,
  type TranscriptionResult,
} from "./speech";

vi.mock("../engine/inspect", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/inspect")>()),
  inspectVideo: vi.fn(() =>
    Promise.resolve({
      duration_ms: 2500,
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
beforeEach(() => {
  fake = new FakeSpeechEngine();
  setSpeechEngineForTests(fake);
});
afterEach(() => {
  setSpeechEngineForTests(null);
});

async function finished<R>(id: string): Promise<Job<R>> {
  for (let i = 0; i < 100; i++) {
    const job = await getJob<R>(id);
    if (isFinished(job.status)) return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("job did not finish");
}

const video = () => importMedia(new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" }));

describe("speech in the browser", () => {
  it("lists the models with sizes, installed state and languages", async () => {
    const info = await getSpeechInfo();
    expect(info.models.map((m) => [m.name, m.approx_size_mb, m.installed])).toEqual([
      ["tiny", 41, false],
      ["base", 77, true],
      ["small", 250, false],
    ]);
    expect(info.languages).toContainEqual({ code: "ta", name: "Tamil" });
    expect(info.engine.available).toBe(true);
  });

  it("downloads a model as a job with progress, then reports it installed", async () => {
    const id = await downloadModel("small");
    const job = await finished(id);
    expect(job.status).toBe("succeeded");
    expect((await getSpeechInfo()).models.find((m) => m.name === "small")?.installed).toBe(true);
    await expect(downloadModel("small")).rejects.toMatchObject({ code: "already_installed" });
    await deleteModel("small");
    expect((await getSpeechInfo()).models.find((m) => m.name === "small")?.installed).toBe(false);
  });

  it("explains a failed download", async () => {
    fake.failDownload = true;
    const job = await finished(await downloadModel("tiny"));
    expect(job.status).toBe("failed");
    expect(job.error?.message).toMatch(/internet/);
  });

  it("transcribes the chosen video into editable cues", async () => {
    const media = await video();
    const id = await startTranscription({ media_id: media.id, audio_id: null, language: "ta", model: "base" });
    const job = await finished<TranscriptionResult>(id);
    expect(job.status).toBe("succeeded");
    expect(job.result?.cues.map((c) => [c.text, c.start_ms, c.end_ms])).toEqual([
      ["வணக்கம்", 0, 1200],
      ["Hello world.", 1300, 2500],
    ]);
    expect(job.result?.language_name).toBe("Tamil");
    expect(fake.calls[0]).toMatchObject({ model: "base", language: "ta", size: 3 });
  });

  it("uses the separate MP3 when given, and auto-detects the language", async () => {
    const media = await video();
    const audio = await importAudio(new File([new Uint8Array(10)], "voice.mp3", { type: "audio/mpeg" }));
    expect(audio.metadata.duration_ms).toBe(3000);
    const id = await startTranscription({ media_id: media.id, audio_id: audio.id, language: "auto", model: "base" });
    const job = await finished<TranscriptionResult>(id);
    expect(job.result?.used_mp3).toBe(true);
    expect(fake.calls[0]).toMatchObject({ language: null, size: 10 });
  });

  it("refuses to start without the model and says how to fix it", async () => {
    const media = await video();
    await expect(
      startTranscription({ media_id: media.id, audio_id: null, language: "en", model: "small" }),
    ).rejects.toMatchObject({ code: "model_missing" });
    expect(fake.calls).toHaveLength(0);
  });

  it("can be cancelled while recognising", async () => {
    let release: () => void = () => undefined;
    fake.gate = new Promise<void>((r) => {
      release = r;
    });
    const media = await video();
    const id = await startTranscription({ media_id: media.id, audio_id: null, language: "en", model: "base" });
    await new Promise((r) => setTimeout(r, 10));
    expect((await getJob(id)).status).toBe("running");
    expect((await getJob(id)).message).toMatch(/minute left/);
    const after = await cancelJob(id);
    expect(after.status).toBe("cancelled");
    release();
    await new Promise((r) => setTimeout(r, 10));
    const job = await getJob<TranscriptionResult>(id);
    expect(job.status).toBe("cancelled");
    expect(job.result).toBeNull();
  });

  it("reports no speech as a failure with a next step", async () => {
    fake.segments = [{ start_ms: 0, end_ms: 100, text: "  " }];
    const media = await video();
    const job = await finished(await startTranscription({ media_id: media.id, audio_id: null, language: "auto", model: "base" }));
    expect(job.error?.code).toBe("no_speech");
  });

  it("says when a job is no longer known", async () => {
    await expect(getJob("nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a non-MP3 before reading it", async () => {
    await expect(importAudio(new File(["x"], "voice.wav"))).rejects.toMatchObject({ code: "invalid_file" });
  });
});
