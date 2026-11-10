import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { Face } from "../src/cube/model";
import { applyFiveString, solvedFiveString } from "../src/cube/five";
import { projectToScreen } from "../src/view/camera";
import { PAINT_FACES, facePose, faceletIndex, stickerPoint } from "../src/view/paint";
import { paintSticker } from "./paint-click";

const SOLVED = solvedFiveString();
const FACE_COLOUR: Record<Face, string> = {
  F: "green",
  R: "orange",
  B: "blue",
  L: "red",
  U: "yellow",
  D: "white",
};
const COLOUR_LETTER: Record<string, string> = { white: "w", yellow: "y", red: "r", orange: "o", blue: "b", green: "g" };

test("a 5×5 can be scrambled, stepped, solved quickly, and restored", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await page.addInitScript((solved) => {
    localStorage.setItem("rubic-size-v1", "5");
    localStorage.setItem("rubic-entered-v1", "1");
    localStorage.setItem("rubic-lesson-v1", JSON.stringify({
      start: solved,
      moves: [],
      chunkOfMove: [],
      chunks: [],
      cursor: 0,
      history: [],
    }));
    class FakeAudio {
      currentTime = 0;
      destination = {};
      state = "running";
      createOscillator() {
        const osc = {
          type: "sine",
          frequency: { value: 0 },
          connect() {},
          start() {
            const tones = ((window as unknown as { __beeps?: number[] }).__beeps ??= []);
            tones.push(this.frequency.value);
          },
          stop() {},
        };
        return osc;
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
          connect() {},
        };
      }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    }
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = FakeAudio as unknown as typeof AudioContext;
  }, SOLVED);
  await page.goto("./");
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await expect(page.locator("canvas")).toBeVisible();
  await page.locator("details.options-panel summary").click();
  const method = page.getByRole("combobox", { name: "Solution method" });
  await expect(method).toBeDisabled();
  await expect(method).toHaveValue("expert");
  await expect(method.locator("option")).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Cube size" })).toHaveValue("5");

  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.locator("p.quiet[role=status]")).toContainText(/Solving centres|Pairing edges|Fixing parity|reduced cube/);
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 1 of \d+/, { timeout: 60_000 });
  await expect(page.getByTestId("lesson-step")).not.toContainText("Beginner");
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByTestId("move-line")).toContainText(/outer face|two layers|inner slice/);
  if (testInfo.project.name === "desktop") await page.screenshot({ path: "/opt/cursor/artifacts/five-solving-desktop.png" });
  await page.getByTestId("solve-fast").click();
  await page.waitForTimeout(400);
  await page.getByTestId("stop-solve").click();
  await page.getByTestId("restore-solve").click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 2 of \d+/);

  await page.getByRole("button", { name: "Edit colours" }).click();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByTestId("paint-progress")).toHaveText("0/24 filled");
  await paintOne(page, "F", 1, 1, "w", testInfo);
  await expect(page.getByTestId("paint-progress")).toHaveText("1/24 filled");
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 568 });
    await expect.poll(() => stickerGap(page)).toBeGreaterThanOrEqual(24);
    await paintOne(page, "F", 1, 2, "w", testInfo);
    await expect(page.getByTestId("paint-progress")).toHaveText("2/24 filled");
    await page.screenshot({ path: "/opt/cursor/artifacts/five-paint-phone.png" });
  }
  for (let step = 0; step < 5; step += 1) await page.getByRole("button", { name: "Next face" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("alert")).toContainText(/stickers still blank/);
  await expect(page.getByTestId("paint-face")).toContainText("Front");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __beeps?: number[] }).__beeps ?? [])).toEqual([196, 146]);
});

test("a solved 5×5 can be entered by tapping the 3D stickers", async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Cube size").selectOption("5");
  await page.reload();
  await expect(page.getByLabel("Cube size")).toHaveValue("5");
  await page.getByRole("button", { name: "Enter colours" }).click();
  await expect(page.getByTestId("paint-face")).toContainText("Front");
  if (testInfo.project.name === "mobile") {
    await expect.poll(() => stickerGap(page)).toBeGreaterThanOrEqual(24);
    await page.screenshot({ path: "/opt/cursor/artifacts/five-paint-320.png" });
  }
  for (const face of PAINT_FACES) {
    const colour = FACE_COLOUR[face];
    await page.getByRole("button", { name: colour, exact: true }).click();
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (row === 2 && col === 2) continue;
        await paintOne(page, face, row, col, COLOUR_LETTER[colour]!, testInfo);
      }
    }
    if (face !== "D") await page.getByRole("button", { name: "Next face" }).click();
  }
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText("No moves needed", { timeout: 20_000 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await expect(page.getByTestId("lesson-step")).toContainText(/Expert|No moves needed/);
});

