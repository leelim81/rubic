import { expect, test } from "@playwright/test";
import { solvedFourString } from "../src/cube/four";

const SOLVED = solvedFourString();

test("a 4×4 can be scrambled and solved until every face is one colour", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.addInitScript((solved) => {
    localStorage.setItem("rubic-size-v1", "4");
    localStorage.setItem("rubic-entered-v1", "1");
    localStorage.setItem("rubic-lesson-v1", JSON.stringify({
      start: solved,
      moves: [],
      chunkOfMove: [],
      chunks: [],
      cursor: 0,
      history: [],
    }));
  }, SOLVED);
  await page.goto("./");
  await page.locator("details.options-panel summary").click();
  await expect(page.getByRole("button", { name: "Scramble" })).toBeEnabled();
  const method = page.getByRole("combobox", { name: "Solution method" });
  await expect(method).toBeDisabled();
  await expect(method).toHaveValue("expert");
  await expect(page.getByRole("combobox", { name: "Cube size" })).toHaveValue("4");
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 1 of \d+/, { timeout: 60_000 });
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByTestId("move-line")).toContainText(/outer face|two layers|inner slice/);
  if (testInfo.project.name === "desktop") await page.screenshot({ path: "/opt/cursor/artifacts/four-solving-desktop.png" });
  await page.getByTestId("solve-fast").click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 150_000 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  const faces = await page.getByTestId("lesson-facelets").textContent();
  for (let face = 0; face < 6; face += 1) {
    const stickers = faces!.slice(face * 16, face * 16 + 16);
    expect(new Set(stickers).size, `face ${face}`).toBe(1);
  }
  if (testInfo.project.name === "mobile") await page.screenshot({ path: "/opt/cursor/artifacts/four-solved-phone.png" });
});

test("a 4×4 paint face has no fixed centre", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.setItem("rubic-size-v1", "4"));
  await page.reload();
  await page.getByRole("button", { name: "Enter colours" }).click();
  await expect(page.getByTestId("paint-progress")).toHaveText("0/16 filled");
  await expect(page.getByText("no fixed centre")).toBeVisible();
});
