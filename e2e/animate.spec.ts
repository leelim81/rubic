import { expect, test, type Page } from "@playwright/test";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
import { emptyLesson, withSolution } from "../src/state/lesson";
import { solveBeginner } from "../src/solver/beginner";

const SOLVED = faceletsToString(solvedBytes());

interface Sample {
  animating: boolean;
  angle: number;
  cubies: { hx: number; hy: number; hz: number; x: number; y: number; z: number }[];
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("./");
  await page.getByText("This cube is solved").waitFor();
  (page as unknown as { __errors: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors?: string[] }).__errors ?? []).toEqual([]);
});

test("next rotates one layer through a visible midpoint", async ({ page }) => {
  await install(page, SOLVED, ["R"]);
  const before = await readSample(page);
  await startRecording(page, 1400);
  await page.getByRole("button", { name: /^Next/ }).click();
  const mid = await collectFrames(page);
  await expect(page.getByTestId("lesson-facelets")).toHaveText(faceletsToString(applyMoves(solvedBytes(), ["R"])));
  const moving = mid.filter((sample) => sample.animating && Math.abs(sample.angle) > 0.35 && Math.abs(sample.angle) < 1.35);
  expect(moving.length).toBeGreaterThan(2);
  const frame = moving[Math.floor(moving.length / 2)]!;
  const shifted = frame.cubies.filter((cubie) => cubie.hx === 1 && travel(cubie, before) > 0.18);
  const still = frame.cubies.filter((cubie) => cubie.hx !== 1);
  expect(shifted.length).toBeGreaterThan(4);
  expect(still.every((cubie) => travel(cubie, before) < 0.08)).toBe(true);
});

test("a half turn passes a quarter-turn pose before the final state", async ({ page }) => {
  const start = faceletsToString(applyMoves(solvedBytes(), ["U2"]));
  await install(page, start, ["U2"]);
  const before = await readSample(page);
  await startRecording(page, 1600);
  await page.getByRole("button", { name: /^Next/ }).click();
  const mid = await collectFrames(page);
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED, { timeout: 15_000 });
  expect(mid.some((sample) => sample.animating && Math.abs(sample.angle) > 0.7 && Math.abs(sample.angle) < 2.4)).toBe(true);
  const posed = mid.find((sample) => Math.abs(Math.abs(sample.angle) - Math.PI / 2) < 0.45);
  expect(posed).toBeTruthy();
  const moved = posed!.cubies.some((cubie) => cubie.hy === 1 && travel(cubie, before) > 0.25);
  const held = posed!.cubies.filter((cubie) => cubie.hy !== 1).every((cubie) => travel(cubie, before) < 0.08);
  expect(moved && held).toBe(true);
});

test("rapid next taps advance one move, and replay does not change the lesson", async ({ page }) => {
  await install(page, SOLVED, ["R", "U"]);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.startsWith("Next"));
    button?.click();
    button?.click();
  });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(faceletsToString(applyMoves(solvedBytes(), ["R"])), { timeout: 15_000 });
  const step = await page.getByTestId("lesson-step").textContent();
  await page.getByRole("button", { name: "Replay move" }).click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId("lesson-facelets")).toHaveText(faceletsToString(applyMoves(solvedBytes(), ["R"])));
  await expect(page.getByTestId("lesson-step")).toHaveText(step ?? "");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED, { timeout: 15_000 });
});

async function install(page: Page, start: string, moves: string[]) {
  const solvedLesson = start === SOLVED ? null : solveBeginner(start);
  const first = solvedLesson?.chunks[0];
  const lesson = withSolution(emptyLesson(SOLVED), start, {
    moves,
    chunkOfMove: moves.map(() => 0),
    chunks: [{
      id: first?.id ?? "scripted",
      stageId: first?.stageId ?? "cross",
      stageNumber: first?.stageNumber ?? 1,
      stageName: first?.stageName ?? "White cross",
      title: first?.title ?? "Turn the layer",
      goal: first?.goal ?? "Turn one layer.",
      why: first?.why ?? "The test scripted this move.",
      caseName: first?.caseName ?? "scripted",
      hold: first?.hold ?? "Yellow on top, green in front.",
      moves,
      focus: first?.focus ?? [],
      advice: first?.advice ?? "",
      tip: first?.tip ?? null,
      fingertricks: moves.map(() => "Turn the layer."),
    }],
  });
  await page.evaluate((data) => sessionStorage.setItem("rubic-lesson-v1", JSON.stringify(data)), lesson);
  await page.reload();
  await page.getByTestId("lesson-facelets").waitFor();
}

async function readSample(page: Page): Promise<Sample> {
  const sample = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as (HTMLCanvasElement & { __rubicSample?: () => Sample }) | null;
    return canvas?.__rubicSample?.() ?? null;
  });
  if (!sample) throw new Error("The cube did not expose its cubies.");
  return sample;
}

async function startRecording(page: Page, ms: number) {
  await page.evaluate((duration) => {
    const canvas = document.querySelector("canvas") as (HTMLCanvasElement & { __rubicSample?: () => Sample }) | null;
    const frames: Sample[] = [];
    const start = performance.now();
    (window as unknown as { __rubicFrames: Sample[] | null }).__rubicFrames = null;
    const step = () => {
      const sample = canvas?.__rubicSample?.();
      if (sample) frames.push(sample);
      if (performance.now() - start < duration) requestAnimationFrame(step);
      else (window as unknown as { __rubicFrames: Sample[] | null }).__rubicFrames = frames;
    };
    requestAnimationFrame(step);
  }, ms);
}

async function collectFrames(page: Page): Promise<Sample[]> {
  await page.waitForFunction(() => (window as unknown as { __rubicFrames?: Sample[] | null }).__rubicFrames, undefined, { timeout: 4000 });
  return page.evaluate(() => (window as unknown as { __rubicFrames: Sample[] }).__rubicFrames);
}

function travel(cubie: Sample["cubies"][number], before: Sample) {
  const home = before.cubies.find((item) => item.hx === cubie.hx && item.hy === cubie.hy && item.hz === cubie.hz);
  if (!home) return 99;
  return Math.hypot(cubie.x - home.x, cubie.y - home.y, cubie.z - home.z);
}
