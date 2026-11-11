import Cube from "cubejs";
import { describe, expect, it } from "vitest";
import {
  applyMoves,
  faceletsToString,
  mulberry32,
  randomLegalState,
  solvedBytes,
  stringToFacelets,
  matchesCenters,
  copyBytes,
} from "../src/cube/model";
import { faceletsFromCubie } from "../src/cube/model";
import { validateBytes } from "../src/cube/validate";
import { solveBeginner, solveBeginnerRaw, stageGoalMet, type StageId } from "../src/solver/beginner";
import { cancelCommuting, labelStages, stripWaste } from "../src/solver/optimize";
import { batchRanges } from "./batchSize";

const COLOR_TO_FACE: Record<string, string> = { y: "U", o: "R", g: "F", w: "D", r: "L", b: "B" };
const FACE_TO_COLOR: Record<string, string> = { U: "y", R: "o", F: "g", D: "w", L: "r", B: "b" };
const MOVES = ["U", "D", "R", "L", "F", "B"].flatMap((face) => [face, `${face}'`, `${face}2`]);
const ORDER: StageId[] = ["cross", "corners", "middle", "yellowCross", "yellowEdges", "yellowCorners", "orientCorners"];

function mapToCube(facelets: string): string {
  return [...facelets].map((letter) => COLOR_TO_FACE[letter] ?? "?").join("");
}

function mapFromCube(facelets: string): string {
  return [...facelets].map((letter) => FACE_TO_COLOR[letter] ?? "?").join("");
}

function agreesWithCubejs(start: Uint8Array, moves: string[]): boolean {
  const ours = faceletsToString(applyMoves(start, moves));
  const cube = Cube.fromString(mapToCube(faceletsToString(start)));
  if (moves.length) cube.move(moves.join(" "));
  return mapFromCube(cube.asString()) === ours && matchesCenters(stringToFacelets(ours));
}

function wasted(moves: string[]): string | null {
  for (let index = 1; index < moves.length; index += 1) {
    if (moves[index]?.[0] && moves[index]?.[0] === moves[index - 1]?.[0]) return `${moves[index - 1]} ${moves[index]}`;
  }
  return null;
}

