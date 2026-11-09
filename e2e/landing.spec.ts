import { expect, test } from "@playwright/test";
import { faceletsToString, solvedBytes } from "../src/cube/model";
import { blankPaint } from "../src/view/paint";

const SOLVED = faceletsToString(solvedBytes());

test("an empty visit shows one button, and a saved cube comes back ready", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("./");
  await expect(page.getByTestId("empty-prompt")).toHaveText("Enter your cube's colours to get step-by-step help.");
  await expect(page.getByRole("button")).toHaveCount(1);
  const enter = page.getByRole("button", { name: "Enter colours" });
  await expect(enter).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit colours" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Next/ })).toHaveCount(0);
  await expect(page.getByTestId("solve-fast")).toHaveCount(0);
  await expect(page.locator("details.options-panel")).toHaveCount(0);
  const view = page.viewportSize()!;
  const cube = await page.locator(".cube-frame").boundingBox();
  const button = await enter.boundingBox();
  expect(cube && button).toBeTruthy();
  expect(button!.height).toBeGreaterThanOrEqual(44);
  expect(button!.y).toBeGreaterThanOrEqual(cube!.y + cube!.height - 1);
  expect(button!.y + button!.height).toBeLessThanOrEqual(view.height + 1);
  await page.screenshot({ path: `/opt/cursor/artifacts/empty-${testInfo.project.name}.png` });

  await enter.click();
  await expect(page.getByText("Hold the cube with the green centre facing you and the yellow centre on top.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button")).toHaveCount(1);

  await page.evaluate((start) => {
    const lesson = { start, moves: [], chunkOfMove: [], chunks: [], cursor: 0, history: [] };
    localStorage.setItem("rubic-entered-v1", "1");
    localStorage.setItem("rubic-lesson-v1", JSON.stringify(lesson));
    sessionStorage.setItem("rubic-lesson-v1", JSON.stringify(lesson));
  }, SOLVED);
  await page.reload();
  await expect(page.getByText("No moves needed")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Edit colours" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Next/ })).toBeVisible();
  await expect(page.getByTestId("solve-fast")).toBeVisible();
  await expect(page.locator("details.options-panel")).toBeVisible();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  const readyCube = await page.locator(".cube-frame").boundingBox();
  const next = await page.getByRole("button", { name: /^Next/ }).boundingBox();
  expect(readyCube && next && next.y).toBeGreaterThanOrEqual((readyCube?.y ?? 0) + (readyCube?.height ?? 0) - 1);
  await page.screenshot({ path: `/opt/cursor/artifacts/ready-${testInfo.project.name}.png` });

  await page.reload();
  await expect(page.getByRole("button", { name: "Edit colours" })).toBeVisible();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await expect(page.getByRole("button", { name: "Enter colours", exact: true })).toHaveCount(0);

  await page.locator("details.options-panel summary").click();
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move \d+ of \d+/, { timeout: 20_000 });
  const scrambled = await page.getByTestId("lesson-facelets").textContent();
  await page.reload();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(scrambled ?? "");
  await expect(page.getByRole("button", { name: "Edit colours" })).toBeVisible();
  await page.getByRole("button", { name: "Edit colours" }).click();
  await expect(page.getByTestId("paint-cells")).toHaveText(scrambled ?? "");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByTestId("paint-cells")).toHaveText(blankPaint());
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(scrambled ?? "");

  await page.locator("details.options-panel summary").click();
  await page.getByRole("button", { name: "New cube" }).click();
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByTestId("empty-prompt")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByTestId("empty-prompt")).toBeVisible();
});
