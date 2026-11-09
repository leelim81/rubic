import { describe, expect, it } from "vitest";
import { COLORS } from "../src/cube/model";
import { LABEL_INK, STICKER_HEX, contrastRatio } from "../src/view/contrast";

describe("sticker letter contrast", () => {
  it("keeps every letter at least 4.5:1 against its sticker", () => {
    for (const color of COLORS) {
      const ratio = contrastRatio(STICKER_HEX[color], LABEL_INK[color]);
      expect(ratio, color).toBeGreaterThanOrEqual(4.5);
    }
  });
});
