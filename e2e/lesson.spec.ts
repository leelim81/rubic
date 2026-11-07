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
  const errors = (page as unknown as { __errors?: string[] }).__errors ?? [];
  expect(errors).toEqual([]);
});

test("show and hide controls are buttons you can use from the keyboard", async ({ page }, testInfo) => {
  const faces = page.locator("details.face-fallback summary");
  await expect(faces).toHaveText("Show face buttons");
  await expect(faces).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Top, front edge left U", exact: true })).toBeHidden();
  if (testInfo.project.name === "desktop") {
    await faces.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/rubic-disclosure-desktop.png" });
  }
  await faces.focus();
  await expect(faces).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(faces).toHaveText("Hide face buttons");
  await expect(faces).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Top, front edge left U", exact: true })).toBeVisible();
  await faces.click();
  await expect(faces).toHaveText("Show face buttons");
  await expect(faces).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "Scramble" }).click();
  const why = page.locator("details.more summary");
  await expect(why).toHaveText("Show why this step", { timeout: 20_000 });
  await expect(why).toHaveAttribute("aria-expanded", "false");
  await why.focus();
  await page.keyboard.press("Enter");
  await expect(why).toHaveText("Hide why this step");
  await expect(why).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("On this cube.")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(why).toHaveText("Show why this step");
  await expect(why).toHaveAttribute("aria-expanded", "false");
});

test("scramble, next, back, and demonstration stay in step", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Scramble" }).click();
  const step = page.getByTestId("lesson-step");
  await expect(step).toHaveText(/Step 1 of/, { timeout: 20_000 });
  const before = await step.textContent();
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(step).not.toHaveText(before ?? "");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(step).toHaveText(before ?? "");
  await page.screenshot({ path: testInfo.project.name === "mobile" ? "/tmp/rubic-mobile-lesson.png" : "/tmp/rubic-desktop-lesson.png", fullPage: true });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(400);
  await expect(step).toHaveText(before ?? "");
});

test("reset returns to the solved empty state", async ({ page }) => {
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Step 1 of/, { timeout: 20_000 });
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
  await expect(page.getByText("Face 1 of 6")).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture photo" })).toBeVisible();
  await expect(page.getByText(/close this scan and start again/i)).toBeVisible();
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
