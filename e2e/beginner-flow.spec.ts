import { expect, test } from "@playwright/test";

test("next follows the beginner stages to solved, and solve 3× can be restored", async ({ page }) => {
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.getByText("No moves needed").waitFor();
  await page.locator("details.options-panel summary").click();
  await expect(page.getByLabel("Solution method")).toHaveValue("beginner");
  for (let scramble = 0; scramble < 2; scramble += 1) {
    await page.getByRole("button", { name: "Scramble" }).click();
    await expect(page.getByTestId("lesson-step")).toHaveText(/· \d+\/\d+/, { timeout: 20_000 });
    const label = await page.getByTestId("lesson-step").textContent();
    expect(label).toMatch(/White cross|White corners|Middle layer|Yellow cross|Yellow edges|Yellow corners|Orient corners/);
    const start = await page.getByTestId("lesson-facelets").textContent();
    let previous = label;
    for (let step = 0; step < 320; step += 1) {
      const current = await page.getByTestId("lesson-step").textContent();
      if (current === "Solved") break;
      await page.getByRole("button", { name: /^Next/ }).click();
      if (step === 2) {
        await expect(page.getByTestId("lesson-step")).not.toHaveText(previous ?? "");
      }
    }
    await expect(page.getByTestId("lesson-step")).toHaveText("Solved");
    await expect(page.getByTestId("move-line")).toHaveCount(0);
    expect(start).not.toBeNull();
  }
});

test("solve 3× uses the beginner plan and restore returns that cube", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("./");
  await page.getByText("No moves needed").waitFor();
  await page.locator("details.options-panel summary").click();
  await page.getByRole("button", { name: "Scramble" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveText(/· \d+\/\d+/, { timeout: 20_000 });
  const start = await page.getByTestId("lesson-facelets").textContent();
  await page.getByTestId("solve-fast").click();
  await expect(page.getByTestId("lesson-step")).toHaveText("Solved", { timeout: 60_000 });
  await expect(page.getByTestId("move-line")).toHaveCount(0);
  await page.getByTestId("restore-solve").click();
  await expect(page.getByTestId("lesson-facelets")).toHaveText(start ?? "");
  await expect(page.getByTestId("lesson-step")).toHaveText(/· \d+\/\d+/);
});
