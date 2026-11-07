import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("./");
  await page.waitForSelector("text=This cube is solved");
  (page as unknown as { __errors: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  const errors = ((page as unknown as { __errors?: string[] }).__errors ?? []).filter(
    (error) => !error.includes("favicon") && !error.includes("Failed to load resource"),
  );
  expect(errors).toEqual([]);
});

test("scramble, next, back, and demonstration stay in step", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByText(/Move 1 of/)).toBeVisible({ timeout: 20_000 });
  const before = await page.getByText(/Move 1 of/).textContent();
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByText(/Move 2 of/)).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText(before ?? "Move 1 of")).toBeVisible();
  await page.screenshot({ path: testInfo.project.name === "mobile" ? "/tmp/rubic-mobile-lesson.png" : "/tmp/rubic-desktop-lesson.png", fullPage: true });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(400);
  await expect(page.getByText(/Move 1 of/)).toBeVisible();
});

test("reset returns to the solved empty state", async ({ page }) => {
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByText(/Move 1 of/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText("This cube is solved")).toBeVisible();
});

test("manual colours can reject an impossible cube", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Enter colours" }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("button", { name: "white", exact: true }).click();
  const stickers = page.locator(".net .sticker");
  await stickers.nth(0).click();
  await page.getByRole("button", { name: "Use these colours" }).click();
  await expect(page.getByText(/Every sticker needs a colour|9 stickers/)).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/tmp/rubic-manual.png", fullPage: true });
  }
});

test("scan instructions explain six photos", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Scan" }).click();
  await expect(page.getByText("Photograph all six faces")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use camera" })).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/tmp/rubic-scan.png", fullPage: true });
  }
});

test("states that moves jump when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByText("Reduced motion is on")).toBeVisible();
});

test("assets are served under /rubic/", async ({ page }) => {
  const response = await page.goto("./");
  expect(response?.ok()).toBeTruthy();
  const html = await page.content();
  expect(html).toContain("/rubic/assets/");
});
