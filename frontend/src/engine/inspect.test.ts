// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InspectError, inspectMp4 } from "./inspect";

const fixture = (name: string) =>
  new Blob([readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url))], { type: "video/mp4" });

describe("in-browser MP4 inspection (real files)", () => {
  it("reads duration, size, frame rate, codecs and the audio track", async () => {
    const meta = await inspectMp4(fixture("with-audio.mp4"));
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(48);
    expect(meta.has_audio).toBe(true);
    expect(meta.video_codec).toBe("h264");
    expect(meta.audio_codec).toBe("aac");
    expect(meta.frame_rate).toBeCloseTo(25, 0);
    expect(meta.duration_ms).toBeGreaterThan(1100);
    expect(meta.duration_ms).toBeLessThan(1400);
  });

  it("reports a silent video as having no audio", async () => {
    const meta = await inspectMp4(fixture("silent.mp4"));
    expect(meta.has_audio).toBe(false);
    expect(meta.audio_codec).toBeNull();
    expect(meta.duration_ms).toBe(2000);
    expect(meta.frame_rate).toBeCloseTo(30, 0);
  });

  it("reports the shown size of a phone video stored with a rotation", async () => {
    const meta = await inspectMp4(fixture("rotated.mp4"));
    expect([meta.width, meta.height]).toEqual([48, 64]);
  });

  it("refuses a file that is not really an MP4, with a next step", async () => {
    const error = await inspectMp4(fixture("not-mp4.mp4")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InspectError);
    expect((error as InspectError).code).toBe("not_mp4");
    expect((error as InspectError).message).toMatch(/Convert it to MP4/);
  });

  it("refuses random bytes", async () => {
    const error = await inspectMp4(new Blob([new Uint8Array(5000).fill(7)])).catch((e: unknown) => e);
    expect((error as InspectError).code).toBe("not_mp4");
  });
});
