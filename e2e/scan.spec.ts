import { expect, test, type Page } from "@playwright/test";
import { applyMoves, mulberry32, randomScramble, solvedBytes } from "../src/cube/model";
import { CANONICAL_RGB, FACE_SAMPLE_MARGIN, paintSyntheticFace, rotateNine, type ColorName } from "../src/scan/color";
import { photographCube } from "../src/scan/mapping";
import { encodePng } from "./png";

function png(colours: ColorName[], options?: { tint?: [number, number, number]; seed?: number }) {
  const raster = paintSyntheticFace(colours, {
    size: 240,
    marginRatio: FACE_SAMPLE_MARGIN,
    noise: 4,
    seed: options?.seed ?? 2,
    tint: options?.tint,
  });
  return { name: "face.png", mimeType: "image/png", buffer: encodePng(raster) };
}

async function upload(page: Page, colours: ColorName[], options?: { tint?: [number, number, number]; seed?: number }) {
  await page.getByTestId("scan-upload").setInputFiles(png(colours, options));
  await expect(page.getByRole("grid", { name: "Nine stickers" })).toBeVisible();
}

test("uploads six synthetic faces of a known scramble and solves it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "The full click-through is checked on desktop; mobile covers scan controls.");
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const scrambled = applyMoves(solvedBytes(), randomScramble(mulberry32(7), 12));
  const photos = photographCube(scrambled);
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  for (let index = 0; index < 6; index++) {
    const face = (["F", "R", "B", "L", "U", "D"] as const)[index]!;
    await upload(page, photos[face]!);
    const uncertain = page.locator(".sticker.uncertain");
    const count = await uncertain.count();
    for (let i = 0; i < count; i++) {
      await uncertain.first().click();
      const label = await page.locator(".sticker.selected").getAttribute("aria-label");
      const colour = label?.split(",")[0]?.replace(" centre", "") ?? "white";
      await page.getByRole("button", { name: colour, exact: true }).click();
    }
    await page.getByRole("button", { name: index === 5 ? "Review the cube" : "Keep this face" }).click();
  }
  await expect(page.getByText(/can exist on a normal cube|photo rotation/)).toBeVisible();
  const start = page.getByRole("button", { name: "Start the lesson from this scan" });
  await expect(start).toBeDisabled();
  await page.getByRole("checkbox").check();
  await start.click();
  await expect(page.locator("#cube-title")).toContainText(/Stage|Hold/, { timeout: 20_000 });
  const firstStage = await page.locator("#cube-title").textContent();
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.locator("#cube-title")).toHaveText(firstStage ?? "");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#cube-title")).toHaveText(firstStage ?? "");
  for (let step = 0; step < 220; step++) {
    const next = page.getByRole("button", { name: /^Next/ });
    if (await next.isDisabled()) break;
    await next.click();
  }
  await expect(page.locator("#cube-title")).toHaveText(/^Solved/);
});

test("edits all nine stickers including the centre, and a centre rename propagates", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  await upload(page, Array(9).fill("green") as ColorName[]);
  const cells = page.getByRole("gridcell");
  await expect(cells).toHaveCount(9);
  for (let index = 0; index < 9; index++) {
    await cells.nth(index).click();
    await page.getByRole("button", { name: "blue", exact: true }).click();
    await expect(cells.nth(index)).toHaveAttribute("aria-label", index === 4 ? /blue centre/ : /^blue/);
  }
  await page.getByRole("button", { name: "Retake" }).click();
  await upload(page, Array(9).fill("white") as ColorName[]);
  await expect(cells.nth(0)).toHaveAttribute("aria-label", /^white/);
});

test("does not accept an uncertain red-orange blend until it is corrected", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  const colours = Array(9).fill("blue") as ColorName[];
  const raster = paintSyntheticFace(colours, { size: 240, marginRatio: FACE_SAMPLE_MARGIN, noise: 0, seed: 1 });
  const margin = Math.round(240 * FACE_SAMPLE_MARGIN);
  const span = 240 - margin * 2;
  const cell = span / 3;
  const [rr, rg, rb] = CANONICAL_RGB.red;
  const [or, og, ob] = CANONICAL_RGB.orange;
  for (let y = margin + 4; y < margin + cell - 4; y++) {
    for (let x = margin + 4; x < margin + cell - 4; x++) {
      const offset = (y * 240 + x) * 4;
      raster.data[offset] = (rr + or) / 2;
      raster.data[offset + 1] = (rg + og) / 2;
      raster.data[offset + 2] = (rb + ob) / 2;
    }
  }
  await page.getByTestId("scan-upload").setInputFiles({ name: "blend.png", mimeType: "image/png", buffer: encodePng(raster) });
  await expect(page.locator(".sticker.uncertain").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep this face" })).toBeDisabled();
  await page.locator(".sticker.uncertain").first().click();
  await page.getByRole("button", { name: "blue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Keep this face" })).toBeEnabled();
});

test("renaming the centre renames untouched stickers matched to it", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  await upload(page, Array(9).fill("green") as ColorName[]);
  const cells = page.getByRole("gridcell");
  await cells.nth(4).click();
  await page.getByRole("button", { name: "yellow", exact: true }).click();
  await expect(cells.nth(4)).toHaveAttribute("aria-label", /yellow centre/);
  await expect(cells.nth(0)).toHaveAttribute("aria-label", /^yellow/);
  await expect(cells.nth(8)).toHaveAttribute("aria-label", /^yellow/);
});

test("a warm dim photo of one face still shows its colour names", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  await upload(page, Array(9).fill("yellow") as ColorName[], { tint: [1.15, 0.9, 0.7], seed: 4 });
  await expect(page.getByRole("gridcell").first()).toHaveAttribute("aria-label", /^yellow/);
});

test("a rotated face is not silently treated as the original scan", async ({ page }) => {
  const scrambled = applyMoves(solvedBytes(), ["R", "U", "F'"]);
  const photos = photographCube(scrambled);
  photos.F = rotateNine(photos.F, 1);
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  const order = ["F", "R", "B", "L", "U", "D"] as const;
  for (let index = 0; index < 6; index++) {
    await upload(page, photos[order[index]]!);
    const uncertain = page.locator(".sticker.uncertain");
    while ((await uncertain.count()) > 0) {
      await uncertain.first().click();
      const label = (await page.locator(".sticker.selected").getAttribute("aria-label")) ?? "white";
      await page.getByRole("button", { name: label.split(",")[0]!.replace(" centre", ""), exact: true }).click();
    }
    await page.getByRole("button", { name: index === 5 ? "Review the cube" : "Keep this face" }).click();
  }
  await expect(page.getByText(/photo rotation|Several photo rotations|ambiguous/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start the lesson from this scan" })).toBeDisabled();
});

test("camera denial and a missing camera both leave the upload path", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  await page.getByRole("button", { name: "Use camera" }).click();
  await expect(page.getByRole("alert")).toContainText("Camera permission was denied");
  await expect(page.getByTestId("scan-upload")).toBeAttached();
});

test("a missing camera is explained without losing the upload path", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("No camera", "NotFoundError");
    };
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  await page.getByRole("button", { name: "Use camera" }).click();
  await expect(page.getByRole("alert")).toContainText("No camera is available");
  await expect(page.getByTestId("scan-upload")).toBeAttached();
});

test("restart copy says an accidental layer turn spoils earlier faces", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  await expect(page.getByText(/Close this scan and start again/)).toBeVisible();
});
