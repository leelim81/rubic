import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  (page as unknown as { __errors: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors?: string[] }).__errors ?? []).toEqual([]);
});
import { applyMoves, solvedBytes } from "../src/cube/model";
import { CANONICAL_RGB, FACE_SAMPLE_MARGIN, paintInsetFace, paintSyntheticFace, rotateNine, type ColorName } from "../src/scan/color";
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

test("scans a short legal cube and solves it through a stage change", async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const scrambled = applyMoves(solvedBytes(), ["U", "R"]);
  const photos = photographCube(scrambled);
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  for (let index = 0; index < 6; index++) {
    const face = (["F", "R", "B", "L", "U", "D"] as const)[index]!;
    await upload(page, photos[face]!);
    const uncertain = page.locator(".sticker.uncertain");
    while ((await uncertain.count()) > 0) {
      await uncertain.first().click();
      const label = (await page.locator(".sticker.selected").getAttribute("aria-label")) ?? "white";
      await page.getByRole("button", { name: label.split(",")[0]!.replace(" centre", ""), exact: true }).click();
    }
    await page.getByRole("button", { name: index === 5 ? "Review cube" : "Confirm colours & next face" }).click();
  }
  await expect(page.getByText(/can exist on a normal cube|photo rotation/)).toBeVisible();
  const start = page.getByRole("button", { name: "Start solving" });
  await expect(start).toBeDisabled();
  await page.getByRole("checkbox").check();
  await start.click();
  const title = page.locator("#cube-title");
  await expect(title).toHaveText(/White cross/, { timeout: 20_000 });
  await expect(page.getByTestId("lesson-step")).toHaveText("Step 1 of 2, move 1");
  const next = page.getByRole("button", { name: /^Next/ });
  const box = await next.boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  if (info.project.name === "mobile") {
    expect(box!.width).toBeGreaterThan(viewport!.width * 0.7);
  }
  await next.click();
  await expect(title).toHaveText(/White cross/);
  await expect(page.getByTestId("lesson-step")).toHaveText("Half turn R2: quarter 1 of 2. R twice, or R' twice.");
  await next.click();
  await expect(title).toHaveText(/Match the cross/);
  await expect(page.getByTestId("lesson-step")).toHaveText("Step 1 of 1, move 1");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(title).toHaveText(/White cross/);
  await expect(page.getByTestId("lesson-step")).toHaveText("Half turn R2: quarter 1 of 2. R twice, or R' twice.");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Half turn R2: quarter 1 of 2. R twice, or R' twice.");
  await expect(title).toHaveText(/White cross/);
  await next.click();
  await expect(title).toHaveText(/Match the cross/);
  await next.click();
  await expect(title).toHaveText(/^Solved/);
  await expect(page.getByRole("button", { name: /^Next/ })).toBeDisabled();
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
  await expect(page.getByRole("button", { name: "Confirm colours & next face" })).toBeDisabled();
  await page.locator(".sticker.uncertain").first().click();
  await page.getByRole("button", { name: "blue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm colours & next face" })).toBeEnabled();
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
    await page.getByRole("button", { name: index === 5 ? "Review cube" : "Confirm colours & next face" }).click();
  }
  await expect(page.getByText(/photo rotation|Several photo rotations|ambiguous/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start solving" })).toBeDisabled();
});

test("camera denial and a missing camera both leave the upload path", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  await page.getByRole("button", { name: "Capture photo" }).click();
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
  await page.getByRole("button", { name: "Capture photo" }).click();
  await expect(page.getByRole("alert")).toContainText("No camera is available");
  await expect(page.getByTestId("scan-upload")).toBeAttached();
});

test("restart copy says an accidental layer turn spoils earlier faces", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  await expect(page.getByText(/close this scan and start again/i)).toBeVisible();
});

test("an inset face is not accepted until the crop sits on the stickers", async ({ page }) => {
  const colours = ["white", "yellow", "red", "orange", "blue", "green", "white", "red", "yellow"] as ColorName[];
  const width = 420;
  const height = 300;
  const rect = { x: 150, y: 80, width: 120, height: 110 };
  const raster = paintInsetFace(colours, width, height, rect, [40, 20, 70]);
  await page.goto("./");
  await page.getByRole("button", { name: "Scan" }).click();
  await page.getByTestId("scan-upload").setInputFiles({ name: "inset.png", mimeType: "image/png", buffer: encodePng(raster) });
  await expect(page.getByRole("button", { name: "Confirm colours & next face" })).toBeDisabled();
  const margin = 0.12;
  const stepsBetween = (from: number, to: number) => Math.max(0, Math.round((to - from) / 0.02));
  const left = rect.x / width;
  const right = (rect.x + rect.width) / width;
  const top = rect.y / height;
  const bottom = (rect.y + rect.height) / height;
  const nudges: [string, string, number][] = [
    ["Top-left corner of the face", "ArrowRight", stepsBetween(margin, left)],
    ["Top-left corner of the face", "ArrowDown", stepsBetween(margin, top)],
    ["Top-right corner of the face", "ArrowLeft", stepsBetween(right, 1 - margin)],
    ["Top-right corner of the face", "ArrowDown", stepsBetween(margin, top)],
    ["Bottom-right corner of the face", "ArrowLeft", stepsBetween(right, 1 - margin)],
    ["Bottom-right corner of the face", "ArrowUp", stepsBetween(bottom, 1 - margin)],
    ["Bottom-left corner of the face", "ArrowRight", stepsBetween(margin, left)],
    ["Bottom-left corner of the face", "ArrowUp", stepsBetween(bottom, 1 - margin)],
  ];
  for (const [name, key, times] of nudges) {
    await page.getByRole("button", { name }).focus();
    for (let i = 0; i < times; i++) await page.keyboard.press(key);
  }
  const uncertain = page.locator(".sticker.uncertain");
  while ((await uncertain.count()) > 0) {
    await uncertain.first().click();
    const label = (await page.locator(".sticker.selected").getAttribute("aria-label")) ?? "white";
    await page.getByRole("button", { name: label.split(",")[0]!.replace(" centre", ""), exact: true }).click();
  }
  await expect(page.getByRole("gridcell").nth(0)).toHaveAttribute("aria-label", /^white/);
  await expect(page.getByRole("gridcell").nth(4)).toHaveAttribute("aria-label", /blue centre/);
  await expect(page.getByRole("button", { name: "Confirm colours & next face" })).toBeEnabled();
});
