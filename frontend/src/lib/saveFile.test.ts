import { describe, expect, it } from "vitest";
import { exportName } from "./saveFile";

describe("exportName", () => {
  it("uses the project name and removes characters that file systems reject", () => {
    expect(exportName("My: clip/1?", "mp4")).toBe("My clip 1 - subtitles.mp4");
    expect(exportName("  ", "srt")).toBe("subtitles - subtitles.srt");
    expect(exportName("வணக்கம்", "srt")).toBe("வணக்கம் - subtitles.srt");
  });
});
