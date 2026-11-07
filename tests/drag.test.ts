import { describe, expect, it } from "vitest";
import { interpretDrag } from "../src/view/drag";

describe("layer drags", () => {
  it("matches the verified turn directions", () => {
    expect(interpretDrag({ x: 0, y: 1, z: 1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 })).toBe("U");
    expect(interpretDrag({ x: 0, y: 1, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 })).toBe("U'");
    expect(interpretDrag({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 })).toBe("R");
    expect(interpretDrag({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 0, y: -1, z: 0 })).toBe("R'");
    expect(interpretDrag({ x: 0, y: -1, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 })).toBe("D");
    expect(interpretDrag({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 })).toBeNull();
  });
});
