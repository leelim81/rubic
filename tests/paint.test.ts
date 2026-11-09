import { describe, expect, it } from "vitest";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";
import { projectToScreen } from "../src/view/camera";
import { PAINT_FACES, PAINT_GUIDE, facePose, faceletIndex, faceOfIndex, indexAt, isCentre, paintErrorMessage, stickerPoint } from "../src/view/paint";
import { playPaintError } from "../src/view/paintSound";

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

  it("names centre colours that match the face on screen", () => {
    expect(PAINT_GUIDE.F.turn).toBe("Hold the cube with the green centre facing you and the yellow centre on top.");
    expect(PAINT_GUIDE.R.turn).toBe("Turn the cube so the orange centre faces you. Keep the yellow centre on top.");
    expect(PAINT_GUIDE.B.turn).toBe("Turn the cube so the blue centre faces you. Keep the yellow centre on top.");
    expect(PAINT_GUIDE.L.turn).toBe("Turn the cube so the red centre faces you. Keep the yellow centre on top.");
    expect(PAINT_GUIDE.U.turn).toBe("Tilt the cube toward you so the yellow centre faces you. The green centre sits on the bottom edge.");
    expect(PAINT_GUIDE.D.turn).toBe("Tilt the cube toward you so the white centre faces you. The green centre sits on the top edge.");
    for (const face of ["F", "R", "B", "L"] as const) {
      const pose = facePose(face);
      const here = projectToScreen(stickerPoint(face, 1, 1), 400, 400, pose.theta, pose.phi);
      const yellow = projectToScreen(stickerPoint("U", 1, 1), 400, 400, pose.theta, pose.phi);
      expect(yellow.y).toBeLessThan(here.y - 8);
    }
    const up = facePose("U");
    const yellowFace = projectToScreen(stickerPoint("U", 1, 1), 400, 400, up.theta, up.phi);
    const greenBelow = projectToScreen(stickerPoint("F", 1, 1), 400, 400, up.theta, up.phi);
    expect(greenBelow.y).toBeGreaterThan(yellowFace.y + 8);
    const down = facePose("D");
    const whiteFace = projectToScreen(stickerPoint("D", 1, 1), 400, 400, down.theta, down.phi);
    const greenAbove = projectToScreen(stickerPoint("F", 1, 1), 400, 400, down.theta, down.phi);
    expect(greenAbove.y).toBeLessThan(whiteFace.y - 8);
  });

  it("explains a bad colouring in one plain sentence", () => {
    expect(paintErrorMessage([{ code: "counts" }])).toBe("Some colours don't add up — each colour needs 9 stickers. Check and try again.");
    expect(paintErrorMessage([{ code: "parity" }])).toBe("This colouring isn't possible on a real cube. Check each face again.");
    expect(paintErrorMessage([{ code: "corner-twist" }, { code: "edge-flip" }])).toContain("isn't possible");
  });
});

describe("paint error sound", () => {
  it("starts two tones and vibrates from the click", () => {
    const started: number[] = [];
    const vibrate = (pattern: number | number[]) => {
      started.push(typeof pattern === "number" ? pattern : 0);
      return true;
    };
    class Fake {
      currentTime = 0;
      destination = {};
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createOscillator() {
        return { frequency: { value: 0 }, type: "sine", connect() {}, start() { started.push(1); }, stop() {} };
      }
      createGain() {
        return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
      }
    }
    playPaintError({ AudioContext: Fake as unknown as typeof AudioContext, navigator: { vibrate } });
    expect(started.filter((value) => value === 1)).toHaveLength(2);
    expect(vibrate).toBeTruthy();
    expect(started).toContain(80);
  });
});

function SOLVED_LETTERS(): string {
  return faceletsToString(solvedBytes());
}
