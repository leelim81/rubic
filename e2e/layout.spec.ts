import { expect, test, type Page } from "@playwright/test";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
import { emptyLesson, withSolution } from "../src/state/lesson";

const SOLVED = faceletsToString(solvedBytes());

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("./");
  await page.getByText("No moves needed").waitFor();
  (page as unknown as { __errors: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors?: string[] }).__errors ?? []).toEqual([]);
});

test("the solved page has one status, no stale move, and the cube clears the controls", async ({ page }, testInfo) => {
  await expect(page.getByTestId("lesson-step")).toHaveText("No moves needed");
  await expect(page.getByTestId("move-line")).toHaveCount(0);
  await expect(page.getByText("U'. the front edge")).toHaveCount(0);
  await expect(page.getByTestId("stop-solve")).toBeHidden();
  await expect(page.getByTestId("restore-solve")).toBeHidden();
  const view = page.viewportSize()!;
  const cube = await page.locator(".cube-frame").boundingBox();
  const next = await page.getByRole("button", { name: /^Next/ }).boundingBox();
  const solve = await page.getByTestId("solve-fast").boundingBox();
  expect(cube && next && solve).toBeTruthy();
  expect(overlaps(cube, next)).toBe(false);
  expect(overlaps(cube, solve)).toBe(false);
  expect(inView(cube, view)).toBe(true);
  expect(inView(next, view)).toBe(true);
  expect(inView(solve, view)).toBe(true);
  expect(next!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.screenshot({ path: `/opt/cursor/artifacts/quiet-solved-${testInfo.project.name}.png` });
});

test("a finished move leaves no stale hint", async ({ page }) => {
  const start = faceletsToString(applyMoves(solvedBytes(), ["U"]));
  await install(page, start, ["U'"]);
  await expect(page.getByTestId("move-line")).toContainText("U'");
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 10_000 });
  await expect(page.getByTestId("move-line")).toHaveCount(0);
  await expect(page.getByText("the front edge of the top moves right")).toHaveCount(0);
});

function overlaps(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
) {
  if (!a || !b) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function inView(box: { x: number; y: number; width: number; height: number } | null, view: { width: number; height: number }) {
  if (!box) return false;
  return box.x >= -1 && box.y >= -1 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1;
}

async function install(page: Page, start: string, moves: string[]) {
  const lesson = withSolution(emptyLesson(SOLVED), start, {
    moves,
    chunkOfMove: moves.map(() => 0),
    chunks: [{
      id: "script",
      stageId: "cross",
      stageNumber: 0,
      stageName: "Solve",
      title: "Solve",
      goal: "",
      why: "",
      caseName: "script",
      hold: "",
      moves,
      focus: [],
      advice: "",
      tip: null,
      fingertricks: moves.map(() => ""),
    }],
  });
  await page.evaluate((data) => sessionStorage.setItem("rubic-lesson-v1", JSON.stringify(data)), lesson);
  await page.reload();
  await page.getByTestId("lesson-facelets").waitFor();
}
