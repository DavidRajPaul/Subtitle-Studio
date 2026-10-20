import { expect, test } from "@playwright/test";
import { axeProblems, easyProject, noSidewaysScroll, smallTargets, subtitleInk } from "./helpers";

const TABS = ["Looks", "Animation", "Font", "Size", "Colour", "Align", "Spacing"];

test("F1 every style tab is usable on this screen size and changes the picture", async ({ page }) => {
  await easyProject(page);
  if (test.info().project.name === "phone") await page.getByRole("button", { name: "More styling" }).click();
  const before = await subtitleInk(page);
  for (const tab of TABS) {
    await page.getByRole("tab", { name: new RegExp(tab) }).first().click();
    await page.waitForTimeout(300);
    expect(await axeProblems(page), `accessibility on ${tab}`).toEqual([]);
    expect(await smallTargets(page), `touch targets on ${tab}`).toEqual([]);
    await noSidewaysScroll(page);
  }
  await page.getByRole("tab", { name: /Looks/ }).first().click();
  await page.getByRole("radiogroup", { name: "Looks" }).last().getByRole("radio", { name: /Neon/ }).click();
  await expect.poll(() => subtitleInk(page)).not.toBe(before);
});

test("F2 presets: save with a name, apply to another video, rename and delete", async ({ page }) => {
  await easyProject(page);
  const phone = test.info().project.name === "phone";
  if (phone) await page.getByRole("button", { name: "More styling" }).click();
  const studio = phone ? page.getByRole("dialog", { name: "Style" }) : page.getByRole("region", { name: "More styling" });
  await studio.getByRole("tab", { name: /Size/ }).click();
  await studio.getByRole("button", { name: "Save as preset" }).click();
  await expect(studio.getByLabel("Preset name")).toHaveValue("My style 1");
  await studio.getByLabel("Preset name").fill("Wedding Tamil");
  await studio.getByRole("button", { name: "Save preset" }).click();
  await expect(studio.getByText("Wedding Tamil", { exact: true })).toBeVisible();
  if (phone) await studio.getByRole("button", { name: "Done" }).click();

  // A new video starts with that preset; switching away and back re-applies it.
  await easyProject(page, "landscape.webm");
  await expect(page.getByText("✓ Preset:").first()).toBeVisible();
  await page.getByRole("radiogroup", { name: "Looks" }).first().getByRole("radio", { name: /Neon/ }).click();
  await expect(page.getByRole("button", { name: "Save as preset" }).first()).toBeVisible();
  await page.getByRole("radiogroup", { name: "My presets" }).first().getByRole("radio", { name: /Wedding Tamil/ }).click();
  await expect(page.getByText("✓ Preset:").first()).toBeVisible();

  await page.getByRole("button", { name: "Options for Wedding Tamil" }).first().click();
  const manage = page.getByRole("region", { name: "Preset “Wedding Tamil”" }).first();
  await manage.getByLabel("Name").fill("Wedding");
  await manage.getByRole("button", { name: "Rename" }).click();
  const renamed = page.getByRole("region", { name: "Preset “Wedding”" }).first();
  await renamed.getByRole("button", { name: "Delete…" }).click();
  await renamed.getByRole("button", { name: "Delete preset" }).click();
  await expect(page.getByText(/No presets yet/).first()).toBeVisible();
});
