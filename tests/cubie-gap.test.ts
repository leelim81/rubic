import { describe, expect, it } from "vitest";
import { cubieBody, cubieGapRatio, cubieStep } from "../src/view/metrics";

describe("cubie gaps", () => {
  it("keeps a thin gap of about the same fraction on 3×3, 4×4, and 5×5", () => {
    const ratios = [3, 4, 5].map((order) => cubieGapRatio(order as 3 | 4 | 5));
    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(0.05);
      expect(ratio).toBeLessThan(0.12);
    }
    const [three, four, five] = ratios;
    expect(Math.abs(four! - three!)).toBeLessThan(0.02);
    expect(Math.abs(four! - five!)).toBeLessThan(0.02);
    expect(cubieBody(4)).toBeLessThan(cubieStep(4));
    expect(cubieStep(4)).toBeGreaterThan(cubieStep(5));
  });
});