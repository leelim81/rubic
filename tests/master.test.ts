import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/cube/model";
import { SOLVED_PYRA, applyPyra } from "../src/pyraminx/model";
import {
  MASTER_MESH,
  SOLVED_MASTER,
  applyMaster,
  applyMasterMoves,
  masterAsPyraminx,
  randomMasterScramble,
  validateMaster,
} from "../src/pyraminx/master";
import { solveMaster } from "../src/pyraminx/masterSolve";

describe("Master Pyraminx moves", () => {
  it("turns tips, one layer, and three layers, and wide turns match a Pyraminx", () => {
    expect(applyMasterMoves(SOLVED_MASTER, ["Uw", "Uw", "Uw"])).toBe(SOLVED_MASTER);
    expect(applyMasterMoves(SOLVED_MASTER, ["U", "U'"])).toBe(SOLVED_MASTER);
    expect([...applyMaster(SOLVED_MASTER, "u")].filter((letter, index) => letter !== SOLVED_MASTER[index])).toHaveLength(3);
    const tagged = Array.from({ length: 64 }, (_, index) => String.fromCharCode(33 + index)).join("");
    expect(masterAsPyraminx(applyMaster(tagged, "Uw"))).toBe(applyPyra(masterAsPyraminx(tagged), "U"));
    expect(masterAsPyraminx(applyMasterMoves(tagged, ["Uw", "Lw'"]))).toBe(applyPyra(applyPyra(masterAsPyraminx(tagged), "U"), "L'"));
    expect(masterAsPyraminx(SOLVED_MASTER)).toBe(SOLVED_PYRA);
  });

  it("rejects a flipped midge and a swapped pair of centres", () => {
    expect(validateMaster(SOLVED_MASTER).ok).toBe(true);
    const pair = MASTER_MESH.filter((sticker) => sticker.piece === "midge-UL").map((sticker) => sticker.index);
    const swap = SOLVED_MASTER.split("");
    const hold = swap[pair[0]!]!;
    swap[pair[0]!] = swap[pair[1]!]!;
    swap[pair[1]!] = hold;
    expect(validateMaster(swap.join("")).ok).toBe(false);

    const centres = MASTER_MESH.filter((sticker) => sticker.piece.startsWith("center-"));
    const centreSwap = SOLVED_MASTER.split("");
    const first = centres[0]!.index;
    const second = centres[1]!.index;
    const colour = centreSwap[first]!;
    centreSwap[first] = centreSwap[second]!;
    centreSwap[second] = colour;
    expect(validateMaster(centreSwap.join("")).message).toMatch(/centres/);
  });
});

describe("Master Pyraminx solver", () => {
  it("solves scrambles back to the solved colouring", () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const state = applyMasterMoves(SOLVED_MASTER, randomMasterScramble(mulberry32(seed), 16));
      const solution = solveMaster(state);
      expect(applyMasterMoves(state, solution.moves)).toBe(SOLVED_MASTER);
      expect(solution.moves.length).toBeLessThan(80);
    }
    expect(solveMaster(SOLVED_MASTER).moves).toEqual([]);
  });
});
