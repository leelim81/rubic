import type { Page } from "@playwright/test";

/** Solver tests start after a cube has already been entered. */
export async function markReady(page: Page) {
  await page.addInitScript(() => localStorage.setItem("rubic-entered-v1", "1"));
}
