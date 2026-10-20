/**
 * Voice route with real Whisper weights. Needs the model files on disk, so it runs only when
 * E2E_MODEL_DIR points at a folder containing Xenova/whisper-tiny/… (served in place of Hugging Face).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { fixture } from "./helpers";

const MODEL_DIR = process.env.E2E_MODEL_DIR ?? "";
test.skip(!MODEL_DIR, "set E2E_MODEL_DIR to run the speech tests");

test("D1 voice: download once, cancel recognition (nothing changes), recognise, then remove the model", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "one screen size is enough for the slow model test");
  await page.route("https://huggingface.co/**", async (route) => {
    const m = /^\/Xenova\/whisper-[a-z]+\/resolve\/main\/(.+)$/.exec(new URL(route.request().url()).pathname);
    const file = m ? join(MODEL_DIR, "Xenova/whisper-tiny", m[1]) : "";
    if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: "not found" });
    const body = readFileSync(file);
    return route.fulfill({ status: 200, body, headers: { "content-length": String(body.length), "access-control-allow-origin": "*" } });
  });
  const clip = process.env.E2E_SPEECH_CLIP ?? fixture("portrait.mp4");
  await page.goto("./");
  await page.getByRole("button", { name: "Make subtitles" }).click();
  await page.locator("input[type=file]").first().setInputFiles(clip);
  await page.getByRole("button", { name: "Next: the words" }).click();
  await page.getByRole("radio", { name: /From the voice/ }).click();
  await page.getByLabel("Spoken language").selectOption("en");
  await page.getByRole("button", { name: /Download Base/ }).click();
  const make = page.getByRole("button", { name: "Make subtitles" });
  await expect(make).toBeEnabled({ timeout: 120_000 });

  await make.click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(/cancelled/i).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Pick a look" })).toHaveCount(0);

  await make.click();
  await expect(page.getByRole("heading", { name: "Pick a look" }).or(page.getByText(/No speech was recognised/))).toBeVisible({ timeout: 300_000 });

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Remove/ }).first().click();
  await page.getByRole("button", { name: "Remove model" }).click();
  await expect.poll(async () => page.evaluate(async () => (await (await caches.open("transformers-cache")).keys()).length)).toBe(0);
});
