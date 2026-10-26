// @vitest-environment node
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { getOne, MEDIA, PROJECTS, putOne, resetDbForTests } from "../engine/db";
import { DEFAULT_STYLE } from "../lib/style";
import { ApiError } from "./http";
import { importMedia, loadMediaUrl, removeMedia } from "./media";
import { deleteProject, getProject, listProjects, saveProject, type Project } from "./projects";

const videoFile = () =>
  new File(
    [readFileSync(new URL("../engine/__fixtures__/with-audio.mp4", import.meta.url))],
    "clip.mp4",
    { type: "video/mp4" },
  );

const PID = "11111111-1111-4111-8111-111111111111";

function project(mediaId: string, overrides: Partial<Project> = {}): Project {
  return {
    version: 1,
    id: PID,
    name: "Demo",
    workflow: "text",
    media: { id: mediaId, filename: "clip.mp4", duration_ms: 1200, width: 64, height: 48, has_audio: true },
    cues: [
      { id: "a", text: "வணக்கம்\nஉலகம்", start_ms: 0, end_ms: 1500 },
      { id: "b", text: "日本語 🎬", start_ms: 1600, end_ms: 3000 },
    ],
    style: { ...DEFAULT_STYLE, position: "top" },
    timing: {
      mode: "fit",
      segmentation: "sentence",
      settings: { chars_per_second: 17, min_duration_ms: 1000, max_duration_ms: 7000, gap_ms: 100 },
    },
    ...overrides,
  };
}

beforeEach(async () => {
  resetDbForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("subtitle-studio");
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = () => {
      resolve();
    };
  });
});

describe("projects saved in the browser", () => {
  it("round-trips everything, including Tamil, line breaks and emoji", async () => {
    const media = await importMedia(videoFile());
    await saveProject(project(media.id));
    const loaded = await getProject(PID);
    expect(loaded.cues).toEqual(project(media.id).cues);
    expect(loaded.style.position).toBe("top");
    expect(loaded.timing.mode).toBe("fit");
    expect(loaded.media_available).toBe(true);
    expect(loaded.created_at).toBeTruthy();
    const stored = await getOne<Record<string, unknown>>(PROJECTS, PID);
    expect(stored).not.toHaveProperty("media_available");
  });

  it("keeps a copy of the video so the project reopens later, and keeps created_at", async () => {
    const media = await importMedia(videoFile());
    await saveProject(project(media.id));
    const first = await getProject(PID);
    await saveProject({ ...first, name: "Renamed" });
    const second = await getProject(PID);
    expect(second.name).toBe("Renamed");
    expect(second.created_at).toBe(first.created_at);
    const record = await getOne<{ blob: Blob; size: number }>(MEDIA, media.id);
    expect(record?.size).toBe(videoFile().size);
    expect(await loadMediaUrl(media.id)).toMatch(/^blob:/);
  });

  it("lists projects newest first and reports a missing video", async () => {
    const media = await importMedia(videoFile());
    await saveProject(project(media.id));
    const orphan = "22222222-2222-4222-8222-222222222222";
    await saveProject(project(orphan, { id: "33333333-3333-4333-8333-333333333333", name: "No video" }));
    const list = await listProjects();
    expect(list.map((p) => p.name)).toEqual(["No video", "Demo"]);
    expect(list.find((p) => p.name === "No video")?.media_available).toBe(false);
    expect(list.find((p) => p.name === "Demo")?.cue_count).toBe(2);
  });

  it("refuses values outside the allowed range and saves nothing", async () => {
    const bad = project("22222222-2222-4222-8222-222222222222", {
      style: { ...DEFAULT_STYLE, text_color: "red" },
    });
    await expect(saveProject(bad)).rejects.toBeInstanceOf(ApiError);
    expect(await listProjects()).toEqual([]);
  });

  it("keeps the cut parts of the video, and refuses impossible ones", async () => {
    const media = await importMedia(videoFile());
    const parts = [
      { start_ms: 0, end_ms: 400 },
      { start_ms: 700, end_ms: 1200 },
    ];
    await saveProject(project(media.id, { parts, cues: [{ id: "a", text: "x", start_ms: 0, end_ms: 500 }] }));
    expect((await getProject(PID)).parts).toEqual(parts);
    for (const bad of [[], [{ start_ms: 0, end_ms: 5000 }], [{ start_ms: 500, end_ms: 900 }, { start_ms: 100, end_ms: 300 }]]) {
      await expect(saveProject(project(media.id, { id: "33333333-3333-4333-8333-333333333333", parts: bad }))).rejects.toBeInstanceOf(ApiError);
    }
  });

  it("opens older projects without cuts as the whole video", async () => {
    const media = await importMedia(videoFile());
    await saveProject(project(media.id));
    expect((await getProject(PID)).parts).toBeUndefined();
  });

  it("skips a damaged entry in the list and explains it when opened, without deleting it", async () => {
    await putOne(PROJECTS, { id: PID, version: 2, name: "From the future" });
    expect(await listProjects()).toEqual([]);
    await expect(getProject(PID)).rejects.toMatchObject({ code: "unreadable" });
    expect(await getOne(PROJECTS, PID)).toBeTruthy();
  });

  it("fills in defaults for older documents that lack optional fields", async () => {
    const raw = project("22222222-2222-4222-8222-222222222222") as unknown as Record<string, unknown>;
    delete raw.style;
    delete raw.timing;
    await putOne(PROJECTS, raw);
    const loaded = await getProject(PID);
    expect(loaded.style).toEqual(DEFAULT_STYLE);
    expect(loaded.timing.mode).toBe("readable");
  });

  it("deletes the video copy only when no other project uses it", async () => {
    const media = await importMedia(videoFile());
    await saveProject(project(media.id));
    const otherId = "44444444-4444-4444-8444-444444444444";
    await saveProject(project(media.id, { id: otherId, name: "Other" }));
    await deleteProject(PID);
    expect(await getOne(MEDIA, media.id)).toBeTruthy();
    await deleteProject(otherId);
    expect(await getOne(MEDIA, media.id)).toBeUndefined();
    await expect(deleteProject(otherId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("forgets a chosen video that was never saved", async () => {
    const media = await importMedia(videoFile());
    await removeMedia(media.id);
    expect(await loadMediaUrl(media.id)).toBeNull();
  });
});
