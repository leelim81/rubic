import { expect, test } from "@playwright/test";
import { applyFourString, randomFourScramble, solvedFourString, validateFour } from "../src/cube/four";
import { mulberry32 } from "../src/cube/model";
import { PAINT_FACES, faceletIndex } from "../src/view/paint";
import { paintSticker } from "./paint-click";

const NAMES: Record<string, string> = { w: "white", y: "yellow", r: "red", o: "orange", b: "blue", g: "green" };

function swapped(text: string, i: number, j: number): string {
  const cells = [...text];
  const tmp = cells[i]!;
  cells[i] = cells[j]!;
  cells[j] = tmp;
  return cells.join("");
}

/**
 * A pair-swap on a 4×4: two wings exchange one sticker each. Colour counts,
 * corners and wing orientations all still check out, so paint validation
 * accepts it — but the wings can never be paired, so the solver refuses it.
 * The app must not leave the user stuck on the paint screen with a solver
 * error: it sends them back to the Front face with a plain message.
 */
test("a swapped pair on a 4×4 returns to the paint screen with a plain message", async ({ page }, testInfo) => {
  // Tapping 96 stickers one by one is slow on the emulated mobile viewport
  // (about twice the desktop time), so the mobile run gets a longer budget.
  test.setTimeout(testInfo.project.name === "mobile" ? 600_000 : 300_000);
  const scrambled = applyFourString(solvedFourString(), randomFourScramble(mulberry32(42), 40));
  const target = swapped(scrambled, 23, 61);
  expect(target).not.toBe(scrambled);
  expect(validateFour(target)).toEqual({ ok: true });

  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Cube size").selectOption("4");
  await page.reload();
  await page.getByRole("button", { name: "Enter colours" }).click();
  await expect(page.getByTestId("paint-face")).toContainText("Front");
  for (const face of PAINT_FACES) {
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const index = faceletIndex(face, row, col, 4);
        const name = NAMES[target[index] ?? ""] ?? "";
        await page.getByRole("button", { name, exact: true }).click();
        await paintSticker(page, face, row, col, testInfo, 4);
      }
    }
    if (face !== "D") await page.getByRole("button", { name: "Next face" }).click();
  }
  await expect(page.getByTestId("paint-cells")).toHaveText(target);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("alert")).toContainText("can't make a real cube", { timeout: 120_000 });
  await expect(page.getByTestId("paint-face")).toHaveText(/Front · 1 of 6/);
  await expect(page.getByTestId("paint-cells")).toHaveText(target);
  // Back on the first face, so the user goes on with "Next face" and can
  // fix the colours and press Done again on the last face.
  await expect(page.getByRole("button", { name: "Next face" })).toBeVisible();
});
