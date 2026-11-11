import { expect, test, type Page } from "@playwright/test";
import type { Face } from "../src/cube/model";
import { projectToScreen } from "../src/view/camera";
import { hexToRgb } from "../src/view/contrast";
import { displaySwatch } from "../src/view/palette";
import { PAINT_FACES, stickerPoint } from "../src/view/paint";
import { centreGlyphContrast } from "./glyph-contrast";
import { waitForFace } from "./paint-click";
import { markReady } from "./ready";

const COLOURS = ["white", "yellow", "red", "orange", "blue", "green"] as const;

function rgbDistance(rgb: [number, number, number], hex: string): number {
  const [red, green, blue] = hexToRgb(hex);
  return Math.hypot(rgb[0] - red, rgb[1] - green, rgb[2] - blue);
}

function rgbText(hex: string): string {
  const [red, green, blue] = hexToRgb(hex);
  return `rgb(${red}, ${green}, ${blue})`;
}

/** Colour at the centre of a face sticker. Letters have to be off, or this hits the glyph. */
async function centreFill(page: Page, face: Face): Promise<[number, number, number]> {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The cube is not on screen.");
  const pose = await canvas.evaluate((element) => {
    const reader = (element as HTMLCanvasElement & { __rubicPose?: () => { theta: number; phi: number } }).__rubicPose;
    return reader ? reader() : { theta: 0.62, phi: 1.02 };
  });
  const screen = projectToScreen(stickerPoint(face, 1, 1), box.width, box.height, pose.theta, pose.phi);
  const rgb = await canvas.evaluate((element, query) => {
    const gl = element.getContext("webgl2") ?? element.getContext("webgl");
    if (!gl) return null;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const x = Math.round(query.x * (width / element.clientWidth));
    const y = Math.round(height - query.y * (height / element.clientHeight));
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const index = (y * width + x) * 4;
    return [pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0, pixels[index + 3] ?? 0];
  }, screen);
  if (!rgb || rgb[3]! < 200) throw new Error(`No sticker pixel on ${face} (${rgb?.join(",") ?? "missing"}).`);
  return [rgb[0]!, rgb[1]!, rgb[2]!];
}

test("the pastel switch changes the cube and the paint swatches, then stays after reload", async ({ page }) => {
  test.setTimeout(60_000);
  await markReady(page);
  await page.goto("./");
  await expect(page.getByText("No moves needed")).toBeVisible();
  await page.locator("details.options-panel summary").click();
  const pastel = page.getByRole("switch", { name: "Pastel colours" });
  await expect(pastel).toBeVisible();
  await expect(pastel).not.toBeChecked();
  await page.getByRole("checkbox", { name: /Letter stickers/ }).uncheck();

  const standardGreen = displaySwatch("green", "standard").hex;
  const pastelGreen = displaySwatch("green", "pastel").hex;
  await expect.poll(async () => rgbDistance(await centreFill(page, "F"), standardGreen), { timeout: 5_000 }).toBeLessThan(36);

  await pastel.click();
  await expect(pastel).toBeChecked();
  await expect.poll(async () => rgbDistance(await centreFill(page, "F"), pastelGreen), { timeout: 5_000 }).toBeLessThan(36);
  const painted = await centreFill(page, "F");
  expect(rgbDistance(painted, pastelGreen)).toBeLessThan(rgbDistance(painted, standardGreen));
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("rubic-palette-v1"))).toBe("pastel");

  await page.reload();
  await expect(page.getByText("No moves needed")).toBeVisible();
  await page.locator("details.options-panel summary").click();
  await expect(pastel).toBeChecked();
  await page.getByRole("checkbox", { name: /Letter stickers/ }).uncheck();
  await expect.poll(async () => rgbDistance(await centreFill(page, "F"), pastelGreen), { timeout: 5_000 }).toBeLessThan(36);

  await page.getByRole("button", { name: "Edit colours" }).click();
  await expect(page.getByTestId("paint-face")).toBeVisible();
  for (const colour of COLOURS) {
    const swatch = page.locator(`.paint-palette button[data-colour="${colour}"]`);
    await expect(swatch).toHaveCSS("background-color", rgbText(displaySwatch(colour, "pastel").hex));
    await expect(swatch).toHaveCSS("color", rgbText(displaySwatch(colour, "pastel").ink));
  }

  await page.getByRole("button", { name: "Cancel" }).click();
  await page.locator("details.options-panel summary").click();
  await pastel.click();
  await expect(pastel).not.toBeChecked();
  await page.getByRole("button", { name: "Edit colours" }).click();
  for (const colour of COLOURS) {
    await expect(page.locator(`.paint-palette button[data-colour="${colour}"]`)).toHaveCSS(
      "background-color",
      rgbText(displaySwatch(colour, "standard").hex),
    );
  }
});

test("pastel centre letters stay at 4.5:1 on every face", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("rubic-palette-v1", "pastel"));
  await page.goto("./");
  await page.getByRole("button", { name: "Enter colours" }).click();
  for (const face of PAINT_FACES) {
    await waitForFace(page, face);
    expect(await centreGlyphContrast(page, face), face).toBeGreaterThanOrEqual(4.5);
    if (face !== "D") await page.getByRole("button", { name: "Next face" }).click();
  }
});

test("scramble and the next move still run with pastel colours", async ({ page }) => {
  test.setTimeout(40_000);
  await markReady(page);
  await page.addInitScript(() => localStorage.setItem("rubic-palette-v1", "pastel"));
  await page.goto("./");
  await expect(page.getByText("No moves needed")).toBeVisible();
  await page.locator("details.options-panel summary").click();
  await expect(page.getByRole("switch", { name: "Pastel colours" })).toBeChecked();
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move \d+ of \d+/, { timeout: 20_000 });
  const before = await page.getByTestId("lesson-facelets").textContent();
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByTestId("lesson-facelets")).not.toHaveText(before ?? "");
});
