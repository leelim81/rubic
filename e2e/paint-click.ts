import { expect, type Page, type TestInfo } from "@playwright/test";
import type { Face } from "../src/cube/model";
import { projectToScreen } from "../src/view/camera";
import { facePose, stickerPoint, type PaintOrder } from "../src/view/paint";

export async function waitForFace(page: Page, face: Face) {
  const pose = facePose(face);
  await expect(page.getByTestId("paint-face")).toContainText(new RegExp(`${face === "F" ? "Front" : face === "R" ? "Right" : face === "B" ? "Back" : face === "L" ? "Left" : face === "U" ? "Up" : "Down"}`));
  await page.waitForFunction((expected) => {
    const canvas = document.querySelector("canvas") as (HTMLCanvasElement & { __rubicPose?: () => { theta: number; phi: number } }) | null;
    const actual = canvas?.__rubicPose?.();
    if (!actual) return false;
    const delta = Math.atan2(Math.sin(actual.theta - expected.theta), Math.cos(actual.theta - expected.theta));
    return Math.abs(delta) < 0.02 && Math.abs(actual.phi - expected.phi) < 0.02;
  }, pose);
}

export async function paintSticker(page: Page, face: Face, row: number, col: number, testInfo: TestInfo, order: PaintOrder = 3) {
  await waitForFace(page, face);
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The cube is not on screen.");
  const pose = facePose(face);
  const screen = projectToScreen(stickerPoint(face, row, col, order), box.width, box.height, pose.theta, pose.phi);
  const x = box.x + screen.x;
  const y = box.y + screen.y;
  if (testInfo.project.name === "mobile") await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
