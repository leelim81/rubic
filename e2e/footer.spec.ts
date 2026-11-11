import { expect, test, type Page } from "@playwright/test";

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

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
