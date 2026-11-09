import { expect, test } from "@playwright/test";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
import { PAINT_FACES, faceletIndex, isCentre } from "../src/view/paint";
import { paintSticker, waitForFace } from "./paint-click";

const SOLVED = faceletsToString(solvedBytes());
const NAMES: Record<string, string> = { w: "white", y: "yellow", r: "red", o: "orange", b: "blue", g: "green" };

test("cancel leaves the cube alone", async ({ page }, testInfo) => {
  await page.goto("./");
  await page.getByText("No moves needed").waitFor();
  await page.getByRole("button", { name: "Enter colours" }).click();
  await page.getByRole("button", { name: "red", exact: true }).click();
  await paintSticker(page, "F", 0, 0, testInfo);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await expect(page.getByTestId("paint-face")).toHaveCount(0);
});

test("paints a known cube on the 3D faces, then solves it", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const target = faceletsToString(applyMoves(solvedBytes(), ["R", "U"]));
  await page.goto("./");
  await page.getByText("No moves needed").waitFor();
  await page.getByRole("button", { name: "Enter colours" }).click();
  for (const face of PAINT_FACES) {
    await waitForFace(page, face);
    const shot = testInfo.project.name === "mobile" ? (face === "F" ? "/opt/cursor/artifacts/paint-face-F-mobile.png" : "") : `/opt/cursor/artifacts/paint-face-${face}.png`;
    if (shot) await page.screenshot({ path: shot });
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const index = faceletIndex(face, row, col);
        if (isCentre(index)) continue;
        const name = NAMES[target[index] ?? ""] ?? "";
        await page.getByRole("button", { name, exact: true }).click();
        await paintSticker(page, face, row, col, testInfo);
      }
    }
    if (face !== "D") await page.getByRole("button", { name: "Next face" }).click();
  }
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(target, { timeout: 20_000 });
  await expect(page.getByTestId("lesson-step")).toHaveText(/· \d+\/\d+/);
  await page.getByTestId("solve-fast").click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 30_000 });
});
