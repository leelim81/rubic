import { describe, expect, it } from "vitest";
import {
  FIVE_EDGES,
  FIVE_MOVES,
  FIVE_SLOTS,
  applyFiveString,
  fiveCentreKind,
  fiveCentersSolved,
  fiveFaceOf,
  fiveFromString,
  invertFiveMove,
  randomFiveScramble,
  solvedFiveString,
  validateFive,
} from "../src/cube/five";
import { mulberry32 } from "../src/cube/model";
import { PAINT_FACES, blankPaint, faceletIndex, isCentre } from "../src/view/paint";
import { solveFive } from "../src/solver/fiveSolve";
import { applySim, simString, solvedSim } from "./fiveSim";

const SMOKE = 8;
const T_CYCLE = Array.from({ length: 5 }, () => ["2R", "U", "2R'", "U'"]).flat();
const X_CYCLE = ["2R", "U", "2L'", "U'", "2R'", "U", "2L", "U'"];
const WING_SCRAMBLE = ["Uw", "R", "U", "R'", "Uw'"];
const PARITY = "Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2".split(" ");

function swap(text: string, a: number, b: number): string {
  const chars = [...text];
  const held = chars[a]!;
  chars[a] = chars[b]!;
  chars[b] = held;
  return chars.join("");
}

function pairedEdges(text: string): number {
  return FIVE_EDGES.filter((edge) => {
    const want = new Map(edge.mid.map((index) => [fiveFaceOf(index), text[index]]));
    if (new Set(want.values()).size !== 2) return false;
    return edge.wings.every((wing) => wing.every((index) => want.get(fiveFaceOf(index)) === text[index]));
  }).length;
}

function expectSolved(label: string, text: string) {
  const started = Date.now();
  const solution = solveFive(text);
  const ms = Date.now() - started;
  const painted = solvedSim().map((sticker, index) => ({ ...sticker, color: text[index]! }));
  expect(simString(applySim(painted, solution.moves)), label).toBe(solvedFiveString());
  return { moves: solution.moves.length, ms };
}

describe("5×5 model", () => {
  it("matches the independent simulator on every move and a scramble", () => {
    const solved = solvedFiveString();
    const stickers = solvedSim();
    for (const move of [...FIVE_MOVES, "3U", "3U'", "3U2", "3R", "3F'", "3D2", "3L", "3B'"]) {
      expect(simString(applySim(stickers, [move])), move).toBe(applyFiveString(solved, [move]));
    }
    const scramble = randomFiveScramble(mulberry32(9), 30);
    expect(simString(applySim(stickers, scramble))).toBe(applyFiveString(solved, scramble));
  });

  it("inverts every outer, wide, inner, and middle turn", () => {
    const solved = solvedFiveString();
    for (const move of [...FIVE_MOVES, "3U", "3R'", "3F2", "3D", "3L'", "3B2"]) {
      expect(applyFiveString(solved, [move, invertFiveMove(move)]), move).toBe(solved);
    }
  });

  it("round-trips a colouring through the paint sticker indexes", () => {
    const state = applyFiveString(solvedFiveString(), randomFiveScramble(mulberry32(4), 25));
    let cells = blankPaint(5);
    for (const face of PAINT_FACES) {
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          const index = faceletIndex(face, row, col, 5);
          if (isCentre(index, 5)) continue;
          cells = cells.slice(0, index) + state[index] + cells.slice(index + 1);
        }
      }
    }
    expect(cells).toBe(state);
    for (const face of PAINT_FACES) {
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          expect(cells[faceletIndex(face, row, col, 5)]).toBe(state[faceletIndex(face, row, col, 5)]);
        }
      }
    }
  });

  it("rejects wrong counts, impossible centres, and impossible pieces", () => {
    const solved = solvedFiveString();
    expect(validateFive(solved).ok).toBe(true);
    expect(validateFive(solved.slice(0, -1)).ok).toBe(false);
    const shortColour = validateFive(`w${solved.slice(1)}`);
    expect(shortColour.ok).toBe(false);
    if (!shortColour.ok) expect(shortColour.message).toMatch(/25 stickers/);

    const tSlot = [...solved].findIndex((letter, index) => letter === "y" && fiveCentreKind(index) === "t");
    const xSlot = [...solved].findIndex((letter, index) => letter === "g" && fiveCentreKind(index) === "x");
    expect(validateFive(swap(solved, tSlot, xSlot)).ok).toBe(false);

    const yellowGreen = FIVE_EDGES.find((edge) => edge.mid.map((index) => solved[index]).sort().join("") === "gy");
    const whiteBlue = FIVE_EDGES.find((edge) => edge.mid.map((index) => solved[index]).sort().join("") === "bw");
    expect(yellowGreen && whiteBlue).toBeTruthy();
    const green = yellowGreen!.mid.find((index) => solved[index] === "g")!;
    const white = whiteBlue!.mid.find((index) => solved[index] === "w")!;
    expect(validateFive(swap(solved, green, white)).ok).toBe(false);

    const corners = new Map<string, number[]>();
    for (const slot of FIVE_SLOTS) {
      const coords = [slot.grid.x, slot.grid.y, slot.grid.z];
      if (coords.filter((value) => Math.abs(value) === 2).length !== 3) continue;
      const id = coords.join(",");
      corners.set(id, [...(corners.get(id) ?? []), slot.index]);
    }
    const [first, second] = [...corners.values()];
    let transposed = solved;
    for (let index = 0; index < 3; index += 1) transposed = swap(transposed, first![index]!, second![index]!);
    expect(validateFive(transposed).ok).toBe(false);

    const legal = applyFiveString(solved, randomFiveScramble(mulberry32(11), 20));
    expect(validateFive(legal).ok).toBe(true);
  });
});

