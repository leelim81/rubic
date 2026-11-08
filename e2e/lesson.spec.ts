import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("./");
  await page.waitForSelector("text=No moves needed");
  (page as unknown as { __errors: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  const errors = (page as unknown as { __errors?: string[] }).__errors ?? [];
  expect(errors).toEqual([]);
});

test("options stay closed until opened, and face buttons work from the keyboard", async ({ page }, testInfo) => {
  const options = page.locator("details.options-panel summary");
  await expect(options).toHaveText("Options");
  await expect(options).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Turn speed")).toBeHidden();
  await expect(page.getByRole("button", { name: "Scramble" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Scan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Top, front edge left U", exact: true })).toBeHidden();
  if (testInfo.project.name === "desktop") {
    await options.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/rubic-disclosure-desktop.png" });
  }
  await options.focus();
  await expect(options).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(options).toHaveText("Hide options");
  await expect(options).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Top, front edge left U", exact: true })).toBeVisible();
  await options.click();
  await expect(options).toHaveText("Options");
  await expect(options).toHaveAttribute("aria-expanded", "false");
});

test("scramble, next, back, and replay stay in step", async ({ page }, testInfo) => {
  await page.locator("details.options-panel summary").click();
  await page.getByRole("button", { name: "Scramble" }).click();
  const step = page.getByTestId("lesson-step");
  await expect(step).toHaveText(/Step 1 of|Half turn/, { timeout: 20_000 });
  const before = await step.textContent();
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(step).not.toHaveText(before ?? "");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(step).toHaveText(before ?? "");
  await page.screenshot({ path: testInfo.project.name === "mobile" ? "/tmp/rubic-mobile-lesson.png" : "/tmp/rubic-desktop-lesson.png", fullPage: true });
  await page.getByRole("button", { name: "Replay move" }).click();
  await page.waitForTimeout(400);
  await expect(step).toHaveText(before ?? "");
});

test("reset returns to the solved empty state", async ({ page }) => {
  await page.locator("details.options-panel summary").click();
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Step 1 of|Half turn/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText("No moves needed")).toBeVisible();
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

test("manual entry of the solved net returns to the cube", async ({ page }) => {
  await page.getByRole("button", { name: "Enter colours" }).click();
  await page.getByRole("button", { name: "Use these colours" }).click();
  await expect(page.getByText("No moves needed")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Scan" })).toHaveCount(0);
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
