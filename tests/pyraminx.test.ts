import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/cube/model";
import {
  PYRA_MESH,
  SOLVED_PYRA,
  applyPyra,
  applyPyraMoves,
  pyraFaceOf,
  randomPyraScramble,
  scramblePyra,
  solvedPyraString,
  tipFixes,
  validatePyraminx,
} from "../src/pyraminx/model";
import { solvePyraminx } from "../src/pyraminx/solve";

describe("Pyraminx moves", () => {
  it("turns a vertex by a third, and the tip alone leaves the centres alone", () => {
    expect(applyPyraMoves(SOLVED_PYRA, ["U", "U", "U"])).toBe(SOLVED_PYRA);
    expect(applyPyraMoves(SOLVED_PYRA, ["U", "U'"])).toBe(SOLVED_PYRA);
    expect(applyPyraMoves(SOLVED_PYRA, ["u", "u", "u"])).toBe(SOLVED_PYRA);
    expect(applyPyra(SOLVED_PYRA, "U")).not.toBe(SOLVED_PYRA);
    const tipOnly = applyPyra(SOLVED_PYRA, "u");
    const layer = applyPyra(SOLVED_PYRA, "U");
    expect(tipOnly).not.toBe(layer);
    expect([...tipOnly].filter((letter, index) => letter !== SOLVED_PYRA[index])).toHaveLength(3);
    expect([...layer].filter((letter, index) => letter !== SOLVED_PYRA[index]).length).toBeGreaterThan(3);
  });

  it("sends the front up tip clockwise onto the left face", () => {
    const moved = applyPyra(SOLVED_PYRA, "U");
    const frontTip = 0;
    const leftTip = PYRA_MESH.find((sticker) => sticker.face === "L" && sticker.piece === "tip-U")!.index;
    expect(SOLVED_PYRA[frontTip]).toBe("g");
    expect(moved[leftTip]).toBe("g");
    expect(pyraFaceOf(leftTip)).toBe("L");
  });

  it("rejects a bad count, a flipped edge, and a swapped pair", () => {
    expect(validatePyraminx("g".repeat(36)).ok).toBe(false);
    expect(validatePyraminx(SOLVED_PYRA).ok).toBe(true);

    const flipped = SOLVED_PYRA.split("");
    const ul = PYRA_MESH.filter((sticker) => sticker.piece === "edge-UL").map((sticker) => sticker.index);
    const tmp = flipped[ul[0]!]!;
    flipped[ul[0]!] = flipped[ul[1]!]!;
    flipped[ul[1]!] = tmp;
    const flip = validatePyraminx(flipped.join(""));
    expect(flip.ok).toBe(false);
    expect(flip.message).toMatch(/flipped/);

    const swapped = SOLVED_PYRA.split("");
    const ur = PYRA_MESH.filter((sticker) => sticker.piece === "edge-UR").map((sticker) => sticker.index);
    for (let n = 0; n < 2; n += 1) {
      const hold = swapped[ul[n]!]!;
      swapped[ul[n]!] = swapped[ur[n]!]!;
      swapped[ur[n]!] = hold;
    }
    const swap = validatePyraminx(swapped.join(""));
    expect(swap.ok).toBe(false);
    expect(swap.message).toMatch(/swapped/);
  });
});

describe("Pyraminx solver", () => {
  it("needs nothing for a solved pyraminx, including one held with another face in front", () => {
    expect(solvePyraminx(SOLVED_PYRA).moves).toEqual([]);
    const turned = SOLVED_PYRA.split("");
    for (let i = 0; i < 9; i += 1) {
      turned[i] = "r";
      turned[9 + i] = "g";
    }
    const verdict = validatePyraminx(turned.join(""));
    expect(verdict.ok).toBe(true);
    expect(solvePyraminx(turned.join("")).moves).toEqual([]);
  });

  it("solves scrambles, including tips, back to the colouring they started from", () => {
    for (let seed = 1; seed <= 24; seed += 1) {
      const state = applyPyraMoves(SOLVED_PYRA, randomPyraScramble(mulberry32(seed), 8 + (seed % 5)));
      const solution = solvePyraminx(state);
      expect(applyPyraMoves(state, solution.moves)).toBe(solvedPyraString());
      expect(solution.moves.length).toBeLessThanOrEqual(15);
      const again = scramblePyra(seed + 100);
      expect(applyPyraMoves(again, solvePyraminx(again).moves)).toBe(solvedPyraString());
    }
  });

  it("undoes a short known sequence", () => {
    const state = applyPyraMoves(SOLVED_PYRA, ["U", "L'", "R", "B'", "u"]);
    const solution = solvePyraminx(state);
    expect(applyPyraMoves(state, solution.moves)).toBe(SOLVED_PYRA);
    expect(solution.moves.filter((move) => move[0] === move[0]?.toLowerCase()).length).toBeLessThanOrEqual(4);
    expect(tipFixes(SOLVED_PYRA)).toEqual([]);
  });
});
