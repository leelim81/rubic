import { expect, test, type Locator, type Page } from "@playwright/test";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
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

test("the inverse of a lesson move restores the counter, and a wrong move does not", async ({ page }) => {
  const step = page.getByTestId("lesson-step");
  let move = "";
  let nextLabel = "";
  for (let attempt = 0; attempt < 12 && !FACE_BUTTON[move]; attempt++) {
    if (attempt > 0) await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("button", { name: "Scramble" }).click();
    await expect(step).toHaveText(/Step 1 of/, { timeout: 20_000 });
    nextLabel = (await page.getByRole("button", { name: /^Next/ }).textContent()) ?? "";
    move = nextLabel.split("·")[1]?.trim() ?? "";
  }
  expect(FACE_BUTTON[move], `next move was ${nextLabel}`).toBeTruthy();
  const stepBefore = await step.textContent();
  const faceletsBefore = await page.getByTestId("lesson-facelets").textContent();
  await page.locator("details.face-fallback summary").click();
  await page.getByRole("button", { name: `${FACE_BUTTON[move]} ${move}`, exact: true }).click();
  await expect(step).not.toHaveText(stepBefore ?? "", { timeout: 15_000 });
  await expect(page.getByTestId("lesson-facelets")).not.toHaveText(faceletsBefore ?? "");
  await page.getByRole("button", { name: `${FACE_BUTTON[invert(move)]} ${invert(move)}`, exact: true }).click();
  await expect(step).toHaveText(stepBefore ?? "", { timeout: 15_000 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(faceletsBefore ?? "");
  await expect(page.getByRole("button", { name: /^Next/ })).toHaveText(nextLabel);
  const wrong = Object.keys(FACE_BUTTON).find((item) => item !== move && item !== invert(move)) ?? "F";
  await page.getByRole("button", { name: `${FACE_BUTTON[wrong]} ${wrong}`, exact: true }).click();
  await page.getByRole("button", { name: `${FACE_BUTTON[wrong]} ${wrong}`, exact: true }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(faceletsBefore ?? "");
  await expect(step).toHaveText(stepBefore ?? "");
  await expect(page.getByRole("status").filter({ hasText: "not the next lesson move" })).toBeVisible();
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
