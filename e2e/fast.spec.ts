import { expect, test, type Page } from "@playwright/test";
import { applyMoves, faceletsToString, invertAlg, solvedBytes } from "../src/cube/model";
import { emptyLesson, withSolution } from "../src/state/lesson";

const SOLVED = faceletsToString(solvedBytes());
/** Thirty real moves. The inverse is a legal cube, and playing the sequence solves it. At 3× that is about 7.5s. */
const SEXY = ["R", "U", "R'", "U'"];
const SOLVE = [...SEXY, ...SEXY, ...SEXY, ...SEXY, ...SEXY, ...SEXY, "F", "R", "U", "R'", "U'", "F'"];

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

test("component race: a second Solve 3× click does not replace the checkpoint", async ({ page }) => {
  test.info().annotations.push({ type: "kind", description: "Dispatched click, not a pointer. Checks the in-flight lock only." });
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
  expect(frames.some((frame) => frame.animating && Math.abs(frame.angle) > 0.2)).toBe(true);
  await page.getByTestId("restore-solve").click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(mid ?? "");
  await page.getByTestId("restore-solve").click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(mid ?? "");
});

test("a pointer click stops a long valid solve and restore returns that start", async ({ page }, testInfo) => {
  const start = faceletsToString(applyMoves(solvedBytes(), invertAlg(SOLVE)));
  expect(faceletsToString(applyMoves(applyMoves(solvedBytes(), invertAlg(SOLVE)), SOLVE))).toBe(SOLVED);
  await install(page, start, SOLVE);
  const stop = page.getByTestId("stop-solve");
  const restore = page.getByTestId("restore-solve");
  const before = await stop.boundingBox();
  expect(before).toBeTruthy();
  await page.getByTestId("solve-fast").click();
  await expect(page.getByTestId("lesson-facelets")).not.toHaveText(start, { timeout: 8_000 });
  await expect(stop).toBeEnabled();
  await expect(restore).toBeEnabled();
  const running = await stop.boundingBox();
  const restoreBox = await restore.boundingBox();
  const view = page.viewportSize();
  expect(view).toBeTruthy();
  expect(inView(running, view!)).toBe(true);
  expect(inView(restoreBox, view!)).toBe(true);
  const controls = await page.locator(".controls").boundingBox();
  const cube = await page.locator(".cube-frame").boundingBox();
  const gap = (controls?.y ?? 0) - ((cube?.y ?? 0) + (cube?.height ?? 0));
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(gap, `gap ${gap} scrollY ${scrollY} cube ${JSON.stringify(cube)} controls ${JSON.stringify(controls)}`).toBeGreaterThan(4);
  expect(scrollY).toBeLessThan(3);
  expect(Math.abs((running?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(3);
  await page.waitForTimeout(250);
  const still = await stop.boundingBox();
  expect(Math.abs((still?.y ?? 0) - (running?.y ?? 0))).toBeLessThan(3);
  if (testInfo.project.name === "mobile") await stop.tap();
  else await stop.click();
  const interrupted = await page.getByTestId("lesson-facelets").textContent();
  expect(interrupted).not.toBe(SOLVED);
  expect(interrupted).not.toBe(start);
  if (testInfo.project.name === "mobile") await restore.tap();
  else await restore.click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(start);
  const turn = page.getByRole("button", { name: "Turn a face" });
  await placeAbove(page, turn, ".controls");
  const turnBox = await turn.boundingBox();
  const bar = await page.locator(".controls").boundingBox();
  expect(overlaps(turnBox, bar)).toBe(false);
  expect(inView(turnBox, view!)).toBe(true);
  if (testInfo.project.name === "mobile") await turn.tap();
  else await turn.click();
  await expect(turn).toHaveAttribute("aria-pressed", "true");
});

async function placeAbove(page: Page, target: ReturnType<Page["getByRole"]>, barSelector: string) {
  await target.scrollIntoViewIfNeeded();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const box = await target.boundingBox();
    const bar = await page.locator(barSelector).boundingBox();
    if (!overlaps(box, bar)) return;
    await page.evaluate((delta) => window.scrollBy(0, delta), (box!.y + box!.height) - bar!.y + 16);
  }
}

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
