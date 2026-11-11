import { expect, test, type Page } from "@playwright/test";
import { applyFiveString, randomFiveScramble, solvedFiveString } from "../src/cube/five";
import { mulberry32 } from "../src/cube/model";
import { expectCardClear } from "./solver-card";

const SOLVED = solvedFiveString();

test("5×5 shows download progress, the cancel warning, and a retry", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("rubic-size-v1", "5"));
  await page.route("**/gullicube/data/diag_x10.cls", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await route.continue().catch(() => undefined);
  });
  await page.goto("./");
  const bar = page.getByTestId("solver-download");
  await expect(bar).toContainText("Shorter solver");
  await expect(bar).toContainText(/MB · \d+%/);
  await expect(bar).toContainText(/about 320 instead of about 120[-–]170/);
  await expect(bar.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expectCardClear(page, "downloading");
  if (testInfo.project.name === "mobile") await page.screenshot({ path: "/opt/cursor/artifacts/download-card-phone.png" });
  await bar.getByRole("button", { name: "Cancel" }).click();
  await expect(bar.getByRole("button", { name: "Download shorter solver" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter colours" })).toBeEnabled();
  await page.unroute("**/gullicube/data/diag_x10.cls");
  await bar.getByRole("button", { name: "Download shorter solver" }).click();
  await expect(bar).toContainText("Shorter solver ready", { timeout: 60_000 });
  await page.reload();
  await expect(page.getByTestId("solver-download")).toContainText("Shorter solver ready", { timeout: 15_000 });
  await expect(page.getByTestId("solver-download")).not.toContainText("Downloading");
  await expectCardClear(page, "ready");
});

test("a network failure keeps the page usable and offers the download again", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rubic-size-v1", "5"));
  await page.route("**/gullicube/manifest.json", (route) => route.abort());
  await page.goto("./");
  await expect(page.getByTestId("solver-download")).toContainText("could not be downloaded");
  await expect(page.getByRole("button", { name: "Enter colours" })).toBeEnabled();
  await page.unroute("**/gullicube/manifest.json");
  await page.getByRole("button", { name: "Download shorter solver" }).click();
  await expect(page.getByTestId("solver-download")).toContainText("Shorter solver ready", { timeout: 60_000 });
});

test("the shorter solver solves a scramble, and removing the cache falls back", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await primeEntered(page);
  await page.goto("./");
  await expect(page.getByTestId("solver-download")).toContainText("Shorter solver ready", { timeout: 60_000 });
  await page.locator("details.options-panel summary").click();
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 1 of (\d+)/, { timeout: 90_000 });
  const title = await page.getByTestId("lesson-step").innerText();
  const count = Number(title.match(/(\d+)\s*$/)?.[1] ?? "0");
  const note = page.getByTestId("solver-note");
  const reason = (await note.count()) ? await note.getAttribute("data-reason") : "";
  expect(reason, `shorter solver fell back (${reason}) with ${count} moves`).toBe("");
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(220);
  if (testInfo.project.name === "desktop") await page.screenshot({ path: "/opt/cursor/artifacts/gulli-solving-desktop.png" });
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByTestId("stop-solve")).toBeEnabled();
  await page.getByTestId("stop-solve").click();
  await expect(page.getByRole("button", { name: "Scramble" })).toBeEnabled();
  await page.getByRole("button", { name: "Remove cached solver" }).click();
  await expect(page.getByRole("button", { name: "Download shorter solver" })).toBeVisible();
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.locator("p.quiet[role=status]")).toContainText(/Solving centres|Pairing edges|standard 5×5/);
  await expect(page.getByTestId("lesson-step")).toHaveText(/Expert · Move 1 of \d+/, { timeout: 60_000 });
});

async function primeEntered(page: Page) {
  const start = applyFiveString(SOLVED, randomFiveScramble(mulberry32(3), 1));
  await page.addInitScript((lesson) => {
    localStorage.setItem("rubic-size-v1", "5");
    localStorage.setItem("rubic-entered-v1", "1");
    localStorage.setItem("rubic-lesson-v1", JSON.stringify(lesson));
  }, {
    start,
    moves: [],
    chunkOfMove: [],
    chunks: [],
    cursor: 0,
    history: [],
  });
}
