import { expect, test } from "@playwright/test";
import { easyProject, fixture } from "./helpers";

test("X1 storage full: the reason is shown, leaving asks first, and Retry saves once there is space", async ({ page }) => {
  // Lets the test make every database write fail the way a full device does.
  await page.addInitScript(() => {
    const w = window as unknown as { __full: boolean };
    w.__full = false;
    const proto = IDBObjectStore.prototype as unknown as { put: (...a: unknown[]) => IDBRequest };
    const put = proto.put;
    proto.put = function (this: IDBObjectStore, ...args: unknown[]) {
      if (w.__full) throw new DOMException("full", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await easyProject(page);
  await page.evaluate(() => {
    (window as unknown as { __full: boolean }).__full = true;
  });
  await page.getByText(/Fix words/).click();
  await page.getByLabel("Subtitle 1").fill("changed while full");
  await expect(page.getByText("Could not save")).toBeVisible();
  await expect(page.getByText(/not enough free space/i).first()).toBeVisible();

  await page.getByRole("button", { name: "← Projects" }).click();
  const ask = page.getByRole("dialog", { name: "Your latest changes were not saved" });
  await expect(ask).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __full: boolean }).__full = false;
  });
  await ask.getByRole("button", { name: "Stay and retry" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open portrait" }).click();
  await page.getByText(/Fix words/).click();
  await expect(page.getByLabel("Subtitle 1")).toHaveValue("changed while full");
});

test("X2 private browsing that blocks storage is explained, with a next step", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
  });
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("Turn off private browsing, or try another browser.");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("X3 a project whose video is gone keeps its subtitles and can still save the SRT", async ({ page }) => {
  await easyProject(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.open("subtitle-studio");
        r.onsuccess = () => {
          const tx = r.result.transaction("media", "readwrite");
          tx.objectStore("media").clear();
          tx.oncomplete = () => {
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await expect(page.getByText("Video missing:")).toBeVisible();
  await page.getByRole("button", { name: "Open portrait" }).click();
  await expect(page.getByRole("heading", { name: "The video for this project is not on this device" })).toBeVisible();
  await page.getByRole("button", { name: "Export video" }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByText(/so a video cannot be made/)).toBeVisible();
  const [srt] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download SRT" }).click()]);
  expect(srt.suggestedFilename()).toBe("portrait - subtitles.srt");
});

test("X4 a failed model download says why and can be tried again; cancelling a download leaves nothing behind", async ({ page }) => {
  await page.route("https://huggingface.co/**", (route) => route.abort("internetdisconnected"));
  await page.goto("./");
  await page.getByRole("button", { name: "Make subtitles" }).click();
  await page.locator("input[type=file]").first().setInputFiles(fixture("portrait.mp4"));
  await page.getByRole("button", { name: "Next: the words" }).click();
  await page.getByRole("radio", { name: /From the voice/ }).click();
  await page.getByRole("button", { name: /Download Base/ }).click();
  await expect(page.getByText(/Check the internet connection/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Try the download again/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make subtitles" })).toBeDisabled();

  // A download that never finishes can be cancelled.
  await page.unroute("https://huggingface.co/**");
  await page.route("https://huggingface.co/**", () => new Promise(() => undefined));
  await page.getByRole("button", { name: /Try the download again/ }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Download cancelled. Nothing was kept.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Try the download again/ })).toBeVisible();
  const cached = await page.evaluate(async () => {
    const c = await caches.open("transformers-cache");
    return (await c.keys()).length;
  });
  expect(cached).toBe(0);
});

test("X5 a browser that cannot make videos says so and still offers the SRT", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "VideoEncoder", { value: undefined, configurable: true });
  });
  await easyProject(page);
  await page.getByRole("button", { name: "Export video" }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByText(/cannot make video files/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Download SRT" })).toBeEnabled();
});