describe("5×5 reduction solver", () => {
  it("leaves a solved cube untouched", () => {
    expect(solveFive(solvedFiveString()).moves).toEqual([]);
  });

  it("solves every outer, wide, and slice turn", () => {
    const lengths: number[] = [];
    const times: number[] = [];
    for (const move of FIVE_MOVES) {
      const stats = expectSolved(move, applyFiveString(solvedFiveString(), [move]));
      lengths.push(stats.moves);
      times.push(stats.ms);
    }
    console.log(JSON.stringify({
      cases: "single-moves",
      moves: { min: Math.min(...lengths), mean: Math.round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length), max: Math.max(...lengths) },
      ms: { min: Math.min(...times), mean: Math.round(times.reduce((sum, value) => sum + value, 0) / times.length), max: Math.max(...times) },
    }));
  }, 20 * 60 * 1000);

  it("solves centre-only, wing-only, and last-edge parity positions", () => {
    const solved = solvedFiveString();
    const centres = applyFiveString(solved, [...T_CYCLE, ...X_CYCLE]);
    expect(centres).not.toBe(solved);
    expect(pairedEdges(centres)).toBe(12);
    expect(fiveCentersSolved(fiveFromString(centres))).toBe(false);
    expectSolved("centres", centres);

    const wings = applyFiveString(solved, WING_SCRAMBLE);
    expect(wings).not.toBe(solved);
    expect(fiveCentersSolved(fiveFromString(wings))).toBe(true);
    expect(pairedEdges(wings)).toBeLessThan(12);
    expectSolved("wings", wings);

    const parity = applyFiveString(solved, PARITY);
    expect(pairedEdges(parity)).toBe(11);
    expect(fiveCentersSolved(fiveFromString(parity))).toBe(true);
    expectSolved("parity", parity);
  }, 5 * 60 * 1000);

  it(`solves ${SMOKE} seeded scrambles and the simulator agrees`, () => {
    const lengths: number[] = [];
    const times: number[] = [];
    for (let seed = 1; seed <= SMOKE; seed += 1) {
      const text = applyFiveString(solvedFiveString(), randomFiveScramble(mulberry32(seed), 40));
      const stats = expectSolved(`seed ${seed}`, text);
      lengths.push(stats.moves);
      times.push(stats.ms);
    }
    lengths.sort((a, b) => a - b);
    times.sort((a, b) => a - b);
    console.log(JSON.stringify({
      solves: SMOKE,
      moves: { min: lengths[0], mean: Math.round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length), max: lengths.at(-1) },
      ms: { min: times[0], mean: Math.round(times.reduce((sum, value) => sum + value, 0) / times.length), max: times.at(-1) },
    }));
  }, 5 * 60 * 1000);
});
