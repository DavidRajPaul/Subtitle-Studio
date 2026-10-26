import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { axeProblems, easyProject, smallTargets } from "./helpers";

const phone = () => test.info().project.name === "phone";

async function exportAndCheck(page: Page, lengthText: RegExp) {
  await page.getByRole("button", { name: phone() || !(await page.getByRole("button", { name: "Export video" }).count()) ? /^Export( video)?$/ : "Export video" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await dialog.getByRole("button", { name: "Make video" }).click();
  await expect(dialog.getByText(lengthText)).toBeVisible({ timeout: 90_000 });
  const [video] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download video" }).click()]);
  const [srt] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download SRT" }).click()]);
  return { mp4: await video.path(), srt: readFileSync(await srt.path(), "utf8") };
}

test("F1.1 Easy mode: trim the start and end; preview, SRT and video use the trimmed length", async ({ page }) => {
  await easyProject(page, "portrait.mp4", "One\nTwo");
  await page.getByRole("button", { name: "Trim video" }).click();
  const sheet = page.getByRole("dialog", { name: "Trim video" });
  await expect(sheet.getByText("The whole video is used (00:00:04.000)", { exact: false })).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  await sheet.getByLabel("Keep from").fill("1");
  await sheet.getByLabel("Keep until").fill("3");
  await sheet.getByRole("button", { name: "Trim" }).click();
  await expect(sheet.getByText(/The video is now 00:00:02.000 long/)).toBeVisible();
  await expect(sheet.getByText("Original 00:00:00.000 – 00:00:01.000 (1.0 s)")).toBeVisible();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(page.getByLabel("Duration")).toHaveText("00:00:02.000");
  await expect(page.getByText("✓ Saved")).toBeVisible();
  const out = await exportAndCheck(page, /ready and checked: 0:02/);
  // Original subtitles 0–1.95 s and 2.05–4.0 s; keeping 1–3 s shortens both and starts at zero.
  expect(out.srt).toBe("1\r\n00:00:00,000 --> 00:00:00,950\r\nOne\r\n\r\n2\r\n00:00:01,050 --> 00:00:02,000\r\nTwo\r\n");
  expect(readFileSync(out.mp4).subarray(4, 8).toString()).toBe("ftyp");
});

test("F1.2–F1.5 Editor: split twice, delete the middle, playback skips it, put it back", async ({ page }) => {
  await easyProject(page, "portrait.mp4", "One\nTwo\nThree\nFour");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(page.getByRole("list", { name: "Subtitles" })).toBeVisible();
  const go = async (s: string) => {
    await page.getByLabel(/^Go to time/).fill(s);
    await page.getByRole("button", { name: "Go", exact: true }).click();
  };
  const openCut = async () => {
    if (phone()) await page.getByRole("button", { name: "Cut video" }).click();
    else await page.getByRole("button", { name: "Cut video" }).click();
  };
  const panel = () => (phone() ? page.getByRole("dialog", { name: "Cut video" }) : page.getByRole("complementary"));
  await go("1");
  await openCut();
  await panel().getByRole("button", { name: "Split here" }).click();
  if (phone()) await panel().getByRole("button", { name: "Done" }).click();
  await go("2.5");
  await openCut();
  await panel().getByRole("button", { name: "Split here" }).click();
  await expect(panel().getByText(/Part 3:/)).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  if (phone()) await panel().getByRole("button", { name: "Done" }).click();
  await go("1.5");
  await openCut();
  await panel().getByRole("button", { name: "Delete this part" }).click();
  const ask = panel().getByRole("alertdialog");
  if (await ask.count()) await ask.getByRole("button", { name: "Cut anyway" }).click();
  await expect(panel().getByText(/The video is now 00:00:02.500 long/)).toBeVisible();
  if (phone()) await panel().getByRole("button", { name: "Done" }).click();
  await expect(page.getByLabel("Duration")).toHaveText("00:00:02.500");

  // Play from the start: the original's 1.0–2.5 s must never be shown.
  await go("0");
  const seen: number[] = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const v = document.querySelector("video");
        if (!v) {
          resolve([]);
          return;
        }
        const times: number[] = [];
        const timer = setInterval(() => times.push(v.currentTime), 20);
        void v.play();
        setTimeout(() => {
          clearInterval(timer);
          v.pause();
          resolve(times);
        }, 3500);
      }),
  );
  const inside = seen.filter((s) => s > 1.08 && s < 2.45);
  expect(inside, `video showed cut-away time: ${inside.join(", ")}`).toEqual([]);
  expect(Math.max(...seen)).toBeGreaterThan(3.5); // reached the last part

  const out = await exportAndCheck(page, /ready and checked: 0:0[23]/);
  expect(out.srt).toContain("00:00:00,000");

  // Put the middle back.
  await page.keyboard.press("Escape");
  await openCut();
  await panel().getByRole("button", { name: "Put back 00:00:01.000 to 00:00:02.500" }).click();
  await expect(panel().getByText(/The whole video is used/)).toBeVisible();
});
