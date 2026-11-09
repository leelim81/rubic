import { expect, test } from "@playwright/test";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
import { PAINT_FACES, blankPaint, facePose, faceletIndex, isCentre } from "../src/view/paint";
import { paintSticker, waitForFace } from "./paint-click";

const SOLVED = faceletsToString(solvedBytes());
const NAMES: Record<string, string> = { w: "white", y: "yellow", r: "red", o: "orange", b: "blue", g: "green" };

test("yellow and white centre letters are dark on the sticker", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("./");
  await page.getByRole("button", { name: "Enter colours" }).click();
  for (let step = 0; step < 4; step += 1) await page.getByRole("button", { name: "Next face" }).click();
  await waitForFace(page, "U");
  await page.screenshot({ path: `/opt/cursor/artifacts/letter-yellow-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "Next face" }).click();
  await waitForFace(page, "D");
  await page.screenshot({ path: `/opt/cursor/artifacts/letter-white-${testInfo.project.name}.png` });
});

test("cancel leaves the cube alone", async ({ page }, testInfo) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Enter colours" }).click();
  await page.getByRole("button", { name: "red", exact: true }).click();
  await paintSticker(page, "F", 0, 0, testInfo);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await expect(page.getByTestId("paint-face")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Enter colours" })).toBeVisible();
});

test("a fresh entry is blank except the centres, and Done opens the first unfinished face", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("./");
  await page.getByRole("button", { name: "Enter colours" }).click();
  await expect(page.getByTestId("paint-cells")).toHaveText(blankPaint());
  await expect(page.getByTestId("paint-progress")).toHaveText("0/8 filled");
  if (testInfo.project.name === "desktop") await page.screenshot({ path: "/opt/cursor/artifacts/paint-blank-front.png" });
  else await page.screenshot({ path: "/opt/cursor/artifacts/paint-blank-front-mobile.png" });
  await page.getByRole("button", { name: "green", exact: true }).click();
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (row === 1 && col === 1) continue;
      await paintSticker(page, "F", row, col, testInfo);
    }
  }
  await expect(page.getByTestId("paint-progress")).toHaveText("8/8 filled");
  for (let step = 0; step < 5; step += 1) await page.getByRole("button", { name: "Next face" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("alert")).toHaveText("40 stickers still blank");
  await expect(page.getByTestId("paint-face")).toHaveText(/Right · 2 of 6/);
});

test("a mistake on a later face returns to the front and keeps the paint", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("./");
  await page.getByRole("button", { name: "Enter colours" }).click();
  await page.getByRole("button", { name: "Next face" }).click();
  await waitForFace(page, "R");
  await page.getByRole("button", { name: "white", exact: true }).click();
  await paintSticker(page, "R", 0, 0, testInfo);
  for (let step = 0; step < 4; step += 1) await page.getByRole("button", { name: "Next face" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("alert")).toContainText("stickers still blank");
  await expect(page.getByTestId("paint-face")).toHaveText(/Front · 1 of 6/);
  await page.getByRole("button", { name: "Next face" }).click();
  await waitForFace(page, "R");
  await expect(page.getByRole("button", { name: "Right row 1 column 1, white" })).toHaveCount(1);
});

test("paints a known cube on the 3D faces, then solves it", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const target = faceletsToString(applyMoves(solvedBytes(), ["R", "U"]));
  await page.goto("./");
  await page.getByRole("button", { name: "Enter colours" }).click();
  for (const face of PAINT_FACES) {
    await waitForFace(page, face);
    const shot = testInfo.project.name === "mobile" ? (face === "F" ? "/opt/cursor/artifacts/paint-face-F-mobile.png" : "") : `/opt/cursor/artifacts/paint-face-${face}.png`;
    if (shot) await page.screenshot({ path: shot });
    if (face === "F") {
      const canvasBox = await page.locator("canvas").boundingBox();
      const nextBox = await page.getByRole("button", { name: "Next face" }).boundingBox();
      const view = page.viewportSize();
      expect(canvasBox && nextBox && view).toBeTruthy();
      expect(nextBox!.y).toBeGreaterThanOrEqual((canvasBox!.y + canvasBox!.height) - 1);
      expect(nextBox!.y + nextBox!.height).toBeLessThanOrEqual(view!.height + 1);
      expect(nextBox!.height).toBeGreaterThanOrEqual(44);
    }
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const index = faceletIndex(face, row, col);
        if (isCentre(index)) continue;
        const name = NAMES[target[index] ?? ""] ?? "";
        await page.getByRole("button", { name, exact: true }).click();
        await paintSticker(page, face, row, col, testInfo);
      }
    }
    if (face !== "D") await page.getByRole("button", { name: "Next face" }).click();
  }
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(target, { timeout: 20_000 });
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move \d+ of \d+/);
  await page.getByTestId("solve-fast").click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 30_000 });
});

test("keyboard paints a sticker, and a drag does not", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const mark = () => { (window as unknown as { __errorTones: number }).__errorTones = ((window as unknown as { __errorTones?: number }).__errorTones ?? 0) + 1; };
    class Fake {
      currentTime = 0;
      destination = {};
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createOscillator() {
        return { frequency: { value: 0 }, type: "sine", connect() {}, start: mark, stop() {} };
      }
      createGain() {
        return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = Fake;
    (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = Fake;
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Enter colours" }).click();
  await waitForFace(page, "F");
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The cube is not on screen.");
  if (testInfo.project.name === "mobile") {
    test.info().annotations.push({ type: "input", description: "Simulated touch drag, not a physical phone." });
    const down = { clientX: box.x + box.width * 0.5, clientY: box.y + box.height * 0.45, pointerId: 7, pointerType: "touch", buttons: 1, isPrimary: true, bubbles: true, cancelable: true };
    const up = { clientX: box.x + box.width * 0.5 + 96, clientY: box.y + box.height * 0.45 + 18, pointerId: 7, pointerType: "touch", buttons: 0, isPrimary: true, bubbles: true, cancelable: true };
    await canvas.dispatchEvent("pointerdown", down);
    await canvas.dispatchEvent("pointermove", { ...up, buttons: 1 });
    await canvas.dispatchEvent("pointerup", up);
  } else {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 + 96, box.y + box.height * 0.45 + 18, { steps: 10 });
    await page.mouse.up();
  }
  const shifted = await canvas.evaluate((el) => (el as HTMLCanvasElement & { __rubicPose?: () => { theta: number; phi: number } }).__rubicPose?.() ?? { theta: 0, phi: 0 });
  const home = facePose("F");
  const yaw = Math.atan2(Math.sin(shifted.theta - home.theta), Math.cos(shifted.theta - home.theta));
  expect(Math.hypot(yaw, shifted.phi - home.phi)).toBeGreaterThan(0.12);
  await page.getByRole("button", { name: "Next face" }).click();
  await waitForFace(page, "R");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await waitForFace(page, "F");
  await page.getByRole("button", { name: "red", exact: true }).click();
  const sticker = page.getByRole("button", { name: "Front row 1 column 1, blank" });
  await sticker.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Front row 1 column 1, red" })).toHaveCount(1);
  for (let step = 0; step < 5; step += 1) await page.getByRole("button", { name: "Next face" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("alert")).toContainText("47 stickers still blank");
  await expect(page.getByTestId("paint-face")).toHaveText(/Front · 1 of 6/);
  await expect(page.getByRole("button", { name: "Front row 1 column 1, red" })).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __errorTones?: number }).__errorTones ?? 0)).toBeGreaterThan(0);
  const shot = testInfo.project.name === "desktop" ? "/opt/cursor/artifacts/paint-error-desktop.png" : "/opt/cursor/artifacts/paint-error-mobile.png";
  await page.screenshot({ path: shot });
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByRole("button", { name: "Front row 1 column 1, blank" })).toHaveCount(1);
  await expect(page.getByTestId("paint-progress")).toHaveText("0/8 filled");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
