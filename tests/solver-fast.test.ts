import { describe, expect, it } from "vitest";
import {
  applyMoves,
  faceletsToString,
  matchesCenters,
  stringToFacelets,
  mulberry32,
  randomLegalState,
  randomScramble,
  solvedBytes,
} from "../src/cube/model";
import { solveBeginner } from "../src/solver/beginner";
import { normalizePlan } from "../src/solver/simplify";
import { solveCube } from "../src/solver/twoPhase";
import { validateFaceletString } from "../src/cube/validate";

const FACES = ["U", "D", "F", "B", "R", "L"] as const;

describe("two-phase solver", () => {
  it("solves every face turn, its inverse, and the half turn in one move", () => {
    expect(solveCube(faceletsToString(solvedBytes())).moves).toEqual([]);
    expect(solveCube(faceletsToString(applyMoves(solvedBytes(), ["y", "x'"]))).moves).toEqual([]);
    for (const face of FACES) {
      for (const suffix of ["", "'", "2"]) {
        const move = `${face}${suffix}`;
        const start = applyMoves(solvedBytes(), [move]);
        const solution = solveCube(faceletsToString(start));
        expect(solution.moves, move).toEqual([inverse(move)]);
        expect(matchesCenters(applyMoves(start, solution.moves))).toBe(true);
      }
    }
  });

  it("removes a no-op stretch and keeps the effect of the plan", () => {
    expect(normalizePlan(["R", "R", "R"])).toEqual(["R'"]);
    expect(normalizePlan(["R", "R", "R", "R"])).toEqual([]);
    expect(normalizePlan(["U", "U'", "R", "R"])).toEqual(["R2"]);
    const rng = mulberry32(9);
    for (let sample = 0; sample < 40; sample++) {
      const moves = randomScramble(rng, 12);
      const shortened = normalizePlan(moves);
      expect(faceletsToString(applyMoves(solvedBytes(), shortened))).toBe(faceletsToString(applyMoves(solvedBytes(), moves)));
      expect(shortened.length).toBeLessThanOrEqual(moves.length);
    }
  });

  it("solves seeded scrambles and legal cubie states, and is shorter than the beginner method", () => {
    const scrambleCount = 120;
    const legalCount = 120;
    let solved = 0;
    let beginnerLong = 0;
    let beginnerTriples = 0;
    let fastMoves = 0;
    let slowest = 0;
    solveCube(faceletsToString(applyMoves(solvedBytes(), ["R"])));
    const startedAll = performance.now();
    for (let seed = 1; seed <= scrambleCount; seed++) {
      const state = applyMoves(solvedBytes(), randomScramble(mulberry32(seed), seed % 2 === 0 ? 8 : 25));
      const started = performance.now();
      const solution = solveCube(faceletsToString(state));
      slowest = Math.max(slowest, performance.now() - started);
      expect(matchesCenters(applyMoves(state, solution.moves)), `scramble ${seed}`).toBe(true);
      expect(solution.moves.length).toBeLessThan(40);
      fastMoves += solution.moves.length;
      walkBack(state, solution.moves);
      if (seed <= 8) {
        const beginner = solveBeginner(faceletsToString(state));
        expect(matchesCenters(applyMoves(state, beginner.moves))).toBe(true);
        if (beginner.moves.length > solution.moves.length) beginnerLong += 1;
        if (beginner.moves.length > 40) beginnerLong += 0;
        beginnerTriples += countTriples(beginner.moves);
        expect(beginner.moves.length).toBeGreaterThan(solution.moves.length);
      }
      solved += 1;
    }
    for (let seed = 1; seed <= legalCount; seed++) {
      const state = randomLegalState(mulberry32(50_000 + seed));
      const started = performance.now();
      const solution = solveCube(faceletsToString(state));
      slowest = Math.max(slowest, performance.now() - started);
      expect(matchesCenters(applyMoves(state, solution.moves)), `legal ${seed}`).toBe(true);
      walkBack(state, solution.moves);
      solved += 1;
    }
    const elapsed = Math.round(performance.now() - startedAll);
    expect(solved).toBe(scrambleCount + legalCount);
    expect(beginnerLong).toBe(8);
    expect(slowest).toBeLessThan(5000);
    expect(elapsed).toBeLessThan(60_000);
    expect(beginnerTriples).toBeGreaterThanOrEqual(0);
    expect(fastMoves).toBeGreaterThan(0);
  }, 90_000);

  it("rejects illegal colourings", () => {
    expect(() => solveCube("y".repeat(54))).toThrow(/9 stickers|colour/);
    const twisted = faceletsToString(solvedBytes()).split("");
    twisted[0] = "g";
    twisted[2] = "y";
    expect(() => solveCube(twisted.join(""))).toThrow();
    const flipped = validateFaceletString(`${"y".repeat(8)}o${"o".repeat(9)}${"g".repeat(9)}${"w".repeat(9)}${"r".repeat(9)}${"b".repeat(8)}y`);
    expect(flipped.ok).toBe(false);
  });
});

function inverse(move: string): string {
  if (move.endsWith("2")) return move;
  if (move.endsWith("'")) return move[0]!;
  return `${move}'`;
}

function walkBack(start: Uint8Array, moves: string[]) {
  let cursor = faceletsToString(start);
  const seen = [cursor];
  for (const move of moves) {
    cursor = faceletsToString(applyMoves(stringToFacelets(cursor), [move]));
    seen.push(cursor);
  }
  expect(matchesCenters(stringToFacelets(cursor))).toBe(true);
  for (let index = moves.length - 1; index >= 0; index--) {
    cursor = faceletsToString(applyMoves(stringToFacelets(cursor), [inverse(moves[index]!)]));
    expect(cursor).toBe(seen[index]);
  }
}

function countTriples(moves: string[]): number {
  let count = 0;
  for (let index = 0; index < moves.length - 2; index++) {
    const move = moves[index];
    if (move && move === moves[index + 1] && move === moves[index + 2] && !move.endsWith("2")) count += 1;
  }
  return count;
}
