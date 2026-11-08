import { expect, test } from "@playwright/test";
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

test("solve 3× animates from the current step and restore returns there", async ({ page }) => {
  const start = faceletsToString(applyMoves(solvedBytes(), ["R", "U"]));
  await install(page, start, ["U'", "R'"]);
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(faceletsToString(applyMoves(solvedBytes(), ["R"])));
  const mid = await page.getByTestId("lesson-facelets").textContent();
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as (HTMLCanvasElement & { __rubicSample?: () => { animating: boolean; angle: number } }) | null;
    const frames: { animating: boolean; angle: number }[] = [];
    const started = performance.now();
    (window as unknown as { __frames: typeof frames | null }).__frames = null;
    const step = () => {
      const sample = canvas?.__rubicSample?.();
      if (sample) frames.push(sample);
      if (performance.now() - started < 1200) requestAnimationFrame(step);
      else (window as unknown as { __frames: typeof frames }).__frames = frames;
    };
    requestAnimationFrame(step);
  });
  await page.evaluate(() => {
    const button = document.querySelector("[data-testid='solve-fast']") as HTMLButtonElement | null;
    button?.click();
    button?.click();
  });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED, { timeout: 15_000 });
  await page.waitForFunction(() => (window as unknown as { __frames?: unknown }).__frames);
  const frames = await page.evaluate(() => (window as unknown as { __frames: { animating: boolean; angle: number }[] }).__frames);
  expect(frames?.some((frame) => frame.animating && Math.abs(frame.angle) > 0.2)).toBe(true);
  await page.getByTestId("restore-solve").click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(mid ?? "");
  await page.getByTestId("restore-solve").click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(mid ?? "");
});

test("stop and a later solve keep the pre-run cube", async ({ page }) => {
  const start = faceletsToString(applyMoves(solvedBytes(), ["F"]));
  await install(page, start, ["R", "U", "R'", "U'", "F", "U", "F'", "U'", "L", "U", "L'", "U'", "B", "U", "B'", "U'"]);
  await page.getByTestId("solve-fast").click();
  await page.waitForFunction(() => document.querySelector("[data-testid='stop-solve']"));
  await page.evaluate(() => (document.querySelector("[data-testid='stop-solve']") as HTMLButtonElement).click());
  await page.getByTestId("restore-solve").click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(start);
});

async function install(page: import("@playwright/test").Page, start: string, moves: string[]) {
  const lesson = withSolution(emptyLesson(SOLVED), start, {
    moves,
    chunkOfMove: moves.map(() => 0),
    chunks: [{
      id: "script",
      stageId: "solve",
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
