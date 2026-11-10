import { expect, type Page } from "@playwright/test";

/** The download card sits in the column, so it must not cover the subtitle or the header. */
export async function expectCardClear(page: Page, label: string) {
  const hits = await page.evaluate(() => {
    const card = document.querySelector("[data-testid=solver-download]");
    if (!card) return [];
    const cardBox = card.getBoundingClientRect();
    if (cardBox.width < 2 || cardBox.height < 2) return [];
    const selectors = ["[data-testid=brand]", "[data-testid=empty-prompt]", "[data-testid=lesson-step]", "[data-testid=paint-face]"];
    const overlapped: string[] = [];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = node.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const overlaps = cardBox.x < box.x + box.width - 1
        && cardBox.x + cardBox.width > box.x + 1
        && cardBox.y < box.y + box.height - 1
        && cardBox.y + cardBox.height > box.y + 1;
      if (overlaps) overlapped.push(selector);
    }
    return overlapped;
  });
  expect(hits, `${label}: download card overlaps ${hits.join(", ")}`).toEqual([]);
}
