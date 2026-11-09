import { expect, test, type Page } from "@playwright/test";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
import { emptyLesson, withSolution } from "../src/state/lesson";
import { solveBeginner } from "../src/solver/beginner";
import { markReady } from "./ready";

async function useBeginner(page: Page) {
  await page.addInitScript(() => localStorage.setItem("rubic-method-v1", "beginner"));
}

const SOLVED = faceletsToString(solvedBytes());
const CASES = [["U"], ["R2"], ["F", "U"], ["L'", "D"], ["B", "R2"]];

test("next follows several beginner solutions to solved", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await markReady(page);
  await useBeginner(page);
  await page.goto("./");
  await page.getByText("No moves needed").waitFor();
  for (const scramble of CASES) {
    const start = faceletsToString(applyMoves(solvedBytes(), scramble));
    const solution = solveBeginner(start);
    expect(solution.moves.length).toBeGreaterThan(0);
    await install(page, start, solution);
    const first = await page.getByTestId("lesson-step").textContent();
    expect(first).toMatch(/White cross|White corners|Middle layer|Yellow cross|Yellow edges|Yellow corners|Orient corners/);
    for (let step = 0; step < solution.moves.length; step += 1) {
      await page.getByRole("button", { name: /^Next/ }).click();
    }
    await expect(page.getByTestId("lesson-step")).toHaveText("Solved");
    const done = await page.getByTestId("lesson-facelets").textContent();
    expect(done && /^((.)\2{8}){6}$/.test(done)).toBe(true);
    await expect(page.getByTestId("move-line")).toHaveCount(0);
  }
});

test("solve 3× uses the beginner plan and restore returns that cube", async ({ page }) => {
  test.setTimeout(180_000);
  await markReady(page);
  await useBeginner(page);
  await page.goto("./");
  await page.getByText("No moves needed").waitFor();
  await page.locator("details.options-panel summary").click();
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/· \d+\/\d+/, { timeout: 20_000 });
  const start = await page.getByTestId("lesson-facelets").textContent();
  await page.getByTestId("solve-fast").click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 150_000 });
  await expect(page.getByTestId("move-line")).toHaveCount(0);
  await page.getByTestId("restore-solve").click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(start ?? "");
  await expect(page.getByTestId("lesson-step")).toHaveText(/· \d+\/\d+/);
});

async function install(page: Page, start: string, solution: ReturnType<typeof solveBeginner>) {
  const lesson = withSolution(emptyLesson(SOLVED), start, solution);
  await page.evaluate((data) => sessionStorage.setItem("rubic-lesson-v1", JSON.stringify(data)), lesson);
  await page.reload();
  await page.getByTestId("lesson-facelets").waitFor();
}
