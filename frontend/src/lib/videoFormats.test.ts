import { describe, expect, it } from "vitest";
import { baseName, VIDEO_ACCEPT, videoMime, videoNameProblem } from "./videoFormats";

const f = (name: string, type = "") => ({ name, type });

describe("video formats", () => {
  it("accepts the common phone and camera formats, any letter case", () => {
    for (const n of ["a.mp4", "IMG_0042.MOV", "b.m4v", "c.webm", "d.MKV", "e.3gp"]) expect(videoNameProblem(f(n))).toBeNull();
  });
  it("explains formats browsers cannot read, with a next step", () => {
    expect(videoNameProblem(f("old.avi"))).toMatch(/AVI videos cannot be opened.*Convert it to MP4/);
    expect(videoNameProblem(f("x.wmv"))).toMatch(/WMV/);
  });
  it("trusts the video type when there is no known extension", () => {
    expect(videoNameProblem(f("clip", "video/mp4"))).toBeNull();
    expect(videoNameProblem(f("notes.txt", "text/plain"))).toMatch(/Choose a video file/);
  });
  it("offers the photo library in pickers", () => {
    expect(VIDEO_ACCEPT).toContain(".mov");
    expect(VIDEO_ACCEPT).toContain("video/*");
  });
  it("names projects without the extension", () => {
    expect(baseName("Holiday.MOV")).toBe("Holiday");
    expect(baseName("a.b.mkv")).toBe("a.b");
    expect(baseName("noext")).toBe("noext");
  });
  it("fills in a missing type from the extension", () => {
    expect(videoMime(f("a.mkv"))).toBe("video/x-matroska");
    expect(videoMime(f("a.MOV"))).toBe("video/quicktime");
    expect(videoMime(f("a.mov", "video/custom"))).toBe("video/custom");
  });
});
