import { describe, expect, test } from "vitest";
import { applyMoves, faceletsToString, solvedBytes, stringToFacelets, randomScramble, mulberry32 } from "../src/cube/model";
import { validateFaceletString } from "../src/cube/validate";
import { solveCube } from "../src/solver/twoPhase";
import { applyFourString, randomFourScramble, solvedFourString, validateFour } from "../src/cube/four";
import { solveFour } from "../src/solver/fourSolve";
import { applyFiveString, randomFiveScramble, solvedFiveString, validateFive } from "../src/cube/five";
import { solveFive } from "../src/solver/fiveSolve";
import { applyPyraMoves, randomPyraScramble, solvedPyraString, validatePyraminx, PYRA_FACES } from "../src/pyraminx/model";
import { solvePyraminx } from "../src/pyraminx/solve";
import { applyMasterMoves, randomMasterScramble, solvedMasterString, validateMaster } from "../src/pyraminx/master";
import { solveMaster } from "../src/pyraminx/masterSolve";
import { applyMegaString, randomMegaScramble, solvedMegaString } from "../src/megaminx/model";
import { validateMega } from "../src/megaminx/validate";
import { solveMegaminx } from "../src/megaminx/solver";
import { faceletIndex } from "../src/view/paint";

/**
 * The paint screen trusts validation: finishPaint only proceeds when the
 * puzzle's validator accepts the entered colours, and then load() expects
 * the solver to produce a solution. So the invariant under test is:
 *   validate(text) ok  =>  solver(text) succeeds and its moves solve text.
 * A swapped pair of stickers (colour counts unchanged) is the sharpest
 * probe: it must either be rejected by validation or solved by the solver.
 * It must never pass validation and then fail in the solver, leaving the
 * user on the paint screen with a solver error.
 *
 * Every hand-picked swap goes through pickSwap, which takes the first
 * candidate pair whose two stickers actually differ: swapping two stickers
 * of the same colour changes nothing and would pass the test vacuously.
 */

function swapped(text: string, i: number, j: number): string {
  const cells = [...text];
  const tmp = cells[i]!;
  cells[i] = cells[j]!;
  cells[j] = tmp;
  return cells.join("");
}

function changed(text: string, i: number, letter: string): string {
  return text.slice(0, i) + letter + text.slice(i + 1);
}

function otherLetter(letter: string): string {
  return letter === "w" ? "y" : "w";
}

/** First candidate pair whose stickers differ; throws when none does. */
function pickSwap(text: string, candidates: [number, number][]): [number, number] {
  for (const [i, j] of candidates) {
    if (text[i] !== text[j]) return [i, j];
  }
  throw new Error("no effective swap among the candidate pairs");
}

function swappedPair(text: string, candidates: [number, number][]): string {
  const [i, j] = pickSwap(text, candidates);
  return swapped(text, i, j);
}

interface PuzzleCase {
  name: string;
  scrambled: string;
  solved: string;
  validate: (text: string) => boolean;
  solve: (text: string) => string[];
  apply: (text: string, moves: string[]) => string;
  /** [label, mutated string] */
  mutations: [string, string][];
  /**
   * Solver failures matching this are not counted as gaps: they are the
   * pair-swap class on the 4×4, where two wings exchange stickers in a way
   * no cheap local check can see (the wings cannot be paired). The app
   * handles them at solve time instead: load() sends the user back to the
   * paint screen with a plain message. Covered end to end by
   * e2e/paint-swap-pair.spec.ts.
   */
  toleratedSolverError?: RegExp;
}

