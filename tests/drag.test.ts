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
    expect(resolveTurn({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, up).move).toBe("F");
    expect(resolveTurn({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, up).move).toBe("F'");
    expect(resolveTurn({ x: 0, y: 1, z: 1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, up).move).toBe("U");
  });

  it("turns the right face when a finger on that face drags up", () => {
    const up = { x: 0, y: 1, z: 0 };
    const forward = { x: 0, y: 0, z: -1 };
    const drag = { x: 0, y: 1, z: 0 };
    expect(resolveTurn({ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, drag, up, forward).move).toBe("R");
    expect(resolveTurn({ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, drag, up, forward).move).toBe("R");
    expect(resolveTurn({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, drag, up, forward).move).toBe("R");
  });
});
