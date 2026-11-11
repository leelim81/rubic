import { describe, expect, it } from "vitest";
import { applyFourString, randomFourScramble, solvedFourString, validateFour } from "../src/cube/four";
import { mulberry32 } from "../src/cube/model";
import { solveFour } from "../src/solver/fourSolve";

const OLL_PARITY = ["2R2", "B2", "U2", "2L", "U2", "2R'", "U2", "2R", "U2", "F2", "2R", "F2", "2L'", "B2", "2R2"];
const PLL_PARITY = ["2R2", "U2", "2R2", "Uw2", "2R2", "Uw2"];

function solvedBy(scramble: string[]): boolean {
  const text = applyFourString(solvedFourString(), scramble);
  const moves = solveFour(text).moves;
  return applyFourString(text, moves) === solvedFourString();
}

describe("4×4 reduction", () => {
  it("solves a solved cube, one outer turn, and one inner slice", () => {
    expect(solveFour(solvedFourString()).moves).toEqual([]);
    expect(solvedBy(["U"])).toBe(true);
    expect(solvedBy(["2R"])).toBe(true);
    expect(solvedBy(["Rw", "U", "2F'", "Rw2"])).toBe(true);
  });

  it("solves a position that needs OLL parity and one that needs PLL parity", () => {
    expect(solvedBy(OLL_PARITY)).toBe(true);
    expect(solvedBy(PLL_PARITY)).toBe(true);
  });

  it("rejects a colouring that cannot exist", () => {
    expect(validateFour("x".repeat(96)).ok).toBe(false);
    expect(validateFour(solvedFourString().slice(1)).ok).toBe(false);
    const broken = `r${solvedFourString().slice(1)}`;
    expect(validateFour(broken).ok).toBe(false);
  });

  it("solves the scramble that used to stop at nine paired edges", () => {
    expect(solvedBy(randomFourScramble(mulberry32(37), 40))).toBe(true);
  });

  it("solves a handful of random scrambles", () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      expect(solvedBy(randomFourScramble(mulberry32(seed), 25)), `seed ${seed}`).toBe(true);
    }
  });
});
