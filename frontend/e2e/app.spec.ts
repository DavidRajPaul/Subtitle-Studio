import { expect, test } from "@playwright/test";
import { axeProblems, noSidewaysScroll, smallTargets, watchErrors } from "./helpers";

test("A1 first visit opens in Easy mode with no errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Easy" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Make subtitles" })).toBeVisible();
  await noSidewaysScroll(page);
  expect(await axeProblems(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("A2 the app opens again without internet after the first visit", async ({ page, context }) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // the service worker now controls the page
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Make subtitles" })).toBeVisible();
  await context.setOffline(false);
});

test("A3 Editor mode is one tap away and remembered", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create a subtitle project" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Editor", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await axeProblems(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  await noSidewaysScroll(page);
});

test("A4 Settings links to the licences of everything shipped", async ({ page, request }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Settings" }).click();
  const link = page.getByRole("link", { name: "Free software used by the app (licences)" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const res = await request.get(new URL(href ?? "", page.url()).href);
  expect(res.ok()).toBe(true);
  const text = await res.text();
  for (const name of ["mediabunny", "onnxruntime-web", "@huggingface/transformers", "react"]) expect(text).toContain(name);
  expect(text).toContain("Mozilla Public License");
  expect(await axeProblems(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});
