import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { projectToScreen } from "../src/view/camera";
import {
  MASTER_GUIDE,
  MASTER_PER_FACE,
  applyMasterMoves,
  masterFacePose,
  masterStickerPoint,
  solvedMasterString,
} from "../src/pyraminx/master";
import { PYRA_FACES, type PyraFace } from "../src/pyraminx/model";

const SOLVED = solvedMasterString();
const LETTER_COLOUR: Record<string, string> = { g: "green", r: "red", b: "blue", y: "yellow" };

test("Master Pyraminx is a puzzle option, and a painted scramble solves back", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.goto("./");
  const picker = page.getByLabel("Cube size");
  await expect(picker.locator("option")).toHaveText(["3×3", "5×5", "Pyraminx", "Master Pyraminx"]);
  await picker.selectOption("master");
  await expect(picker).toHaveValue("master");
  await expect(page.getByTestId("empty-prompt")).toHaveText("Enter your Master Pyraminx's colours to get step-by-step help.");
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({ path: `/opt/cursor/artifacts/master-dropdown-${testInfo.project.name}.png` });
  await page.screenshot({ path: `/opt/cursor/artifacts/master-3d-${testInfo.project.name}.png` });

  const scramble = applyMasterMoves(SOLVED, ["Uw", "R'", "u"]);
  await page.getByRole("button", { name: "Enter colours" }).click();
  await expect(page.getByTestId("paint-face")).toContainText("Front");
  await expect(page.getByTestId("paint-progress")).toHaveText("0/16 filled");
  await expect(page.getByRole("button", { name: "white", exact: true })).toHaveCount(0);
  for (const face of PYRA_FACES) {
    await expect(page.getByTestId("paint-face")).toContainText(MASTER_GUIDE[face].title);
    for (let local = 0; local < MASTER_PER_FACE; local += 1) {
      const letter = scramble[PYRA_FACES.indexOf(face) * MASTER_PER_FACE + local]!;
      await page.getByRole("button", { name: LETTER_COLOUR[letter]!, exact: true }).click();
      await paintSticker(page, face, local, testInfo);
    }
    if (face !== "D") await page.getByRole("button", { name: "Next face" }).click();
  }
  await expect(page.getByTestId("paint-cells")).toHaveText(scramble);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 1 of \d+/, { timeout: 30_000 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(scramble);
  await page.locator("details.options-panel summary").click();
  const method = page.getByRole("combobox", { name: "Solution method" });
  await expect(method).toBeDisabled();
  await expect(method).toHaveValue("expert");
  await expect(method.locator("option")).toHaveCount(1);
  await page.getByTestId("solve-fast").click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 60_000 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await page.screenshot({ path: `/opt/cursor/artifacts/master-solved-${testInfo.project.name}.png` });
});

test("a solved Master Pyraminx can be scrambled and played back to solved", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript((solved) => {
    localStorage.setItem("rubic-size-v1", "master");
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
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 1 of \d+/, { timeout: 30_000 });
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByTestId("move-line")).toContainText(/tip|layer|layers/);
  await page.getByTestId("solve-fast").click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 60_000 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
});

async function paintSticker(page: Page, face: PyraFace, local: number, testInfo: TestInfo) {
  const pose = masterFacePose(face);
  await page.waitForFunction((expected) => {
    const canvas = document.querySelector("canvas") as (HTMLCanvasElement & { __rubicPose?: () => { theta: number; phi: number } }) | null;
    const actual = canvas?.__rubicPose?.();
    if (!actual) return false;
    const delta = Math.atan2(Math.sin(actual.theta - expected.theta), Math.cos(actual.theta - expected.theta));
    return Math.abs(delta) < 0.05 && Math.abs(actual.phi - expected.phi) < 0.05;
  }, pose);
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The Master Pyraminx is not on screen.");
  const screen = projectToScreen(masterStickerPoint(face, local), box.width, box.height, pose.theta, pose.phi);
  const x = box.x + screen.x;
  const y = box.y + screen.y;
  if (testInfo.project.name === "mobile") await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
