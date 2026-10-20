import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./helpers";

/** Presses Tab until the focused element's accessible text matches, then checks focus is visible. */
async function tabTo(page: Page, name: RegExp) {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el.tagName === "H1" || el.tagName === "MAIN") return null;
      const s = getComputedStyle(el);
      const label = el.getAttribute("aria-label") ?? el.textContent;
      return { label: label.trim(), outline: s.outlineStyle !== "none" && s.outlineWidth !== "0px", shadow: s.boxShadow !== "none" };
    });
    if (info && name.test(info.label)) {
      expect(info.outline || info.shadow, `focus is visible on "${info.label}"`).toBe(true);
      return;
    }
  }
  throw new Error(`Could not reach ${String(name)} with the Tab key`);
}

test("K1 the Easy flow works with the keyboard alone, with visible focus", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "keyboard use is a desktop concern");
  await page.goto("./");
  await tabTo(page, /^Make subtitles$/);
  await page.keyboard.press("Enter");
  await tabTo(page, /^Pick a video$/);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
  await chooser.setFiles(fixture("portrait.mp4"));
  await tabTo(page, /^Next: the words$/);
  await page.keyboard.press("Enter");
  await tabTo(page, /From the voice/); // the group is one Tab stop; arrows choose inside it
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: /Type or paste/ })).toHaveAttribute("aria-checked", "true");
  await tabTo(page, /^$|வணக்கம்/); // the empty words box
  await page.keyboard.type("Hello\nWorld");
  await tabTo(page, /^Make subtitles$/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Pick a look" })).toBeVisible();
  await tabTo(page, /^Classic$/);
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Neon" }).first()).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Neon" }).first()).toBeFocused();
  await tabTo(page, /^Export video$/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Export" })).toHaveCount(0);
});
