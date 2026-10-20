// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InspectError, inspectVideo } from "./inspect";

const fixture = (name: string, type = "") =>
  new Blob([readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url))], { type });

describe("in-browser video inspection (real files)", () => {
  it("reads duration, size, frame rate, codecs and the audio track", async () => {
    const meta = await inspectVideo(fixture("with-audio.mp4"));
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(48);
    expect(meta.has_audio).toBe(true);
    expect(meta.video_codec).toBe("h264");
    expect(meta.audio_codec).toBe("aac");
    expect(meta.frame_rate).toBeCloseTo(25, 0);
    expect(meta.duration_ms).toBeGreaterThan(1100);
    expect(meta.duration_ms).toBeLessThan(1400);
    expect(meta.container).toBe("mp4");
  });

  it("reports a silent video as having no audio", async () => {
    const meta = await inspectVideo(fixture("silent.mp4"));
    expect(meta.has_audio).toBe(false);
    expect(meta.audio_codec).toBeNull();
    expect(meta.duration_ms).toBe(2000);
    expect(meta.frame_rate).toBeCloseTo(30, 0);
  });

  it("reports the shown size of a phone video stored with a rotation", async () => {
    const meta = await inspectVideo(fixture("rotated.mp4"));
    expect([meta.width, meta.height]).toEqual([48, 64]);
  });

  it.each([
    ["with-audio.mov", "mov", "h264", "aac"],
    ["with-audio.webm", "webm", "vp9", "opus"],
    ["with-audio.mkv", "mkv", "h264", "aac"],
  ])("reads %s", async (name, container, vcodec, acodec) => {
    const meta = await inspectVideo(fixture(name));
    expect(meta).toMatchObject({ container, video_codec: vcodec, audio_codec: acodec, has_audio: true, width: 64, height: 48 });
    expect(meta.duration_ms).toBeGreaterThan(1100);
    expect(meta.duration_ms).toBeLessThan(1400);
  });

  it("reads a 3GP phone video", async () => {
    const meta = await inspectVideo(fixture("silent.3gp", "video/3gpp"));
    expect(meta.container).toBe("3gp");
    expect(meta.has_audio).toBe(false);
  });

  it("refuses an AVI with a next step", async () => {
    const error = await inspectVideo(fixture("clip.avi")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InspectError);
    expect((error as InspectError).code).toBe("unsupported_format");
    expect((error as InspectError).message).toMatch(/Convert it to MP4/);
  });

  it("goes by the file's content, not its name (an MKV renamed to .mp4 is read as MKV)", async () => {
    expect((await inspectVideo(fixture("not-mp4.mp4"))).container).toBe("mkv");
  });

  it("refuses random bytes", async () => {
    const error = await inspectVideo(new Blob([new Uint8Array(5000).fill(7)])).catch((e: unknown) => e);
    expect((error as InspectError).code).toBe("unsupported_format");
  });
});