function repeatedState(start: Uint8Array, moves: string[]): boolean {
  const seen = new Set<string>([faceletsToString(start)]);
  let state = start;
  for (const move of moves) {
    state = applyMoves(state, [move]);
    const key = faceletsToString(state);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function stagesHold(start: Uint8Array, solution: ReturnType<typeof solveBeginner>): boolean {
  let state = copyBytes(start);
  let seen = 0;
  for (const chunk of solution.chunks) {
    const index = ORDER.indexOf(chunk.stageId);
    if (index < seen) return false;
    seen = Math.max(seen, index);
    state = applyMoves(state, chunk.moves);
    if (!stageGoalMet(state, chunk.stageId)) return false;
    for (const earlier of ORDER.slice(0, index + 1)) {
      if (!stageGoalMet(state, earlier)) return false;
    }
  }
  return matchesCenters(state);
}

describe("beginner method", () => {
  it("cancels opposite-face detours", () => {
    expect(cancelCommuting(["U", "D", "U'"])).toEqual(["D"]);
    expect(cancelCommuting(["R", "R", "R"])).toEqual(["R'"]);
    expect(cancelCommuting(["R", "R'"])).toEqual([]);
    expect(cancelCommuting(["U", "U"])).toEqual(["U2"]);
    expect(cancelCommuting(["U2", "U"])).toEqual(["U'"]);
    expect(cancelCommuting(["R", "U", "R'"])).toEqual(["R", "U", "R'"]);
  });

  it("rejects impossible colourings without throwing past validation", () => {
    expect(() => solveBeginner("y".repeat(54))).toThrow();
    const flipped = faceletsFromCubie({
      edgePerm: [...Array(12).keys()],
      edgeOri: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      cornerPerm: [...Array(8).keys()],
      cornerOri: [0, 0, 0, 0, 0, 0, 0, 0],
    });
    const twisted = faceletsFromCubie({
      edgePerm: [...Array(12).keys()],
      edgeOri: Array(12).fill(0),
      cornerPerm: [...Array(8).keys()],
      cornerOri: [1, 0, 0, 0, 0, 0, 0, 0],
    });
    const swapped = faceletsFromCubie({
      edgePerm: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      edgeOri: Array(12).fill(0),
      cornerPerm: [...Array(8).keys()],
      cornerOri: Array(8).fill(0),
    });
    for (const bad of [flipped, twisted, swapped]) {
      expect(validateBytes(bad).ok).toBe(false);
      expect(() => solveBeginner(faceletsToString(bad))).toThrow();
    }
  });

  it("solves every one-move and two-move cube in at most two moves", () => {
    for (const move of MOVES) {
      const state = applyMoves(solvedBytes(), [move]);
      const solution = solveBeginner(faceletsToString(state));
      expect(solution.moves.length).toBeLessThanOrEqual(1);
      expect(agreesWithCubejs(state, solution.moves)).toBe(true);
    }
    for (const first of MOVES) {
      for (const second of MOVES) {
        const state = applyMoves(solvedBytes(), [first, second]);
        const solution = solveBeginner(faceletsToString(state));
        expect(solution.moves.length, `${first} ${second}`).toBeLessThanOrEqual(2);
        expect(agreesWithCubejs(state, solution.moves)).toBe(true);
        expect(wasted(solution.moves)).toBeNull();
      }
    }
  });

  it("solves the last-layer shapes the beginner method teaches", () => {
    const shapes = [
      ["F", "R", "U", "R'", "U'", "F'"],
      ["F", "U", "R", "U'", "R'", "F'"],
      ["R", "U", "R'", "U", "R", "U2", "R'"],
      ["R", "U2", "R'", "U'", "R", "U'", "R'"],
      ["U", "R", "U'", "L'", "U", "R'", "U'", "L"],
      ["R", "U", "R'", "U'", "R'", "F", "R2", "U'", "R'", "U'", "R", "U", "R'", "F'"],
      ["R'", "D'", "R", "D"],
      ["R'", "D'", "R", "D", "R'", "D'", "R", "D"],
    ];
    for (const scramble of shapes) {
      for (const setup of [[], ["U"], ["U2"], ["U'"]]) {
        const state = applyMoves(solvedBytes(), [...setup, ...scramble]);
        const solution = solveBeginner(faceletsToString(state));
        expect(agreesWithCubejs(state, solution.moves), scramble.join(" ")).toBe(true);
        expect(stagesHold(state, solution)).toBe(true);
        expect(wasted(solution.moves)).toBeNull();
        expect(repeatedState(state, solution.moves)).toBe(false);
      }
    }
  });

  for (const [from, to] of batchRanges([[1, 500], [501, 1000], [1001, 1500], [1501, 2000]] as const)) {
  it(`solves random legal cubes ${from}–${to} without wasted moves`, async () => {
    const count = to - from + 1;
    let rawTotal = 0;
    let optTotal = 0;
    let rawMax = 0;
    let optMax = 0;
    let worstSeed = from;
    const stageTotals = new Map<string, { sum: number; max: number; n: number }>();
    const started = performance.now();
    for (let seed = from; seed <= to; seed += 1) {
      if ((seed - from) % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      const state = randomLegalState(mulberry32(seed));
      const facelets = faceletsToString(state);
      const raw = solveBeginnerRaw(facelets);
      const solution = labelStages(state, stripWaste(raw.moves, state), (id, cube) => stageGoalMet(cube, id));
      rawTotal += raw.moves.length;
      optTotal += solution.moves.length;
      if (raw.moves.length > rawMax) rawMax = raw.moves.length;
      if (solution.moves.length > optMax) {
        optMax = solution.moves.length;
        worstSeed = seed;
      }
      expect(agreesWithCubejs(state, solution.moves), `seed ${seed}`).toBe(true);
      expect(wasted(solution.moves), `seed ${seed}`).toBeNull();
      expect(repeatedState(state, solution.moves), `seed ${seed}`).toBe(false);
      expect(stagesHold(state, solution), `seed ${seed}`).toBe(true);
      expect(stripWaste(solution.moves, state).join(" ")).toBe(solution.moves.join(" "));
      for (const chunk of solution.chunks) {
        const stat = stageTotals.get(chunk.stageName) ?? { sum: 0, max: 0, n: 0 };
        stat.sum += chunk.moves.length;
        stat.max = Math.max(stat.max, chunk.moves.length);
        stat.n += 1;
        stageTotals.set(chunk.stageName, stat);
      }
    }
    const elapsed = Math.round(performance.now() - started);
    const stages = [...stageTotals.entries()].map(([name, stat]) => ({
      name,
      mean: Number((stat.sum / stat.n).toFixed(2)),
      max: stat.max,
    }));
    console.log(JSON.stringify({
      count,
      rawMean: Number((rawTotal / count).toFixed(2)),
      rawMax,
      optimizedMean: Number((optTotal / count).toFixed(2)),
      optimizedMax: optMax,
      worstSeed,
      elapsedMs: elapsed,
      stages,
    }));
    expect(optTotal).toBeLessThanOrEqual(rawTotal);
  }, 300_000);
  }
});
