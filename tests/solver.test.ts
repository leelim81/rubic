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

  it("solves 40 scrambles and 40 legal states with stage invariants", () => {
    const scrambleCount = 40;
    const legalCount = 40;
    let solvedCount = 0;
    const samples: { kind: string; state: Uint8Array }[] = [];
    for (let seed = 1; seed <= scrambleCount; seed++) {
      samples.push({ kind: "scramble", state: applyMoves(solvedBytes(), randomScramble(mulberry32(seed), 20)) });
      samples.push({ kind: "legal", state: randomLegalState(mulberry32(1000 + seed)) });
    }
    samples.push({ kind: "one", state: applyMoves(solvedBytes(), ["R"]) });
    samples.push({ kind: "trigger", state: applyMoves(solvedBytes(), ["F", "U", "R", "U'", "R'", "F'"]) });
    samples.push({ kind: "long", state: applyMoves(solvedBytes(), randomScramble(mulberry32(42), 24)) });
    for (const sample of samples) {
      const started = performance.now();
      const solution = solveBeginner(faceletsToString(sample.state));
      expect(performance.now() - started).toBeLessThan(8000);
      let cursor = copyBytes(sample.state);
      for (let index = 0; index < solution.chunks.length; index++) {
        const chunk = solution.chunks[index]!;
        expect(chunk.moves.length).toBeGreaterThan(0);
        expect(chunk.moves.length).toBeLessThanOrEqual(120);
        expect(chunk.fingertricks).toHaveLength(chunk.moves.length);
        cursor = applyMoves(cursor, chunk.moves);
        const next = solution.chunks[index + 1];
        const stageDone = !next || next.stageId !== chunk.stageId;
        if (stageDone && chunk.stageId !== "hold" && chunk.stageId !== "orientCorners") {
          expect(stageGoalMet(cursor, chunk.stageId), chunk.stageId).toBe(true);
        }
        if (stageDone && (chunk.stageId === "yellowCross" || chunk.stageId === "yellowEdges" || chunk.stageId === "yellowCorners")) {
          expect(stageGoalMet(cursor, "middle"), chunk.stageId).toBe(true);
        }
      }
      expect(matchesCenters(cursor)).toBe(true);
      expect(solution.chunkOfMove).toHaveLength(solution.moves.length);
      solvedCount += 1;
    }
    expect(solvedCount).toBe(scrambleCount + legalCount + 3);
    expect(legalCount).toBe(40);
  }, 120_000);

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
