import { expect, test, type Page } from "@playwright/test";

const BRAND = "Trevor\u2019s Real Rubik\u2019s Solver";
const SHORT = "Trevor\u2019s Solver";
const TITLE = "Trevor\u2019s Real Rubik\u2019s Solver \u2014 step-by-step 3\u00d73 and 5\u00d75";

test("the page title and header use Trevor's Real Rubik's Solver", async ({ page }) => {
  await page.goto("./");
  await expect(page).toHaveTitle(TITLE);
  await expect(page.locator("meta[property='og:title']")).toHaveAttribute("content", TITLE);
  await expect(page.locator("meta[name='apple-mobile-web-app-title']")).toHaveAttribute("content", SHORT);
  await expect(page.getByRole("heading", { level: 1, name: BRAND })).toBeVisible();
  await expectBrand(page);
});

test("the brand stays on one line at phone, landscape, and desktop widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "This test sets its own viewport sizes.");
  const sizes: { width: number; height: number; shot?: string }[] = [
    { width: 320, height: 568, shot: "/opt/cursor/artifacts/brand-320x568.png" },
    { width: 375, height: 812, shot: "/opt/cursor/artifacts/brand-375x812.png" },
    { width: 740, height: 360 },
    { width: 1280, height: 800, shot: "/opt/cursor/artifacts/brand-1280x800.png" },
  ];
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("./");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.getByRole("button", { name: "Enter colours" }).waitFor();
    await expect(page).toHaveTitle(TITLE);
    await expectBrand(page);
    if (size.shot) await page.screenshot({ path: size.shot });

    await page.evaluate(() => localStorage.setItem("rubic-entered-v1", "1"));
    await page.reload();
    await page.getByRole("button", { name: "Edit colours" }).waitFor();
    await expectBrand(page);
  }
});

async function expectBrand(page: Page) {
  const view = page.viewportSize();
  expect(view).toBeTruthy();
  const expected = view!.width >= 640 ? BRAND : SHORT;
  const brand = page.getByTestId("brand");
  await expect(brand.locator("span:visible")).toHaveText(expected);
  const box = await brand.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.height).toBeLessThan(34);
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(view!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(view!.height + 1);
  const edit = page.getByRole("button", { name: "Edit colours" });
  if (await edit.count()) {
    const button = await edit.boundingBox();
    expect(button).toBeTruthy();
    expect(box!.x + box!.width).toBeLessThanOrEqual((button!.x ?? 0) + 1);
    expect(button!.x + button!.width).toBeLessThanOrEqual(view!.width + 1);
    const separated = box!.x + box!.width <= button!.x + 1 || box!.y + box!.height <= button!.y + 1 || button!.y + button!.height <= box!.y + 1;
    expect(separated).toBe(true);
  }
}
