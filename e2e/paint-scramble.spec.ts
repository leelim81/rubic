import { expect, test } from "@playwright/test";
import { solvedFourString } from "../src/cube/four";
import { solvedFiveString } from "../src/cube/five";

test("Scramble in the colour screen fills a random 4×4 and it solves", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Cube size").selectOption("4");
  await page.reload();
  await page.getByRole("button", { name: "Enter colours" }).click();
  await expect(page.getByTestId("paint-face")).toContainText("Front");
  await page.getByRole("button", { name: "Scramble", exact: true }).click();
  await expect(page.getByTestId("paint-progress")).toHaveText("16/16 filled");
  await expect(page.getByTestId("paint-face")).toContainText("Down · 6 of 6");
  const cells = await page.getByTestId("paint-cells").innerText();
  expect(cells).toHaveLength(96);
  expect(cells).not.toContain(".");
  expect(cells).not.toBe(solvedFourString());
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 1 of \d+/, { timeout: 120_000 });
});

test("Scramble in the colour screen fills a random 5×5 and it solves", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Cube size").selectOption("5");
  await page.reload();
  await page.getByRole("button", { name: "Enter colours" }).click();
  await expect(page.getByTestId("paint-face")).toContainText("Front");
  await page.getByRole("button", { name: "Scramble", exact: true }).click();
  await expect(page.getByTestId("paint-progress")).toHaveText("24/24 filled");
  await expect(page.getByTestId("paint-face")).toContainText("Down · 6 of 6");
  const cells = await page.getByTestId("paint-cells").innerText();
  expect(cells).toHaveLength(150);
  expect(cells).not.toContain(".");
  expect(cells).not.toBe(solvedFiveString());
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 1 of \d+/, { timeout: 120_000 });
});
