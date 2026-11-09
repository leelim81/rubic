import { expect, test, type Locator, type Page } from "@playwright/test";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
import { emptyLesson, withSolution } from "../src/state/lesson";
import { HOME_PHI, HOME_THETA, orbitBy, projectToScreen } from "../src/view/camera";

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

const FRONT_LETTER = { x: 0, y: 0, z: 1.47 };

test("rotate view follows the finger on screen and does not turn a face", async ({ page }) => {
  test.setTimeout(60_000);
  const { canvas, box } = await frame(page);
  const directions: [number, number, "x" | "y", number][] = [
    [48, 0, "x", 1],
    [-48, 0, "x", -1],
    [0, 42, "y", 1],
    [0, -42, "y", -1],
  ];
  for (const [dx, dy, axis, sign] of directions) {
    const reset = page.getByRole("status").getByRole("button", { name: "Reset view" });
    if (await reset.count()) await reset.click();
    const spot = projectToScreen(FRONT_LETTER, box.width, box.height, HOME_THETA, HOME_PHI);
    const before = await letterNear(canvas, spot, 42);
    expect(before?.n ?? 0).toBeGreaterThan(8);
    await dragCanvas(page, canvas, dx, dy);
    const moved = orbitBy(HOME_THETA, HOME_PHI, dx, dy, box.width, box.height);
    const next = projectToScreen(FRONT_LETTER, box.width, box.height, moved.theta, moved.phi);
    const after = await letterNear(canvas, next, 56);
    expect(after?.n ?? 0).toBeGreaterThan(8);
    const delta = axis === "x" ? after!.x - before!.x : after!.y - before!.y;
    expect(delta * sign).toBeGreaterThan(12);
  }
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await expect(page.getByTestId("lesson-step")).toHaveText(/No moves needed/);
});

test("a simulated touch drag follows the finger and does not scroll the page", async ({ page }) => {
  test.info().annotations.push({ type: "input", description: "Simulated touch through pointer events, not a physical phone." });
  await page.evaluate(() => {
    document.body.style.minHeight = "4000px";
    window.scrollTo(0, 240);
  });
  const { canvas, box } = await frame(page);
  const spot = projectToScreen(FRONT_LETTER, box.width, box.height, HOME_THETA, HOME_PHI);
  const before = await letterNear(canvas, spot, 42);
  expect(before?.n ?? 0).toBeGreaterThan(8);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await touchDrag(canvas, box, { x: spot.x, y: spot.y }, { x: spot.x + 46, y: spot.y - 34 });
  const moved = orbitBy(HOME_THETA, HOME_PHI, 46, -34, box.width, box.height);
  const next = projectToScreen(FRONT_LETTER, box.width, box.height, moved.theta, moved.phi);
  const after = await letterNear(canvas, next, 56);
  expect(after!.x).toBeGreaterThan(before!.x + 10);
  expect(after!.y).toBeLessThan(before!.y - 8);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
});

test("dragging the cube in rotate-view mode orbits and does not turn a layer", async ({ page }) => {
  const { canvas, box } = await frame(page);
  const before = await canvas.screenshot();
  const from = projectToScreen({ x: 0, y: 1, z: 1 }, box.width, box.height, HOME_THETA, HOME_PHI);
  await mouseDrag(page, box, from, { x: from.x + 80, y: from.y + 24 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await expect(page.getByRole("status").filter({ hasText: "The view has moved" })).toBeVisible();
  expect(Buffer.compare(before, await canvas.screenshot())).not.toBe(0);
});

test("a drag never turns a face or changes the step, and there is no mode switch", async ({ page }) => {
  await expect(page.getByRole("radio", { name: /Rotate view|Turn a face/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Rotate view|Turn a face/ })).toHaveCount(0);
  const start = faceletsToString(applyMoves(solvedBytes(), ["R", "U"]));
  await installLesson(page, start, ["U'", "R'"]);
  const before = await page.getByTestId("lesson-facelets").textContent();
  const step = await page.getByTestId("lesson-step").textContent();
  const { canvas, box } = await frame(page);
  await mouseDrag(page, box, { x: box.width * 0.62, y: box.height * 0.5 }, { x: box.width * 0.62, y: box.height * 0.5 - 70 });
  await mouseDrag(page, box, { x: box.width * 0.35, y: box.height * 0.28 }, { x: box.width * 0.7, y: box.height * 0.28 });
  await touchDrag(canvas, box, { x: box.width * 0.4, y: box.height * 0.55 }, { x: box.width * 0.4 + 50, y: box.height * 0.55 - 20 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(before ?? "");
  await expect(page.getByTestId("lesson-step")).toHaveText(step ?? "");
});

async function installLesson(page: Page, start: string, moves: string[]) {
  const lesson = withSolution(emptyLesson(SOLVED), start, {
    moves,
    chunkOfMove: moves.map(() => 0),
    chunks: [{
      id: "script",
      stageId: "cross",
      stageNumber: 1,
      stageName: "White cross",
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

async function frame(page: Page) {
  const canvas = page.locator(".cube-frame canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The lesson cube is not on screen.");
  return { canvas, box };
}

async function letterNear(canvas: Locator, point: { x: number; y: number }, radius: number) {
  return canvas.evaluate((el, query) => {
    const gl = el.getContext("webgl2") ?? el.getContext("webgl");
    if (!gl) return null;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const scaleX = width / el.clientWidth;
    const scaleY = height / el.clientHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const cx = query.x * scaleX;
    const cy = height - query.y * scaleY;
    const limit = query.radius * Math.max(scaleX, scaleY);
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let py = 0; py < height; py += 2) {
      for (let px = 0; px < width; px += 2) {
        if ((px - cx) ** 2 + (py - cy) ** 2 > limit * limit) continue;
        const index = (py * width + px) * 4;
        const red = pixels[index] ?? 0;
        const green = pixels[index + 1] ?? 0;
        const blue = pixels[index + 2] ?? 0;
        if (green > 110 && red < 80 && green > red + 40 && blue < 140) {
          sx += px / scaleX;
          sy += (height - py) / scaleY;
          count += 1;
        }
      }
    }
    if (!count) return null;
    return { x: sx / count, y: sy / count, n: count };
  }, { x: point.x, y: point.y, radius });
}

async function dragCanvas(page: Page, canvas: Locator, dx: number, dy: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The lesson cube is not on screen.");
  const from = { x: box.width * 0.5, y: box.height * 0.48 };
  await mouseDrag(page, box, from, { x: from.x + dx, y: from.y + dy });
}

async function mouseDrag(page: Page, box: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 12 });
  await page.mouse.up();
}

async function touchDrag(canvas: Locator, box: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }) {
  const down = { clientX: box.x + from.x, clientY: box.y + from.y, pointerId: 3, pointerType: "touch", buttons: 1, isPrimary: true, bubbles: true, cancelable: true };
  const up = { clientX: box.x + to.x, clientY: box.y + to.y, pointerId: 3, pointerType: "touch", buttons: 0, isPrimary: true, bubbles: true, cancelable: true };
  await canvas.dispatchEvent("pointerdown", down);
  await canvas.dispatchEvent("pointermove", { ...up, buttons: 1, cancelable: true });
  await canvas.dispatchEvent("pointerup", up);
}
