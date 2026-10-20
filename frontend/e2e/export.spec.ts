import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { axeProblems, easyProject, smallTargets } from "./helpers";

/** SHA-256 of the project's stored video copy, to prove export never changes it. */
const storedVideoHash = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open("subtitle-studio");
        req.onsuccess = () => {
          const all = req.result.transaction("media").objectStore("media").getAll();
          all.onsuccess = async () => {
            const rec = (all.result as { blob: Blob }[])[0];
            const digest = await crypto.subtle.digest("SHA-256", await rec.blob.arrayBuffer());
            resolve([...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""));
          };
          all.onerror = () => {
            reject(new Error("read failed"));
          };
        };
        req.onerror = () => {
          reject(new Error("open failed"));
        };
      }),
  );

test("G1 export: cancel, then a checked MP4 and a UTF-8 SRT; the stored original is unchanged", async ({ page }) => {
  await easyProject(page);
  const before = await storedVideoHash(page);
  await page.getByRole("button", { name: "Export video" }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByText(/original video is not changed/)).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);

  await dialog.getByRole("button", { name: "Make video" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByText("Export cancelled. Nothing was saved.")).toBeVisible();

  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByText(/ready and checked: 0:04, 360×640/)).toBeVisible({ timeout: 90_000 });
  expect(await smallTargets(page)).toEqual([]);
  const [video] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download video" }).click()]);
  expect(video.suggestedFilename()).toBe("portrait - subtitles.mp4");
  const mp4 = readFileSync(await video.path());
  expect(mp4.subarray(4, 8).toString()).toBe("ftyp");
  expect(mp4.length).toBeGreaterThan(10_000);

  const [srt] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download SRT" }).click()]);
  expect(srt.suggestedFilename()).toBe("portrait - subtitles.srt");
  const text = readFileSync(await srt.path(), "utf8");
  expect(text).toMatch(/^1\r\n00:00:00,000 --> 00:00:0\d,\d{3}\r\nவணக்கம் நண்பர்களே\r\n\r\n2\r\n/);
  expect(await storedVideoHash(page)).toBe(before);
});

test("G2 leaving the page while a video is being made asks first", async ({ page }) => {
  await easyProject(page);
  await page.getByRole("button", { name: "Export video" }).click();
  // Slow every frame down so the export is still running when we try to leave.
  await page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype as unknown as { drawImage: (...a: unknown[]) => void };
    const orig = proto.drawImage;
    proto.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
      const until = performance.now() + 40;
      while (performance.now() < until) {
        /* busy */
      }
      orig.apply(this, args);
    };
  });
  await page.getByRole("dialog", { name: "Export" }).getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("progressbar", { name: "Export progress" })).toBeVisible();
  let asked = false;
  page.once("dialog", (d) => {
    asked = d.type() === "beforeunload";
    void d.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => asked).toBe(true);
});

test("G3 export from Editor mode is the same panel", async ({ page }) => {
  await easyProject(page);
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export" }).getByRole("heading", { name: "Video with subtitles (MP4)" })).toBeVisible();
});