test("5×5 stays drawn from a narrow phone through a desktop, including landscape", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "This test sets its own viewport sizes.");
  test.setTimeout(180_000);
  const start = applyFiveString(SOLVED, ["U"]);
  const sizes = [
    { name: "320", width: 320, height: 640 },
    { name: "320x568", width: 320, height: 568 },
    { name: "360", width: 360, height: 740 },
    { name: "390", width: 390, height: 844 },
    { name: "414", width: 414, height: 896 },
    { name: "768", width: 768, height: 1024 },
    { name: "1024", width: 1024, height: 768 },
    { name: "1280", width: 1280, height: 800 },
    { name: "1440", width: 1440, height: 900 },
    { name: "1920", width: 1920, height: 1080 },
    { name: "landscape", width: 740, height: 360 },
  ];
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("./");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByLabel("Cube size").selectOption("5");
    await expect(page.getByRole("button", { name: "Enter colours" })).toBeVisible();
    await drawn(page, `${size.name} empty`);
    await page.getByRole("button", { name: "Enter colours" }).click();
    await expect(page.getByTestId("paint-face")).toContainText("Front");
    await drawn(page, `${size.name} paint`);
    if (size.name === "landscape") await page.screenshot({ path: "/opt/cursor/artifacts/five-landscape.png" });
    if (size.name === "320x568") await page.screenshot({ path: "/opt/cursor/artifacts/five-320x568.png" });
    if (size.name === "1280") await page.screenshot({ path: "/opt/cursor/artifacts/five-desktop.png" });
    await page.evaluate((lesson) => {
      const raw = JSON.stringify(lesson);
      localStorage.setItem("rubic-entered-v1", "1");
      localStorage.setItem("rubic-size-v1", "5");
      localStorage.setItem("rubic-lesson-v1", raw);
      sessionStorage.setItem("rubic-lesson-v1", raw);
    }, {
      start,
      moves: ["U'"],
      chunkOfMove: [0],
      chunks: [],
      cursor: 0,
      history: [],
    });
    await page.reload();
    await expect(page.getByTestId("lesson-step")).toContainText("Expert");
    await drawn(page, `${size.name} solving`);
    if (size.name === "landscape") await page.screenshot({ path: "/opt/cursor/artifacts/five-landscape-solving.png" });
  }
});

async function paintOne(page: Page, face: Face, row: number, col: number, letter: string, testInfo: TestInfo) {
  await paintSticker(page, face, row, col, testInfo, 5);
  const index = faceletIndex(face, row, col, 5);
  await expect.poll(async () => (await page.getByTestId("paint-cells").innerText())[index], { timeout: 2_000 }).toBe(letter);
}

async function stickerGap(page: Page): Promise<number> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) return 0;
  const pose = facePose("F");
  const left = projectToScreen(stickerPoint("F", 1, 1, 5), box.width, box.height, pose.theta, pose.phi);
  const right = projectToScreen(stickerPoint("F", 1, 2, 5), box.width, box.height, pose.theta, pose.phi);
  return Math.hypot(left.x - right.x, left.y - right.y);
}

async function drawn(page: Page, label: string) {
  const view = page.viewportSize();
  const canvas = await page.locator("canvas").boundingBox();
  expect(canvas, `${label} canvas`).toBeTruthy();
  const floor = Math.max(160, Math.min(view!.width, view!.height) * 0.4);
  expect(canvas!.width, `${label} width`).toBeGreaterThanOrEqual(floor);
  expect(canvas!.height, `${label} height`).toBeGreaterThanOrEqual(floor);
  expect(canvas!.x).toBeGreaterThanOrEqual(-1);
  expect(canvas!.y).toBeGreaterThanOrEqual(-1);
  expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(view!.width + 1);
  expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(view!.height + 1);
  const vivid = await page.locator("canvas").evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl || gl.drawingBufferWidth < 2) return 0;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      if (alpha > 80 && max > 70 && max - min > 25) count += 1;
    }
    return count;
  });
  expect(vivid, `${label} cube pixels`).toBeGreaterThan(40);
}
