import { expect, test, type Locator, type Page } from "@playwright/test";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
import { emptyLesson, withSolution } from "../src/state/lesson";
import { solveBeginner } from "../src/solver/beginner";
import { HOME_PHI, HOME_THETA, cameraBasis, dragInCubeSpace, orbitBy, projectToScreen } from "../src/view/camera";
import { resolveTurn } from "../src/view/drag";

const SOLVED = faceletsToString(solvedBytes());

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

test("dragging the cube in rotate-view mode orbits and does not turn a layer", async ({ page }) => {
  const { canvas, box } = await frame(page);
  const before = await canvas.screenshot();
  const from = projectToScreen({ x: 0, y: 1, z: 1 }, box.width, box.height, HOME_THETA, HOME_PHI);
  await mouseDrag(page, box, from, { x: from.x + 80, y: from.y + 24 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await expect(page.getByRole("status").filter({ hasText: "The view has moved" })).toBeVisible();
  expect(Buffer.compare(before, await canvas.screenshot())).not.toBe(0);
});

test("turn mode follows the sticker, a short drag cancels, and buttons invert it", async ({ page }) => {
  await page.getByRole("button", { name: "Turn a face" }).click();
  await expect(page.getByRole("button", { name: "Turn a face" })).toHaveAttribute("aria-pressed", "true");
  const { box } = await frame(page);
  const from = projectToScreen({ x: 0, y: 1, z: 1 }, box.width, box.height, HOME_THETA, HOME_PHI);
  await mouseDrag(page, box, from, { x: from.x + 8, y: from.y });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);

  const move = expectedMove(HOME_THETA, HOME_PHI, -48, 0, { x: 0, y: 1, z: 1 }, { x: 0, y: 0, z: 1 });
  expect(move).toBe("U");
  await mouseDrag(page, box, from, { x: from.x - 48, y: from.y });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(faceletsToString(applyMoves(solvedBytes(), [move!])));
  await page.locator("details.face-fallback summary").click();
  await page.getByRole("button", { name: "Top, front edge right" }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED, { timeout: 15_000 });
});

test("a touch drag and a rotated view still turn the layer the finger follows", async ({ page }) => {
  const { canvas, box } = await frame(page);
  await mouseDrag(page, box, { x: box.width * 0.5, y: box.height * 0.5 }, { x: box.width * 0.5 + 90, y: box.height * 0.5 });
  const view = orbitBy(HOME_THETA, HOME_PHI, 90, 0);
  await page.getByRole("button", { name: "Turn a face" }).click();
  const from = projectToScreen({ x: 0, y: 1, z: 1 }, box.width, box.height, view.theta, view.phi);
  const move = expectedMove(view.theta, view.phi, -40, 6, { x: 0, y: 1, z: 1 }, { x: 0, y: 0, z: 1 });
  expect(move).toBeTruthy();
  await touchDrag(canvas, box, from, { x: from.x - 40, y: from.y + 6 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(faceletsToString(applyMoves(solvedBytes(), [move!])));
});

test("a short drag explains itself and does not change the cube", async ({ page }) => {
  await page.getByRole("button", { name: "Turn a face" }).click();
  const { box } = await frame(page);
  const from = projectToScreen({ x: 0, y: 0, z: 1.4 }, box.width, box.height, HOME_THETA, HOME_PHI);
  const before = await page.getByTestId("lesson-facelets").textContent();
  await mouseDrag(page, box, from, { x: from.x + 8, y: from.y });
  await expect(page.getByRole("status").filter({ hasText: "Too short to turn a face" })).toBeVisible();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(before ?? "");
});

test("a quarter-turn lesson steps forward and back, and a wrong turn stays put", async ({ page }) => {
  const start = faceletsToString(applyMoves(solvedBytes(), ["U"]));
  await installLesson(page, start);
  const step = page.getByTestId("lesson-step");
  await expect(page.getByRole("button", { name: /^Next/ })).toHaveText(/U'/);
  const before = await page.getByTestId("lesson-facelets").textContent();
  await page.locator("details.face-fallback summary").click();
  await page.getByRole("button", { name: "Top, front edge right U'", exact: true }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED, { timeout: 15_000 });
  await page.getByRole("button", { name: "Top, front edge left U", exact: true }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(before ?? "", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Next/ })).toHaveText(/U'/);
  await page.getByRole("button", { name: "Front, clockwise F", exact: true }).click();
  await page.getByRole("button", { name: "Front, clockwise F", exact: true }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(before ?? "");
  await expect(step).toContainText("Step 1 of");
  await expect(page.getByRole("status").filter({ hasText: "not the next lesson move" })).toBeVisible();
});

test("a half turn is two matching quarters, and the other direction works too", async ({ page }) => {
  test.setTimeout(120_000);
  for (const face of ["U", "D", "F", "B", "L", "R"] as const) {
    const start = faceletsToString(applyMoves(solvedBytes(), [`${face}2`]));
    if (face !== "D") expect(solveBeginner(start).moves[0]).toBe(`${face}2`);
    await installLesson(page, start, [`${face}2`]);
    await expect(page.getByRole("button", { name: /^Next/ })).toHaveText(new RegExp(`${face}2`));
    await expect(page.getByTestId("lesson-step")).toContainText("quarter 1 of 2");
    await page.locator("details.face-fallback summary").click();
    const clockwise = FACE_BUTTON[face]!;
    const prime = FACE_BUTTON[`${face}'`]!;
    await page.getByRole("button", { name: `${clockwise} ${face}`, exact: true }).click();
    await expect(page.getByTestId("lesson-step")).toContainText("1 of 2");
    const wrong = face === "U" ? "F" : "U";
    await page.getByRole("button", { name: `${FACE_BUTTON[wrong]} ${wrong}`, exact: true }).click();
    await expect(page.getByTestId("lesson-step")).toContainText("1 of 2");
    await page.getByRole("button", { name: `${prime} ${face}'`, exact: true }).click();
    await expect(page.getByTestId("lesson-step")).toContainText("quarter 1 of 2");
    await page.getByRole("button", { name: `${prime} ${face}'`, exact: true }).click();
    await page.getByRole("button", { name: `${prime} ${face}'`, exact: true }).click();
    await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED, { timeout: 15_000 });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByTestId("lesson-facelets")).toHaveText(start, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Next/ })).toHaveText(new RegExp(`${face}2`));
  }
});

test("two right-face drags finish R2 at home and after the view turns", async ({ page }) => {
  test.setTimeout(90_000);
  const start = faceletsToString(applyMoves(solvedBytes(), ["R2"]));
  await installLesson(page, start);
  await page.getByRole("button", { name: "Turn a face" }).click();
  const { box } = await frame(page);
  const home = projectToScreen({ x: 1.48, y: 0, z: 0 }, box.width, box.height, HOME_THETA, HOME_PHI);
  await mouseDrag(page, box, home, { x: home.x, y: home.y - 50 });
  await expect(page.getByTestId("lesson-step")).toContainText("Do R again");
  await mouseDrag(page, box, home, { x: home.x, y: home.y - 50 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED, { timeout: 15_000 });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(start, { timeout: 15_000 });
  await page.getByRole("button", { name: "Rotate view" }).click();
  const again = await frame(page);
  await mouseDrag(page, again.box, { x: again.box.width * 0.55, y: again.box.height * 0.5 }, { x: again.box.width * 0.55 + 70, y: again.box.height * 0.5 });
  const view = orbitBy(HOME_THETA, HOME_PHI, 70, 0);
  await page.getByRole("button", { name: "Turn a face" }).click();
  const shifted = projectToScreen({ x: 1.48, y: 0, z: 0 }, again.box.width, again.box.height, view.theta, view.phi);
  await mouseDrag(page, again.box, shifted, { x: shifted.x, y: shifted.y - 55 });
  await expect(page.getByTestId("lesson-step")).toContainText("Do R again");
  await mouseDrag(page, again.box, shifted, { x: shifted.x, y: shifted.y - 55 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED, { timeout: 15_000 });
});

test("an upward drag on the right face turns that face, including after the view rotates", async ({ page }) => {
  await page.getByRole("button", { name: "Turn a face" }).click();
  const turned = faceletsToString(applyMoves(solvedBytes(), ["R"]));
  const { box } = await frame(page);
  const home = projectToScreen({ x: 1.48, y: 0, z: 0 }, box.width, box.height, HOME_THETA, HOME_PHI);
  await mouseDrag(page, box, home, { x: home.x, y: home.y - 50 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(turned, { timeout: 15_000 });
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText("This cube is solved")).toBeVisible();
  await page.getByRole("button", { name: "Rotate view" }).click();
  await mouseDrag(page, box, { x: box.width * 0.55, y: box.height * 0.5 }, { x: box.width * 0.55 + 70, y: box.height * 0.5 });
  const view = orbitBy(HOME_THETA, HOME_PHI, 70, 0);
  await page.getByRole("button", { name: "Turn a face" }).click();
  const shifted = projectToScreen({ x: 1.48, y: 0, z: 0 }, box.width, box.height, view.theta, view.phi);
  await mouseDrag(page, box, shifted, { x: shifted.x, y: shifted.y - 55 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(turned, { timeout: 15_000 });
});

test("face buttons turn the held cube and the opposite button undoes it", async ({ page }) => {
  await page.locator("details.face-fallback summary").click();
  await page.getByRole("button", { name: "Right, front edge up" }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(faceletsToString(applyMoves(solvedBytes(), ["R"])), { timeout: 15_000 });
  await page.getByRole("button", { name: "Right, front edge down" }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED, { timeout: 15_000 });
});

const FACE_BUTTON: Record<string, string> = {
  U: "Top, front edge left",
  "U'": "Top, front edge right",
  F: "Front, clockwise",
  "F'": "Front, anticlockwise",
  R: "Right, front edge up",
  "R'": "Right, front edge down",
  L: "Left, front edge down",
  "L'": "Left, front edge up",
  D: "Bottom, front edge right",
  "D'": "Bottom, front edge left",
  B: "Back, top edge left",
  "B'": "Back, top edge right",
};

function invert(move: string): string {
  if (move.endsWith("2")) return move;
  if (move.endsWith("'")) return move[0] ?? move;
  return `${move}'`;
}

async function installLesson(page: Page, start: string, moves?: string[]) {
  const solvedLesson = solveBeginner(start);
  const first = solvedLesson.chunks[0];
  if (!first) throw new Error("The fixture lesson has no step.");
  const solution = moves
    ? { ...solvedLesson, moves, chunkOfMove: moves.map(() => 0), chunks: [{ ...first, moves, fingertricks: moves.map(() => "Half turn.") }] }
    : solvedLesson;
  const lesson = withSolution(emptyLesson(SOLVED), start, solution);
  await page.evaluate((data) => sessionStorage.setItem("rubic-lesson-v1", JSON.stringify(data)), lesson);
  await page.reload();
  await page.getByTestId("lesson-facelets").waitFor();
}

function expectedMove(
  theta: number,
  phi: number,
  dx: number,
  dy: number,
  position: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
) {
  return resolveTurn(position, normal, dragInCubeSpace(dx, dy, theta, phi), cameraBasis(theta, phi).up, cameraBasis(theta, phi).forward).move;
}

async function frame(page: Page) {
  const canvas = page.locator(".cube-frame canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The lesson cube is not on screen.");
  return { canvas, box };
}

async function mouseDrag(page: Page, box: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 12 });
  await page.mouse.up();
}

async function touchDrag(canvas: Locator, box: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }) {
  const down = { clientX: box.x + from.x, clientY: box.y + from.y, pointerId: 3, pointerType: "touch", buttons: 1, isPrimary: true, bubbles: true };
  const up = { clientX: box.x + to.x, clientY: box.y + to.y, pointerId: 3, pointerType: "touch", buttons: 0, isPrimary: true, bubbles: true };
  await canvas.dispatchEvent("pointerdown", down);
  await canvas.dispatchEvent("pointermove", { ...up, buttons: 1 });
  await canvas.dispatchEvent("pointerup", up);
}
