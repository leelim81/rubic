import { expect, test, type Page } from "@playwright/test";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
import { emptyLesson, withSolution } from "../src/state/lesson";

const SOLVED = faceletsToString(solvedBytes());

const SIZES: { name: string; width: number; height: number; shot?: "empty" | "paint" | "solving" }[] = [
  { name: "320", width: 320, height: 640 },
  { name: "360", width: 360, height: 740 },
  { name: "390", width: 390, height: 844, shot: "paint" },
  { name: "414", width: 414, height: 896 },
  { name: "768", width: 768, height: 1024, shot: "empty" },
  { name: "1024", width: 1024, height: 768 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1440", width: 1440, height: 900, shot: "solving" },
  { name: "1920", width: 1920, height: 1080 },
  { name: "landscape", width: 740, height: 360, shot: "paint" },
];

test("the layout fits empty, paint, and solving at every screen size", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "This test sets its own viewport sizes.");
  test.setTimeout(180_000);
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("./");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.getByRole("button", { name: "Enter colours" }).waitFor();
    await fit(page, `${size.name} empty`);
    if (size.shot === "empty" || size.name === "1440") await page.screenshot({ path: shotPath(size, "empty") });

    await page.getByRole("button", { name: "Enter colours" }).click();
    await page.getByTestId("paint-face").waitFor();
    await fit(page, `${size.name} paint`);
    if (size.shot === "paint") await page.screenshot({ path: shotPath(size, "paint") });
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.evaluate((lesson) => {
      localStorage.setItem("rubic-entered-v1", "1");
      sessionStorage.setItem("rubic-lesson-v1", JSON.stringify(lesson));
    }, lessonWithMove());
    await page.reload();
    await page.getByTestId("lesson-step").waitFor();
    await fit(page, `${size.name} solving`);
    if (size.shot === "solving" || size.name === "1440") await page.screenshot({ path: shotPath(size, "solving") });
  }
});

function shotPath(size: { name: string; shot?: string }, state: "empty" | "paint" | "solving") {
  if (size.name === "1440" && state === "empty") return "/opt/cursor/artifacts/theme-empty-desktop.png";
  if (size.name === "1440" && state === "solving") return "/opt/cursor/artifacts/theme-solving-desktop.png";
  if (size.name === "390" && state === "paint") return "/opt/cursor/artifacts/theme-paint-phone.png";
  if (size.name === "768" && state === "empty") return "/opt/cursor/artifacts/theme-tablet.png";
  if (size.name === "landscape" && state === "paint") return "/opt/cursor/artifacts/theme-landscape-phone.png";
  return `/opt/cursor/artifacts/theme-${size.name}-${state}.png`;
}

function lessonWithMove() {
  const start = faceletsToString(applyMoves(solvedBytes(), ["U"]));
  return withSolution(emptyLesson(SOLVED), start, {
    moves: ["U'"],
    chunkOfMove: [0],
    chunks: [{
      id: "script",
      stageId: "hold",
      stageNumber: 0,
      stageName: "Solve",
      title: "Solve",
      goal: "",
      why: "",
      caseName: "script",
      hold: "",
      moves: ["U'"],
      focus: [],
      advice: "",
      tip: null,
      fingertricks: [""],
    }],
  });
}

async function fit(page: Page, label: string) {
  const view = page.viewportSize();
  expect(view, label).toBeTruthy();
  const scroll = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll.width, `${label} horizontal scroll`).toBeLessThanOrEqual(scroll.client + 1);
  const cube = await page.locator(".cube-frame").boundingBox();
  expect(cube, `${label} cube`).toBeTruthy();
  expect(inView(cube, view!), `${label} cube on screen`).toBe(true);
  const buttons = page.locator(".paint-nav button:visible, .paint-palette button:visible, .paint-clear:visible, .controls button:visible, .enter-hero button:visible, header button:visible");
  const count = await buttons.count();
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const box = await buttons.nth(index).boundingBox();
    const name = await buttons.nth(index).innerText();
    expect(box, `${label} ${name}`).toBeTruthy();
    expect(box!.height, `${label} ${name}`).toBeGreaterThanOrEqual(44);
    expect(inView(box, view!), `${label} ${name} y=${box!.y.toFixed(0)} h=${box!.height.toFixed(0)} bottom=${(box!.y + box!.height).toFixed(0)} view=${view!.height}`).toBe(true);
    expect(overlaps(cube, box), `${label} ${name} overlaps cube`).toBe(false);
    boxes.push(box!);
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      expect(overlaps(boxes[left]!, boxes[right]!), `${label} controls overlap`).toBe(false);
    }
  }
}

function overlaps(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
) {
  if (!a || !b) return false;
  return a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
}

function inView(
  box: { x: number; y: number; width: number; height: number } | null,
  view: { width: number; height: number },
) {
  if (!box) return false;
  return box.x >= -1 && box.y >= -1 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1;
}
