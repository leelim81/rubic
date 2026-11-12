import { expect, test } from "@playwright/test";

/** WCAG contrast from an `rgb()` / `rgba()` computed colour. Alpha must be opaque. */
function contrast(foreground: string, background: string): number {
  const parse = (value: string) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) throw new Error(`Not a colour: ${value}`);
    const [red, green, blue, alpha = 1] = match[1].split(",").map((part) => Number(part.trim()));
    return { red, green, blue, alpha };
  };
  const linear = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (value: string) => {
    const { red, green, blue, alpha } = parse(value);
    expect(alpha).toBe(1);
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`OS ${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("puzzle choices stay readable when the menu opens", async ({ page }) => {
      await page.goto("./");
      const select = page.getByRole("combobox", { name: "Cube size" });
      await expect(select).toBeVisible();
      const styles = await select.evaluate((node) => {
        const selectStyle = getComputedStyle(node);
        return {
          scheme: selectStyle.colorScheme,
          selectColor: selectStyle.color,
          selectBackground: selectStyle.backgroundColor,
          options: [...node.querySelectorAll("option")].map((option) => {
            const style = getComputedStyle(option);
            return { text: option.textContent ?? "", color: style.color, background: style.backgroundColor };
          }),
        };
      });

      expect(styles.scheme).toContain("dark");
      expect(styles.options.map((option) => option.text)).toEqual(["3×3", "4×4", "5×5", "Pyraminx", "Master Pyraminx", "Megaminx"]);
      // The closed pill keeps its light label and faint fill.
      const label = styles.selectColor.match(/\d+/g)?.map(Number) ?? [];
      expect(label[0]).toBeGreaterThan(200);
      expect(styles.selectBackground).toMatch(/rgba?\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.0/);
      for (const option of styles.options) {
        expect(contrast(option.color, option.background), `${option.text} ${option.color} on ${option.background}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}
