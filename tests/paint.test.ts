import { describe, expect, it } from "vitest";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
import { faceletIndex, faceOfIndex, facePose, indexAt, isCentre, PAINT_FACES, stickerPoint } from "../src/view/paint";

describe("paint mapping", () => {
  it("maps every sticker on every paint face to the solver index", () => {
    for (const face of PAINT_FACES) {
      const pose = facePose(face);
      expect(pose.phi).toBeGreaterThan(0.25);
      expect(pose.phi).toBeLessThan(2.6);
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const index = faceletIndex(face, row, col);
          expect(faceOfIndex(index)).toBe(face);
          expect(isCentre(index)).toBe(row === 1 && col === 1);
          const point = stickerPoint(face, row, col);
          const normal = { F: { x: 0, y: 0, z: 1 }, R: { x: 1, y: 0, z: 0 }, B: { x: 0, y: 0, z: -1 }, L: { x: -1, y: 0, z: 0 }, U: { x: 0, y: 1, z: 0 }, D: { x: 0, y: -1, z: 0 } }[face];
          const cubie = { x: point.x - normal.x * 0.475, y: point.y - normal.y * 0.475, z: point.z - normal.z * 0.475 };
          expect(indexAt(cubie, normal)).toBe(index);
        }
      }
    }
  });

  it("round-trips a scramble onto facelet letters, including up and down", () => {
    const target = faceletsToString(applyMoves(solvedBytes(), ["R", "U", "F'", "D2", "L", "B'"]));
    const painted = [...SOLVED_LETTERS()];
    for (const face of PAINT_FACES) {
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const index = faceletIndex(face, row, col);
          if (isCentre(index)) {
            expect(painted[index]).toBe(target[index]);
            continue;
          }
          painted[index] = target[index]!;
        }
      }
    }
    expect(painted.join("")).toBe(target);
  });
});

function SOLVED_LETTERS(): string {
  return faceletsToString(solvedBytes());
}
