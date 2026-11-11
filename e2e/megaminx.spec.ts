import { expect, test } from "@playwright/test";
import { applyMegaString, FACE_NAMES, MEGA_COLORS, solvedMegaString, STICKERS_PER_FACE } from "../src/megaminx/model";
import { MEGA_PAINT_ORDER } from "../src/megaminx/paint";

const SOLVED = solvedMegaString();
const SCRAMBLED = applyMegaString(SOLVED, ["R", "U++"]);

test("Megaminx is in the puzzle menu and has no beginner lesson", async ({ page }, testInfo) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const menu = page.getByLabel("Cube size");
  await expect(menu.locator("option")).toHaveText(["3×3", "5×5", "Megaminx"]);
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

function titleOf(face: string): string {
  return { F: "Front", R: "Right", BR: "Back right", BL: "Back left", L: "Left", U: "Up", FR: "Front right", DR: "Down right", B: "Back", DL: "Down left", FL: "Front left", D: "Down" }[face] ?? face;
}

async function paintOne(page: Page, face: (typeof MEGA_PAINT_ORDER)[number], local: number, letter: string) {
  const button = page.getByRole("button", { name: `${titleOf(face)} sticker ${local}, blank`, exact: true });
  await button.evaluate((element) => (element as HTMLButtonElement).click());
  const index = FACE_NAMES.indexOf(face) * STICKERS_PER_FACE + local;
  await expect.poll(async () => (await page.getByTestId("paint-cells").innerText())[index], { timeout: 2_000 }).toBe(letter);
}
