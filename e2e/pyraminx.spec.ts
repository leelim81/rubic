import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { projectToScreen } from "../src/view/camera";
import {
  PYRA_FACES,
  PYRA_GUIDE,
  type PyraFace,
  applyPyraMoves,
  pyraFacePose,
  pyraStickerPoint,
  solvedPyraString,
} from "../src/pyraminx/model";
import { solvePyraminx } from "../src/pyraminx/solve";

const SOLVED = solvedPyraString();
const FACE_COLOUR: Record<PyraFace, string> = { F: "green", R: "red", L: "blue", D: "yellow" };
const LETTER_COLOUR: Record<string, string> = { g: "green", r: "red", b: "blue", y: "yellow" };

test("Pyraminx is a puzzle option, and a painted scramble solves back", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("./");
  const picker = page.getByLabel("Cube size");
  await expect(picker.locator("option")).toHaveText(["3×3", "5×5", "Pyraminx", "Master Pyraminx"]);
  await picker.selectOption("pyraminx");
  await expect(picker).toHaveValue("pyraminx");
  await expect(page.getByTestId("empty-prompt")).toHaveText("Enter your Pyraminx's colours to get step-by-step help.");
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({ path: `/opt/cursor/artifacts/pyraminx-dropdown-${testInfo.project.name}.png` });
  await page.screenshot({ path: `/opt/cursor/artifacts/pyraminx-3d-${testInfo.project.name}.png` });

  const scramble = applyPyraMoves(SOLVED, ["U", "R'", "u"]);
  await page.getByRole("button", { name: "Enter colours" }).click();
  await expect(page.getByTestId("paint-face")).toContainText("Front");
  await expect(page.getByTestId("paint-progress")).toHaveText("0/9 filled");
  await expect(page.getByRole("button", { name: "white", exact: true })).toHaveCount(0);
  for (const face of PYRA_FACES) {
    await expect(page.getByTestId("paint-face")).toContainText(PYRA_GUIDE[face].title);
    for (let local = 0; local < 9; local += 1) {
      const letter = scramble[PYRA_FACES.indexOf(face) * 9 + local]!;
      await page.getByRole("button", { name: LETTER_COLOUR[letter]!, exact: true }).click();
      await paintSticker(page, face, local, testInfo);
    }
    if (face !== "D") await page.getByRole("button", { name: "Next face" }).click();
  }
  await expect(page.getByTestId("paint-cells")).toHaveText(scramble);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 1 of \d+/, { timeout: 20_000 });
  await expect(page.getByTestId("lesson-step")).toHaveText(`Expert · Move 1 of ${solvePyraminx(scramble).moves.length}`);
  await expect(page.getByTestId("lesson-step")).not.toContainText("Beginner");
  await expect(page.getByTestId("lesson-facelets")).toHaveText(scramble);

  await page.locator("details.options-panel summary").click();
  const method = page.getByRole("combobox", { name: "Solution method" });
  await expect(method).toBeDisabled();
  await expect(method).toHaveValue("expert");
  await expect(method.locator("option")).toHaveCount(1);

  await page.getByTestId("solve-fast").click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 30_000 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await page.screenshot({ path: `/opt/cursor/artifacts/pyraminx-solved-${testInfo.project.name}.png` });
});

test("a solved Pyraminx can be entered, and scramble playback returns to solved", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript((solved) => {
    localStorage.setItem("rubic-size-v1", "pyraminx");
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
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await expect(page.getByTestId("lesson-step")).toHaveText("No moves needed");
  await page.locator("details.options-panel summary").click();
  await expect(page.getByRole("combobox", { name: "Solution method" })).toBeDisabled();
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 1 of \d+/, { timeout: 20_000 });
  const scrambled = await page.getByTestId("lesson-facelets").textContent();
  expect(scrambled).not.toBe(SOLVED);
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByTestId("move-line")).toContainText(/tip|vertex/);
  await page.getByTestId("solve-fast").click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 30_000 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
});

async function paintSticker(page: Page, face: PyraFace, local: number, testInfo: TestInfo) {
  const pose = pyraFacePose(face);
  await page.waitForFunction((expected) => {
    const canvas = document.querySelector("canvas") as (HTMLCanvasElement & { __rubicPose?: () => { theta: number; phi: number } }) | null;
    const actual = canvas?.__rubicPose?.();
    if (!actual) return false;
    const delta = Math.atan2(Math.sin(actual.theta - expected.theta), Math.cos(actual.theta - expected.theta));
    return Math.abs(delta) < 0.05 && Math.abs(actual.phi - expected.phi) < 0.05;
  }, pose);
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The Pyraminx is not on screen.");
  const screen = projectToScreen(pyraStickerPoint(face, local), box.width, box.height, pose.theta, pose.phi);
  const x = box.x + screen.x;
  const y = box.y + screen.y;
  if (testInfo.project.name === "mobile") await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