function checkPuzzle(puzzle: PuzzleCase) {
  const rows: string[] = [];
  const gaps: string[] = [];
  // Control: the scrambled state itself must validate and solve.
  expect(puzzle.validate(puzzle.scrambled), `${puzzle.name}: scrambled state should validate`).toBe(true);
  const controlMoves = puzzle.solve(puzzle.scrambled);
  expect(puzzle.apply(puzzle.scrambled, controlMoves), `${puzzle.name}: solver must solve the scrambled state`).toBe(puzzle.solved);
  rows.push(`${puzzle.name} control: validate ok, solver ok (${controlMoves.length} moves)`);
  for (const [label, mutated] of puzzle.mutations) {
    expect(mutated, `${puzzle.name} ${label}: swap changed nothing`).not.toBe(puzzle.scrambled);
    const valid = puzzle.validate(mutated);
    if (!valid) {
      rows.push(`${puzzle.name} ${label}: rejected by validation`);
      continue;
    }
    let moves: string[] | null = null;
    let error: string | null = null;
    try {
      moves = puzzle.solve(mutated);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    if (error !== null) {
      if (puzzle.toleratedSolverError?.test(error)) {
        rows.push(`${puzzle.name} ${label}: validation ok, solver threw (tolerated, handled by UI): ${error}`);
      } else {
        gaps.push(`${puzzle.name} ${label}: validation passed but solver threw: ${error}`);
        rows.push(`${puzzle.name} ${label}: GAP validation ok, solver threw`);
      }
    } else if (puzzle.apply(mutated, moves!) !== puzzle.solved) {
      gaps.push(`${puzzle.name} ${label}: validation passed but solver moves do not solve the cube`);
      rows.push(`${puzzle.name} ${label}: GAP validation ok, solver moves do not solve`);
    } else {
      rows.push(`${puzzle.name} ${label}: validation ok, solver ok (${moves!.length} moves)`);
    }
  }
  console.log(rows.join("\n"));
  expect(gaps, gaps.join("\n")).toEqual([]);
}

const rng = mulberry32(42);

describe("validate/solve agreement under sticker swaps", () => {
  test("3x3", () => {
    const scrambled = faceletsToString(applyMoves(solvedBytes(), randomScramble(mulberry32(7), 22)));
    const idx = (face: "U" | "R" | "F" | "D" | "L" | "B", row: number, col: number) => faceletIndex(face, row, col, 3);
    const mutations: [string, string][] = [
      ["corner-corner F(0,0)<->R(0,0)", swappedPair(scrambled, [[idx("F", 0, 0), idx("R", 0, 0)], [idx("F", 0, 2), idx("R", 0, 2)]])],
      ["corner-corner U(0,0)<->B(0,2)", swappedPair(scrambled, [[idx("U", 0, 0), idx("B", 0, 2)], [idx("U", 0, 2), idx("B", 0, 0)]])],
      ["same-face corners F(0,0)<->F(0,2)", swappedPair(scrambled, [[idx("F", 0, 0), idx("F", 0, 2)], [idx("F", 2, 0), idx("F", 2, 2)]])],
      ["same-piece stickers U(0,0)<->F(0,2)", swappedPair(scrambled, [[idx("U", 0, 0), idx("F", 0, 2)], [idx("U", 2, 2), idx("F", 2, 0)]])],
      ["edge-edge F(1,0)<->R(1,2)", swappedPair(scrambled, [[idx("F", 1, 0), idx("R", 1, 2)], [idx("F", 1, 2), idx("L", 1, 0)]])],
      ["edge-edge F(0,1)<->U(2,1)", swappedPair(scrambled, [[idx("F", 0, 1), idx("U", 2, 1)], [idx("F", 2, 1), idx("D", 0, 1)]])],
      ["centres U<->F", swappedPair(scrambled, [[idx("U", 1, 1), idx("F", 1, 1)], [idx("U", 1, 1), idx("R", 1, 1)]])],
      ["one sticker wrong F(0,0)", changed(scrambled, idx("F", 0, 0), otherLetter(scrambled[idx("F", 0, 0)]!))],
      [
        "two corner swaps",
        swappedPair(swappedPair(scrambled, [[idx("F", 0, 0), idx("R", 0, 0)]]), [[idx("U", 0, 0), idx("B", 0, 2)], [idx("U", 0, 2), idx("B", 0, 0)], [idx("D", 0, 0), idx("L", 2, 2)]]),
      ],
    ];
    for (let n = 0; n < 12; n += 1) {
      const i = Math.floor(rng() * 54);
      let j = Math.floor(rng() * 54);
      if (scrambled[i] === scrambled[j]) j = (j + 1) % 54;
      if (scrambled[i] === scrambled[j]) continue;
      mutations.push([`random swap ${i}<->${j}`, swapped(scrambled, i, j)]);
    }
    checkPuzzle({
      name: "3x3",
      scrambled,
      solved: faceletsToString(solvedBytes()),
      validate: (text) => validateFaceletString(text).ok,
      solve: (text) => solveCube(text).moves,
      apply: (text, moves) => faceletsToString(applyMoves(stringToFacelets(text), moves)),
      mutations,
    });
  }, 120_000);

  test("4x4", () => {
    const scrambled = applyFourString(solvedFourString(), randomFourScramble(mulberry32(42), 40));
    const idx = (face: "U" | "R" | "F" | "D" | "L" | "B", row: number, col: number) => faceletIndex(face, row, col, 4);
    const mutations: [string, string][] = [
      ["corner-corner F(0,0)<->R(0,0)", swappedPair(scrambled, [[idx("F", 0, 0), idx("R", 0, 0)], [idx("F", 0, 3), idx("R", 0, 3)]])],
      ["corner-corner U(0,0)<->L(0,3)", swappedPair(scrambled, [[idx("U", 0, 0), idx("L", 0, 3)], [idx("U", 0, 3), idx("B", 0, 0)]])],
      ["same-face corners F(0,0)<->F(0,3)", swappedPair(scrambled, [[idx("F", 0, 0), idx("F", 0, 3)], [idx("F", 3, 0), idx("F", 3, 3)]])],
      ["same-piece stickers U(0,0)<->F(0,3)", swappedPair(scrambled, [[idx("U", 0, 0), idx("F", 0, 3)], [idx("U", 3, 3), idx("F", 3, 0)]])],
      ["wing-wing F(0,1)<->R(0,1)", swappedPair(scrambled, [[idx("F", 0, 1), idx("R", 0, 1)], [idx("F", 0, 2), idx("R", 0, 2)]])],
      ["wing-wing F(0,1)<->U(3,1)", swappedPair(scrambled, [[idx("F", 0, 1), idx("U", 3, 1)], [idx("F", 0, 2), idx("U", 3, 2)]])],
      ["centre-centre F(1,1)<->R(1,1)", swappedPair(scrambled, [[idx("F", 1, 1), idx("R", 1, 1)], [idx("F", 1, 2), idx("R", 1, 2)], [idx("F", 2, 1), idx("R", 2, 1)]])],
      ["centre-centre F(1,1)<->F(2,2)", swappedPair(scrambled, [[idx("F", 1, 1), idx("F", 2, 2)], [idx("F", 1, 2), idx("F", 2, 1)]])],
      ["one sticker wrong F(0,0)", changed(scrambled, idx("F", 0, 0), otherLetter(scrambled[idx("F", 0, 0)]!))],
      [
        "two corner swaps",
        swappedPair(swappedPair(scrambled, [[idx("F", 0, 0), idx("R", 0, 0)]]), [[idx("U", 0, 0), idx("L", 0, 3)], [idx("U", 0, 3), idx("B", 0, 0)], [idx("D", 0, 0), idx("R", 3, 3)]]),
      ],
      [
        "corner swap + wing swap",
        swappedPair(swappedPair(scrambled, [[idx("F", 0, 0), idx("R", 0, 0)]]), [[idx("F", 0, 1), idx("U", 3, 1)], [idx("F", 0, 2), idx("U", 3, 2)], [idx("R", 0, 1), idx("U", 1, 3)]]),
      ],
      [
        "centre swap + corner swap",
        swappedPair(swappedPair(scrambled, [[idx("F", 1, 1), idx("R", 1, 1)], [idx("F", 1, 2), idx("R", 1, 2)], [idx("F", 2, 1), idx("R", 2, 1)]]), [[idx("F", 0, 0), idx("R", 0, 0)], [idx("F", 0, 3), idx("R", 0, 3)]]),
      ],
      [
        "two wing swaps",
        swappedPair(swappedPair(scrambled, [[idx("F", 0, 1), idx("U", 3, 1)]]), [[idx("R", 0, 1), idx("U", 1, 3)], [idx("R", 0, 2), idx("U", 2, 3)], [idx("F", 0, 2), idx("U", 3, 2)]]),
      ],
    ];
    for (let n = 0; n < 40; n += 1) {
      const i = Math.floor(rng() * 96);
      let j = Math.floor(rng() * 96);
      if (scrambled[i] === scrambled[j]) j = (j + 1) % 96;
      if (scrambled[i] === scrambled[j]) continue;
      mutations.push([`random swap ${i}<->${j}`, swapped(scrambled, i, j)]);
    }
    checkPuzzle({
      name: "4x4",
      scrambled,
      solved: solvedFourString(),
      validate: (text) => validateFour(text).ok,
      solve: (text) => solveFour(text).moves,
      apply: (text, moves) => applyFourString(text, moves),
      toleratedSolverError: /Edges stayed unpaired/,
      mutations,
    });
  }, 300_000);

  test("4x4 validation accepts real scrambles", () => {
    // The new corner and wing checks must never reject a genuine scramble:
    // 50 seeded scrambles, validation only, no solving.
    const rng2 = mulberry32(1234);
    for (let n = 0; n < 50; n += 1) {
      const scrambled = applyFourString(solvedFourString(), randomFourScramble(rng2, 40));
      expect(validateFour(scrambled), `scramble ${n} should validate`).toEqual({ ok: true });
    }
  }, 60_000);

  test("5x5", () => {
    const scrambled = applyFiveString(solvedFiveString(), randomFiveScramble(mulberry32(42), 40));
    const idx = (face: "U" | "R" | "F" | "D" | "L" | "B", row: number, col: number) => faceletIndex(face, row, col, 5);
    const mutations: [string, string][] = [
      ["corner-corner F(0,0)<->R(0,0)", swappedPair(scrambled, [[idx("F", 0, 0), idx("R", 0, 0)], [idx("F", 0, 4), idx("R", 0, 4)]])],
      ["same-face corners F(0,0)<->F(0,4)", swappedPair(scrambled, [[idx("F", 0, 0), idx("F", 0, 4)], [idx("F", 4, 0), idx("F", 4, 4)]])],
      ["wing-wing F(0,1)<->R(0,1)", swappedPair(scrambled, [[idx("F", 0, 1), idx("R", 0, 1)], [idx("F", 0, 3), idx("R", 0, 3)]])],
      ["mid-edge F(0,2)<->U(4,2)", swappedPair(scrambled, [[idx("F", 0, 2), idx("U", 4, 2)], [idx("F", 4, 2), idx("D", 0, 2)]])],
      ["t-centre F(1,2)<->R(1,2)", swappedPair(scrambled, [[idx("F", 1, 2), idx("R", 1, 2)], [idx("F", 3, 2), idx("R", 3, 2)]])],
      ["x-centre F(1,1)<->R(1,1)", swappedPair(scrambled, [[idx("F", 1, 1), idx("R", 1, 1)], [idx("F", 3, 3), idx("R", 3, 3)], [idx("F", 1, 3), idx("R", 1, 3)], [idx("F", 3, 1), idx("R", 3, 1)]])],
      ["fixed centres F<->R", swappedPair(scrambled, [[idx("F", 2, 2), idx("R", 2, 2)], [idx("F", 2, 2), idx("U", 2, 2)]])],
      ["one sticker wrong F(0,0)", changed(scrambled, idx("F", 0, 0), otherLetter(scrambled[idx("F", 0, 0)]!))],
      [
        "two corner swaps",
        swappedPair(swappedPair(scrambled, [[idx("F", 0, 0), idx("R", 0, 0)]]), [[idx("U", 0, 0), idx("L", 0, 4)], [idx("U", 0, 4), idx("B", 0, 0)], [idx("D", 0, 0), idx("R", 4, 4)]]),
      ],
    ];
    for (let n = 0; n < 16; n += 1) {
      const i = Math.floor(rng() * 150);
      let j = Math.floor(rng() * 150);
      if (scrambled[i] === scrambled[j]) j = (j + 1) % 150;
      if (scrambled[i] === scrambled[j]) continue;
      mutations.push([`random swap ${i}<->${j}`, swapped(scrambled, i, j)]);
    }
    checkPuzzle({
      name: "5x5",
      scrambled,
      solved: solvedFiveString(),
      validate: (text) => validateFive(text).ok,
      solve: (text) => solveFive(text).moves,
      apply: (text, moves) => applyFiveString(text, moves),
      mutations,
    });
  }, 600_000);

  test("Pyraminx", () => {
    const scrambled = applyPyraMoves(solvedPyraString(), randomPyraScramble(mulberry32(11), 11));
    const faceOffset = (face: string) => PYRA_FACES.indexOf(face as (typeof PYRA_FACES)[number]) * 9;
    const idx = (face: string, local: number) => faceOffset(face) + local;
    const mutations: [string, string][] = [
      ["tip F0<->R0", swappedPair(scrambled, [[idx("F", 0), idx("R", 0)], [idx("F", 0), idx("L", 0)]])],
      ["F0<->L0", swappedPair(scrambled, [[idx("F", 0), idx("L", 0)], [idx("F", 0), idx("D", 0)]])],
      ["edge F1<->R1", swappedPair(scrambled, [[idx("F", 1), idx("R", 1)], [idx("F", 2), idx("R", 2)]])],
      ["centre F4<->R4", swappedPair(scrambled, [[idx("F", 4), idx("R", 4)], [idx("F", 4), idx("L", 4)]])],
      ["F8<->R8", swappedPair(scrambled, [[idx("F", 8), idx("R", 8)], [idx("F", 8), idx("L", 8)]])],
      ["same face F0<->F8", swappedPair(scrambled, [[idx("F", 0), idx("F", 8)], [idx("R", 0), idx("R", 8)]])],
      ["one sticker wrong F0", changed(scrambled, idx("F", 0), scrambled[idx("F", 0)] === "y" ? "g" : "y")],
      ["two swaps", swappedPair(swappedPair(scrambled, [[idx("F", 0), idx("R", 0)]]), [[idx("F", 1), idx("R", 1)], [idx("F", 2), idx("R", 2)], [idx("F", 5), idx("R", 5)]])],
    ];
    for (let n = 0; n < 12; n += 1) {
      const i = Math.floor(rng() * 36);
      let j = Math.floor(rng() * 36);
      if (scrambled[i] === scrambled[j]) j = (j + 1) % 36;
      if (scrambled[i] === scrambled[j]) continue;
      mutations.push([`random swap ${i}<->${j}`, swapped(scrambled, i, j)]);
    }
    checkPuzzle({
      name: "Pyraminx",
      scrambled,
      solved: solvedPyraString(),
      validate: (text) => validatePyraminx(text).ok,
      solve: (text) => solvePyraminx(text).moves,
      apply: (text, moves) => applyPyraMoves(text, moves),
      mutations,
    });
  }, 120_000);

  test("Master Pyraminx", () => {
    const scrambled = applyMasterMoves(solvedMasterString(), randomMasterScramble(mulberry32(13), 24));
    const idx = (face: string, local: number) => ["F", "R", "L", "D"].indexOf(face) * 16 + local;
    const mutations: [string, string][] = [
      ["tip F0<->R0", swappedPair(scrambled, [[idx("F", 0), idx("R", 0)], [idx("F", 0), idx("L", 0)]])],
      ["F1<->R1", swappedPair(scrambled, [[idx("F", 1), idx("R", 1)], [idx("F", 1), idx("L", 1)]])],
      ["F5<->R5", swappedPair(scrambled, [[idx("F", 5), idx("R", 5)], [idx("F", 5), idx("L", 5)]])],
      ["F8<->R8", swappedPair(scrambled, [[idx("F", 8), idx("R", 8)], [idx("F", 8), idx("L", 8)]])],
      ["F15<->R15", swappedPair(scrambled, [[idx("F", 15), idx("R", 15)], [idx("F", 15), idx("L", 15)]])],
      ["same face F0<->F15", swappedPair(scrambled, [[idx("F", 0), idx("F", 15)], [idx("R", 0), idx("R", 15)]])],
      ["one sticker wrong F0", changed(scrambled, idx("F", 0), scrambled[idx("F", 0)] === "y" ? "g" : "y")],
      ["two swaps", swappedPair(swappedPair(scrambled, [[idx("F", 0), idx("R", 0)]]), [[idx("F", 1), idx("R", 1)], [idx("F", 2), idx("R", 2)], [idx("F", 5), idx("R", 5)]])],
    ];
    for (let n = 0; n < 12; n += 1) {
      const i = Math.floor(rng() * 64);
      let j = Math.floor(rng() * 64);
      if (scrambled[i] === scrambled[j]) j = (j + 1) % 64;
      if (scrambled[i] === scrambled[j]) continue;
      mutations.push([`random swap ${i}<->${j}`, swapped(scrambled, i, j)]);
    }
    checkPuzzle({
      name: "Master Pyraminx",
      scrambled,
      solved: solvedMasterString(),
      validate: (text) => validateMaster(text).ok,
      solve: (text) => solveMaster(text).moves,
      apply: (text, moves) => applyMasterMoves(text, moves),
      mutations,
    });
  }, 300_000);

  test("Megaminx", () => {
    const scrambled = applyMegaString(solvedMegaString(), randomMegaScramble(mulberry32(17), 20));
    const idx = (face: number, local: number) => face * 11 + local;
    const mutations: [string, string][] = [
      ["face0/1 sticker1", swappedPair(scrambled, [[idx(0, 1), idx(1, 1)], [idx(0, 2), idx(1, 2)]])],
      ["face0/2 sticker2", swappedPair(scrambled, [[idx(0, 2), idx(2, 2)], [idx(0, 3), idx(2, 3)]])],
      ["face0/1 sticker5", swappedPair(scrambled, [[idx(0, 5), idx(1, 5)], [idx(0, 6), idx(1, 6)]])],
      ["face0/1 sticker10", swappedPair(scrambled, [[idx(0, 10), idx(1, 10)], [idx(0, 9), idx(1, 9)]])],
      ["same face 0 sticker1<->10", swappedPair(scrambled, [[idx(0, 1), idx(0, 10)], [idx(0, 2), idx(0, 9)]])],
      ["centres face0<->face1", swappedPair(scrambled, [[idx(0, 0), idx(1, 0)], [idx(0, 0), idx(2, 0)]])],
      ["one sticker wrong", changed(scrambled, idx(0, 1), scrambled[idx(0, 1)] === "w" ? "y" : "w")],
      ["two swaps", swappedPair(swappedPair(scrambled, [[idx(0, 1), idx(1, 1)]]), [[idx(0, 2), idx(2, 2)], [idx(0, 3), idx(2, 3)], [idx(1, 1), idx(2, 1)]])],
    ];
    for (let n = 0; n < 12; n += 1) {
      const i = Math.floor(rng() * 132);
      let j = Math.floor(rng() * 132);
      if (scrambled[i] === scrambled[j]) j = (j + 1) % 132;
      if (scrambled[i] === scrambled[j]) continue;
      mutations.push([`random swap ${i}<->${j}`, swapped(scrambled, i, j)]);
    }
    checkPuzzle({
      name: "Megaminx",
      scrambled,
      solved: solvedMegaString(),
      validate: (text) => validateMega(text).ok,
      solve: (text) => solveMegaminx(text).moves,
      apply: (text, moves) => applyMegaString(text, moves),
      mutations,
    });
  }, 900_000);
});
