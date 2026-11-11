import { expect, test, type Page } from "@playwright/test";
import { solvedFourString } from "../src/cube/four";
import { solvedFiveString } from "../src/cube/five";
import { faceletsToString, solvedBytes } from "../src/cube/model";

const SUBJECT = "Trevor\u2019s Real Rubik\u2019s Solver";

test("the footer contact link uses the mail address and subject", async ({ page }) => {
  await page.goto("./");
  const link = page.getByTestId("contact-link");
  await expect(link).toHaveText("Contact me");
  await expect(link).toHaveAttribute("href", /^mailto:leelim81@gmail.com\?subject=/);
  const href = await link.getAttribute("href");
  expect(new URL(href ?? "").searchParams.get("subject")).toBe(SUBJECT);
  await link.focus();
  await expect(link).toBeFocused();
});

test("the footer stays clear of the cube and controls on a desktop and a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "This test sets its own viewport sizes.");
  for (const size of [
    { width: 1360, height: 900 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("./?nocount");
    await page.getByRole("button", { name: "Enter colours" }).waitFor();
    await page.evaluate(() => {
      const count = document.querySelector<HTMLElement>("[data-testid=visit-count]");
      if (!count) return;
      count.hidden = false;
      count.textContent = "12,345 visits";
    });
    await expect(page.getByTestId("visit-count")).toHaveText("12,345 visits");
    await expectClear(page, `${size.width}x${size.height}`);
  }
});

async function expectClear(page: Page, label: string) {
  const boxes = await page.evaluate(() => {
    const box = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right };
    };
    return {
      canvas: box("canvas"),
      footer: box(".site-footer"),
      contact: box("[data-testid=contact-link]"),
      count: box("[data-testid=visit-count]"),
      controls: box(".controls"),
      enter: box(".enter-hero"),
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });
  expect(boxes.footer, label).toBeTruthy();
  expect(boxes.contact, label).toBeTruthy();
  expect(boxes.canvas, label).toBeTruthy();
  const footer = boxes.footer!;
  const canvas = boxes.canvas!;
  const contact = boxes.contact!;
  expect(footer.right, label).toBeLessThanOrEqual(boxes.width + 1);
  expect(footer.bottom, label).toBeLessThanOrEqual(boxes.height + 1);
  expect(contact.right, label).toBeLessThanOrEqual(boxes.width + 1);
  expect(intersects(footer, canvas), `${label} footer overlaps the cube`).toBe(false);
  expect(intersects(contact, canvas), `${label} contact overlaps the cube`).toBe(false);
  if (boxes.count) expect(intersects(boxes.count, canvas), `${label} count overlaps the cube`).toBe(false);
  for (const other of [boxes.controls, boxes.enter]) {
    if (!other) continue;
    expect(intersects(footer, other), `${label} footer overlaps a control`).toBe(false);
  }
}

test("the footer stays in the document flow and clear of other content", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "This test sets its own viewport sizes.");
  test.setTimeout(180_000);
  const puzzles = [
    { value: "3", solved: faceletsToString(solvedBytes()) },
    { value: "4", solved: solvedFourString() },
    { value: "5", solved: solvedFiveString() },
  ];
  const views = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
  ];
  for (const puzzle of puzzles) {
    await page.goto("./");
    await page.evaluate(({ value, solved }) => {
      localStorage.setItem("rubic-size-v1", value);
      localStorage.setItem("rubic-entered-v1", "1");
      localStorage.setItem("rubic-lesson-v1", JSON.stringify({
        start: solved,
        moves: [],
        chunkOfMove: [],
        chunks: [],
        cursor: 0,
        history: [],
      }));
    }, puzzle);
    await page.reload();
    await page.getByRole("button", { name: "Edit colours" }).waitFor();
    for (const view of views) {
      await page.setViewportSize(view);
      for (const open of [false, true]) {
        const summary = page.locator("details.options-panel summary");
        const opened = await summary.innerText();
        if (open && opened.includes("Options")) await summary.click();
        if (!open && opened.includes("Hide")) await summary.click();
        await page.evaluate(() => {
          const count = document.querySelector<HTMLElement>("[data-testid=visit-count]");
          if (!count) return;
          count.hidden = false;
          count.textContent = "12,345 visits";
        });
        const label = `${puzzle.value} ${view.width}x${view.height} options ${open ? "open" : "closed"}`;
        await expectFooterApart(page, label);
      }
    }
  }
});

async function expectFooterApart(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const footer = document.querySelector(".site-footer");
    if (!footer) return { missing: true, position: "", offenders: [] as string[] };
    const position = getComputedStyle(footer).position;
    const footerBox = footer.getBoundingClientRect();
    const offenders: string[] = [];
    for (const node of document.body.querySelectorAll("*")) {
      if (!(node instanceof HTMLElement)) continue;
      if (node === footer || footer.contains(node) || node.contains(footer)) continue;
      const closed = node.closest("details");
      if (closed && !closed.open) continue;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const overlaps = box.left < footerBox.right - 0.5 && box.right > footerBox.left + 0.5 && box.top < footerBox.bottom - 0.5 && box.bottom > footerBox.top + 0.5;
      if (overlaps) offenders.push(`${node.tagName}.${node.className}`.slice(0, 80));
      if (offenders.length >= 6) break;
    }
    return { missing: false, position, offenders };
  });
  expect(result.missing, label).toBe(false);
  expect(result.position, `${label} footer position`).toBe("static");
  expect(result.offenders, label).toEqual([]);
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
