import { expect, test, type Page } from "@playwright/test";
import { axeProblems, fixture, noSidewaysScroll, smallTargets } from "./helpers";

async function textProject(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("article", { name: "Create subtitles from text" }).getByRole("button", { name: "Start" }).click();
  await page.locator("input[type=file]").first().setInputFiles(fixture("landscape.mkv"));
  await expect(page.getByText("Audio track detected")).toBeVisible();
  await page.locator("input[type=file]").nth(1).setInputFiles(fixture("words.txt"));
  await expect(page.getByText("Found 3 subtitles.")).toBeVisible();
}

const generated = (page: Page) => page.getByRole("list", { name: "Generated subtitles" }).getByRole("listitem").allInnerTexts();
const mediaCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("subtitle-studio");
        req.onsuccess = () => {
          const c = req.result.transaction("media").objectStore("media").count();
          c.onsuccess = () => {
            resolve(c.result);
          };
          c.onerror = () => {
            reject(new Error("count failed"));
          };
        };
        req.onerror = () => {
          reject(new Error("open failed"));
        };
      }),
  );

test("C1 TXT workflow: the timing modes give different, explained results", async ({ page }) => {
  await textProject(page);
  const readable = await generated(page);
  await page.getByRole("radio", { name: /Equal distribution/ }).check();
  await expect.poll(() => generated(page)).not.toEqual(readable);
  const equal = await generated(page);
  await page.getByRole("radio", { name: /Fit to video/ }).check();
  await expect.poll(() => generated(page)).not.toEqual(equal);
  // Readable timing runs past this short video: warned about, not silently squeezed.
  await page.getByRole("radio", { name: /Readable duration/ }).check();
  await expect(page.getByText(/runs .* past the end of the video/)).toBeVisible();
  await expect(page.getByText("Nothing was changed automatically.", { exact: false })).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  await noSidewaysScroll(page);
});

test("E1 numeric timing; overlaps are warned about, not moved; regeneration asks first; autosave survives a reload", async ({ page }) => {
  await textProject(page);
  await page.getByRole("radio", { name: /Equal distribution/ }).check();
  await page.getByRole("button", { name: "Open in editor" }).click();
  const list = page.getByRole("list", { name: "Subtitles" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  const timesOf = async (i: number) => /\d\d:\d\d:\d\d\.\d{3} → \d\d:\d\d:\d\d\.\d{3}/.exec(await list.getByRole("listitem").nth(i).innerText())?.[0];
  const firstBefore = await timesOf(0);
  expect(firstBefore).toBeTruthy();

  // Select subtitle 2 and start it inside subtitle 1.
  await list.getByRole("listitem").nth(1).getByRole("button").first().click();
  if (test.info().project.name === "phone") await page.getByRole("button", { name: "Edit subtitle" }).click();
  const start = page.getByRole("textbox", { name: "Start" });
  await start.fill("0.3");
  await start.press("Enter");
  await expect(page.getByText(/Subtitle 2 starts at 00:00:00.300, before subtitle 1 ends/).first()).toBeVisible();
  expect(await timesOf(0)).toBe(firstBefore); // subtitle 1 was not moved
  await expect(page.getByText("✓ Saved")).toBeVisible();

  // Regenerating would replace the hand-set time: it asks first, and Cancel keeps it.
  await page.getByRole("button", { name: "Regenerate timing…" }).click();
  const dialog = page.getByRole("dialog", { name: "Replace the timing of all subtitles?" });
  await expect(dialog.getByText("Any timing you set by hand will be lost.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(start).toHaveValue("00:00:00.300");

  expect(await axeProblems(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  await noSidewaysScroll(page);
  if (test.info().project.name === "phone") await page.getByRole("dialog", { name: "Edit subtitle" }).getByRole("button", { name: "Done" }).click();

  // Reload: the project and the edit are still there.
  await page.reload();
  await page.getByRole("button", { name: "Open landscape" }).click();
  await expect(page.getByRole("list", { name: "Subtitles" }).getByRole("listitem").nth(1)).toContainText("00:00:00.300");
});

test("H1 deleting a project also frees its stored video", async ({ page }) => {
  await textProject(page);
  await page.getByRole("button", { name: "Open in editor" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  expect(await mediaCount(page)).toBe(1);
  await page.getByRole("button", { name: "← Projects" }).click();
  await page.getByRole("button", { name: "Delete landscape" }).click();
  await page.getByRole("dialog", { name: "Delete this project?" }).getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByRole("button", { name: "Open landscape" })).toHaveCount(0);
  expect(await mediaCount(page)).toBe(0);
});
