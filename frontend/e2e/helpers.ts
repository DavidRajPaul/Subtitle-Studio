import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

/** Console errors and page crashes, minus failed network fetches the test causes on purpose. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** How many pixels of the subtitle canvas are drawn on. */
export function subtitleInk(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(".subtitle-canvas__canvas");
    if (!c?.width) return -1;
    const ctx = c.getContext("2d");
    if (!ctx) return -1;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
}

/** Easy mode: pick a video, type the words, land on "Pick a look". */
export async function easyProject(page: Page, clip = "portrait.mp4", words = "வணக்கம் நண்பர்களே\nWelcome to the channel") {
  await page.goto("./");
  await page.getByRole("button", { name: "Make subtitles" }).click();
  await page.locator("input[type=file]").first().setInputFiles(fixture(clip));
  await page.getByRole("button", { name: "Next: the words" }).click();
  await page.getByRole("radio", { name: /Type or paste/ }).click();
  await page.getByRole("textbox", { name: "The words" }).fill(words);
  await page.getByRole("button", { name: "Make subtitles" }).click();
  await expect(page.getByRole("heading", { name: "Pick a look" })).toBeVisible();
  await expect(page.getByText("✓ Saved")).toBeVisible();
}

/** Serious and critical accessibility problems on the current screen (axe-core, WCAG 2 A/AA). */
export async function axeProblems(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

/** Visible buttons, links and form controls smaller than 44×44 CSS pixels (touch target rule). */
export function smallTargets(page: Page, min = 44): Promise<string[]> {
  return page.evaluate((m) => {
    const out: string[] = [];
    const els = document.querySelectorAll<HTMLElement>("button, a[href], input:not([type=hidden]), select, textarea, [role=radio], [role=tab]");
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || el.closest(".visually-hidden,[aria-hidden=true]")) continue;
      // A range slider's thumb is what is touched; its track may be thin.
      if (el instanceof HTMLInputElement && (el.type === "range" || el.type === "checkbox" || el.type === "radio")) {
        const label = el.closest("label");
        const lr = label?.getBoundingClientRect();
        if (el.type === "range" ? r.width >= m && r.height >= 24 : lr && lr.height >= m) continue;
      }
      // A timeline block's width is its duration; its height must still be tappable, and every
      // block also has a full-size row in the subtitle list.
      if (el.classList.contains("timeline__block") ? r.height < m : r.width < m || r.height < m) {
        const name = (el.getAttribute("aria-label") ?? el.textContent).trim().slice(0, 30);
        out.push(`${el.tagName.toLowerCase()} "${name}" ${String(Math.round(r.width))}×${String(Math.round(r.height))}`);
      }
    }
    return out;
  }, min);
}

export async function noSidewaysScroll(page: Page) {
  const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll, "page scrolls sideways").toBeLessThanOrEqual(width);
}
