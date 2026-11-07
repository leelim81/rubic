import { describe, expect, it } from "vitest";
import type { Face } from "../src/cube/model";
import { propagateCentreNames, type CalibratedSticker } from "../src/scan/calibrate";
import { CANONICAL_RGB, rgbToLab } from "../src/scan/color";

function sticker(name: CalibratedSticker["name"], touched = false): CalibratedSticker {
  return {
    lab: rgbToLab(...CANONICAL_RGB[name]),
    name,
    uncertain: false,
    confirmed: true,
    touched,
  };
}

describe("centre calibration", () => {
  it("renames untouched stickers when their nearest centre is renamed, and leaves touched stickers", () => {
    const green = Array.from({ length: 9 }, () => sticker("green"));
    green[0] = sticker("red", true);
    const faces = { U: null, R: null, F: green, D: null, L: null, B: null } as Record<Face, CalibratedSticker[] | null>;
    faces.F![4] = { ...sticker("green"), name: "yellow", touched: true };
    const next = propagateCentreNames(faces);
    expect(next.F![4]!.name).toBe("yellow");
    expect(next.F![0]!.name).toBe("red");
    expect(next.F![1]!.name).toBe("yellow");
    expect(next.F![8]!.name).toBe("yellow");
    expect(next.F![1]!.touched).toBe(false);
  });
});
