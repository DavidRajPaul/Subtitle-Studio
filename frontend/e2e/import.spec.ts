import { expect, test } from "@playwright/test";
import { axeProblems, easyProject, fixture, noSidewaysScroll, smallTargets, subtitleInk, watchErrors } from "./helpers";

for (const clip of ["portrait.mp4", "iphone-style.mov", "landscape.webm", "landscape.mkv"]) {
  test(`B1 ${clip} opens and previews with subtitles`, async ({ page }) => {
    const errors = watchErrors(page);
    await easyProject(page, clip);
    await expect.poll(() => page.evaluate(() => document.querySelector("video")?.readyState ?? 0)).toBeGreaterThanOrEqual(2);
    await expect.poll(() => subtitleInk(page)).toBeGreaterThan(500);
    expect(errors).toEqual([]);
  });
}

test("B2 formats a browser cannot read are refused, and another file can be chosen straight away", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Make subtitles" }).click();
  const input = page.locator("input[type=file]").first();
  expect(await axeProblems(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  await input.setInputFiles(fixture("old.avi"));
  await expect(page.getByRole("alert")).toContainText("AVI videos cannot be opened in a browser. Convert it to MP4");
  expect(await axeProblems(page)).toEqual([]);
  await input.setInputFiles({ name: "broken.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(4000, 7) });
  await expect(page.getByRole("alert")).toContainText("could not be read as a video");
  await input.setInputFiles({ name: "empty.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(0) });
  await expect(page.getByRole("alert")).toContainText("This file is empty");
  await input.setInputFiles(fixture("portrait.mp4"));
  await expect(page.getByRole("button", { name: "Next: the words" })).toBeVisible();
});

test("B3 Editor mode shows the video's details", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("article", { name: "Create subtitles from text" }).getByRole("button", { name: "Start" }).click();
  await page.locator("input[type=file]").first().setInputFiles(fixture("landscape.mkv"));
  await expect(page.getByText("640×360", { exact: false })).toBeVisible();
  await expect(page.getByText("Audio track detected")).toBeVisible();
});

test("B4 the words step works by touch and screen reader in every option", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Make subtitles" }).click();
  await page.locator("input[type=file]").first().setInputFiles(fixture("portrait.mp4"));
  await page.getByRole("button", { name: "Next: the words" }).click();
  for (const option of [/From the voice/, /Type or paste/, /A TXT file/]) {
    await page.getByRole("radio", { name: option }).click();
    expect(await axeProblems(page), String(option)).toEqual([]);
    expect(await smallTargets(page), String(option)).toEqual([]);
    await noSidewaysScroll(page);
  }
});

test("B5 a silent video explains why the voice option cannot work and offers the others", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Make subtitles" }).click();
  await page.locator("input[type=file]").first().setInputFiles(fixture("silent.mp4"));
  await page.getByRole("button", { name: "Next: the words" }).click();
  const voice = page.getByRole("radio", { name: /From the voice/ });
  await expect(voice).toBeDisabled();
  await expect(voice).toContainText("This video has no sound. Type the words or use a TXT file.");
  await expect(page.getByRole("radio", { name: /Type or paste/ })).toBeEnabled();
});
