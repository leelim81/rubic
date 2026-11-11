import { expect, test, type Page } from "@playwright/test";
import { applyMegaString, FACE_NAMES, MEGA_COLORS, MEGA_STICKER_MESH, solvedMegaString, STICKERS_PER_FACE } from "../src/megaminx/model";
import { MEGA_PAINT_ORDER } from "../src/megaminx/paint";
import { projectToScreen } from "../src/view/camera";
import { hexToRgb } from "../src/view/contrast";
import { displaySwatch, type LogicalColour } from "../src/view/palette";

const SOLVED = solvedMegaString();
const SCRAMBLED = applyMegaString(SOLVED, ["R", "U++"]);

test("Megaminx is in the puzzle menu and has no beginner lesson", async ({ page }, testInfo) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const menu = page.getByLabel("Cube size");
  await expect(menu.locator("option")).toHaveText(["3×3", "5×5", "Pyraminx", "Master Pyraminx", "Megaminx"]);
  await menu.selectOption("mega");
  await expect(menu).toHaveValue("mega");
  await expect(page.getByTestId("empty-prompt")).toBeVisible();
  if (testInfo.project.name === "desktop") await page.screenshot({ path: "/opt/cursor/artifacts/megaminx-dropdown.png" });

  await page.getByRole("button", { name: "Enter colours" }).click();
  await expect(page.getByTestId("paint-face")).toContainText("Front");
  await expect(page.getByTestId("paint-face")).toContainText("1 of 12");
  await expect(page.getByTestId("paint-progress")).toHaveText("0/10 filled");
  await expect(page.getByRole("button", { name: "purple", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "grey", exact: true })).toBeVisible();
  if (testInfo.project.name === "desktop") await page.screenshot({ path: "/opt/cursor/artifacts/megaminx-3d.png" });
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("empty-prompt")).toBeVisible();
});

test("a painted Megaminx scramble solves back to the solved dodecahedron", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Painting all twelve faces is checked on desktop.");
  test.setTimeout(180_000);
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Cube size").selectOption("mega");
  await page.getByRole("button", { name: "Enter colours" }).click();
  await expect(page.getByTestId("paint-face")).toContainText("Front");

  for (const face of MEGA_PAINT_ORDER) {
    await expect(page.getByTestId("paint-face")).toContainText(`${titleOf(face)} ·`);
    const colours = new Map<string, number[]>();
    for (let local = 1; local < STICKERS_PER_FACE; local += 1) {
      const index = FACE_NAMES.indexOf(face) * STICKERS_PER_FACE + local;
      const letter = SCRAMBLED[index]!;
      const bucket = colours.get(letter) ?? [];
      bucket.push(local);
      colours.set(letter, bucket);
    }
    for (const [letter, locals] of colours) {
      const name = MEGA_COLORS.find((color) => color.letter === letter)!.id;
      await page.getByRole("button", { name, exact: true }).click();
      for (const local of locals) await paintOne(page, face, local, letter);
    }
    if (face !== "D") await page.getByRole("button", { name: "Next face" }).click();
  }

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("lesson-step")).toContainText("Expert", { timeout: 30_000 });
  await expect(page.getByTestId("lesson-step")).not.toContainText("Beginner");
  await page.locator("details.options-panel summary").click();
  const method = page.getByRole("combobox", { name: "Solution method" });
  await expect(method).toBeDisabled();
  await expect(method).toHaveValue("expert");
  await expect(method.locator("option")).toHaveCount(1);

  await expect(page.getByTestId("move-line")).toContainText(/degrees/);
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByTestId("lesson-step")).not.toHaveText(/Move 1 of/);
  const fast = page.getByTestId("solve-fast");
  if (await fast.isEnabled()) await fast.click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 120_000 });
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await page.screenshot({ path: "/opt/cursor/artifacts/megaminx-solved.png" });
});

test("pastel recolours the Megaminx and its paint swatches", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript((solved) => {
    localStorage.setItem("rubic-entered-v1", "1");
    localStorage.setItem("rubic-size-v1", "mega");
    localStorage.setItem("rubic-lesson-v1", JSON.stringify({
      start: solved,
      moves: [],
      chunkOfMove: [],
      chunks: [],
      cursor: 0,
      history: [],
      arrivedBy: null,
      pending: null,
    }));
  }, SOLVED);
  await page.goto("./");
  await expect(page.getByTestId("lesson-facelets")).toHaveText(SOLVED);
  await page.locator("details.options-panel summary").click();
  await page.getByRole("checkbox", { name: /Letter stickers/ }).uncheck();
  const front = MEGA_STICKER_MESH.find((sticker) => sticker.face === FACE_NAMES.indexOf("F") && sticker.kind === "center");
  if (!front) throw new Error("The front centre sticker is missing.");
  const standard = displaySwatch("green", "standard").hex;
  const pastel = displaySwatch("green", "pastel").hex;
  await expect.poll(async () => rgbDistance(await centreFill(page, front.centroid), standard), { timeout: 5_000 }).toBeLessThan(36);
  await page.getByRole("switch", { name: "Pastel colours" }).click();
  await expect.poll(async () => rgbDistance(await centreFill(page, front.centroid), pastel), { timeout: 5_000 }).toBeLessThan(36);
  await page.getByRole("button", { name: "Edit colours" }).click();
  await expect(page.getByTestId("paint-face")).toBeVisible();
  for (const colour of MEGA_COLORS.map((color) => color.id as LogicalColour)) {
    const swatch = page.locator(`.paint-palette button[data-colour="${colour}"]`);
    await expect(swatch).toHaveCSS("background-color", rgbText(displaySwatch(colour, "pastel").hex));
  }
});

function rgbDistance(rgb: [number, number, number], hex: string): number {
  const [red, green, blue] = hexToRgb(hex);
  return Math.hypot(rgb[0] - red, rgb[1] - green, rgb[2] - blue);
}

function rgbText(hex: string): string {
  const [red, green, blue] = hexToRgb(hex);
  return `rgb(${red}, ${green}, ${blue})`;
}

async function centreFill(page: Page, point: { x: number; y: number; z: number }): Promise<[number, number, number]> {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The megaminx is not on screen.");
  const pose = await canvas.evaluate((element) => {
    const reader = (element as HTMLCanvasElement & { __rubicPose?: () => { theta: number; phi: number } }).__rubicPose;
    return reader ? reader() : { theta: 0.62, phi: 1.02 };
  });
  const screen = projectToScreen(point, box.width, box.height, pose.theta, pose.phi);
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
  if (!rgb || rgb[3]! < 200) throw new Error(`No megaminx sticker pixel (${rgb?.join(",") ?? "missing"}).`);
  return [rgb[0]!, rgb[1]!, rgb[2]!];
}

function titleOf(face: string): string {
  return { F: "Front", R: "Right", BR: "Back right", BL: "Back left", L: "Left", U: "Up", FR: "Front right", DR: "Down right", B: "Back", DL: "Down left", FL: "Front left", D: "Down" }[face] ?? face;
}

async function paintOne(page: Page, face: (typeof MEGA_PAINT_ORDER)[number], local: number, letter: string) {
  const button = page.getByRole("button", { name: `${titleOf(face)} sticker ${local}, blank`, exact: true });
  await button.evaluate((element) => (element as HTMLButtonElement).click());
  const index = FACE_NAMES.indexOf(face) * STICKERS_PER_FACE + local;
  await expect.poll(async () => (await page.getByTestId("paint-cells").innerText())[index], { timeout: 2_000 }).toBe(letter);
}
