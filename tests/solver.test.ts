import { describe, expect, it } from "vitest";
import {
  applyMoves,
  copyBytes,
  faceletsToString,
  invertAlg,
  matchesCenters,
  mulberry32,
  randomLegalState,
  randomScramble,
  solvedBytes,
} from "../src/cube/model";
import { solveBeginner, stageGoalMet } from "../src/solver/beginner";

describe("beginner solver", () => {
  it("solves a solved cube in zero moves, including a rotated solved cube", () => {
    expect(solveBeginner(faceletsToString(solvedBytes())).moves).toEqual([]);
    expect(solveBeginner(faceletsToString(applyMoves(solvedBytes(), ["y", "x'"]))).moves).toEqual([]);
  });

  it("inserts a prepared second-layer edge with the right-hand trigger", () => {
    const pre = applyMoves(solvedBytes(), invertAlg(["U", "R", "U'", "R'", "U'", "F'", "U", "F"]));
    const solution = solveBeginner(faceletsToString(pre));
    expect(matchesCenters(applyMoves(pre, solution.moves))).toBe(true);
    expect(solution.moves.join(" ")).toContain("U R U' R'");
  });

  it("solves scrambles, random legal states, and one-move starts", () => {
    const samples: Uint8Array[] = [];
    for (let seed = 1; seed <= 16; seed++) {
      samples.push(applyMoves(solvedBytes(), randomScramble(mulberry32(seed), 20)));
      samples.push(randomLegalState(mulberry32(1000 + seed)));
    }
    samples.push(applyMoves(solvedBytes(), ["R"]));
    samples.push(applyMoves(solvedBytes(), ["F", "U", "R", "U'", "R'", "F'"]));
    samples.push(applyMoves(solvedBytes(), randomScramble(mulberry32(42), 24)));
    for (const start of samples) {
      const solution = solveBeginner(faceletsToString(start));
      expect(matchesCenters(applyMoves(start, solution.moves))).toBe(true);
      expect(solution.chunkOfMove).toHaveLength(solution.moves.length);
      for (const chunk of solution.chunks) {
        expect(chunk.moves.length).toBeGreaterThan(0);
        expect(chunk.moves.length).toBeLessThanOrEqual(8);
        expect(chunk.fingertricks).toHaveLength(chunk.moves.length);
        expect(chunk.advice.length).toBeGreaterThan(8);
        expect(chunk.why.length).toBeGreaterThan(8);
      }
    }
  });

  it("restarts cleanly from each completed stage", () => {
    const start = applyMoves(solvedBytes(), randomScramble(mulberry32(42), 22));
    const full = solveBeginner(faceletsToString(start));
    let cursor = copyBytes(start);
    const seen = new Set<string>();
    for (const chunk of full.chunks) {
      cursor = applyMoves(cursor, chunk.moves);
      if (chunk.stageId === "hold" || seen.has(chunk.stageId) || !stageGoalMet(cursor, chunk.stageId)) continue;
      seen.add(chunk.stageId);
      const again = solveBeginner(faceletsToString(cursor));
      expect(matchesCenters(applyMoves(cursor, again.moves))).toBe(true);
      if (chunk.stageId === "middle") {
        expect(again.chunks.every((item) => item.stageNumber >= 4 || item.stageId === "hold")).toBe(true);
      }
    }
  });
});
