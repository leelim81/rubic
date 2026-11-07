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

test("face buttons turn the held cube and the opposite button undoes it", async ({ page }) => {
  await page.getByRole("button", { name: "Right, front edge up" }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(faceletsToString(applyMoves(solvedBytes(), ["R"])), { timeout: 15_000 });
  await page.getByRole("button", { name: "Right, front edge down" }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED, { timeout: 15_000 });
});

function expectedMove(
  theta: number,
  phi: number,
  dx: number,
  dy: number,
  position: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
) {
  return resolveTurn(position, normal, dragInCubeSpace(dx, dy, theta, phi), cameraBasis(theta, phi).up);
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
