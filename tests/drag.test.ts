import { describe, expect, it } from "vitest";
import { interpretDrag, resolveTurn } from "../src/view/drag";

describe("layer drags", () => {
  it("matches the verified turn directions", () => {
    expect(interpretDrag({ x: 0, y: 1, z: 1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 })).toBe("U");
    expect(interpretDrag({ x: 0, y: 1, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 })).toBe("U'");
    expect(interpretDrag({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 })).toBe("R");
    expect(interpretDrag({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 0, y: -1, z: 0 })).toBe("R'");
    expect(interpretDrag({ x: 0, y: -1, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 })).toBe("D");
    expect(interpretDrag({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 })).toBeNull();
    expect(interpretDrag({ x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 1, z: 0 })).toBeNull();
  });

  it("turns the whole face when the drag starts on its centre", () => {
    const up = { x: 0, y: 1, z: 0 };
    expect(resolveTurn({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, up)).toBe("F");
    expect(resolveTurn({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, up)).toBe("F'");
    expect(resolveTurn({ x: 0, y: 1, z: 1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, up)).toBe("U");
  });
});
