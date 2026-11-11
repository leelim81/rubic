import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/cube/model";
import {
  PYRA_MESH,
  PYRA_MOVES,
  SOLVED_PYRA,
  applyCore,
  applyPyra,
  applyPyraMoves,
  coreKey,
  pyraFaceOf,
  randomPyraScramble,
  readCoreOf,
  scramblePyra,
  solvedCore,
  solvedPyraString,
  tipFixes,
  validatePyraminx,
} from "../src/pyraminx/model";
import { PYRAMINX_FACE_POSITIONS, PYRAMINX_GOD_NUMBER, pyraminxDistanceCensus, pyraminxExample, solvePyraminx } from "../src/pyraminx/solve";

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
    expect(faceMoves(solution.moves).length).toBeLessThanOrEqual(PYRAMINX_GOD_NUMBER);
    expect(tipFixes(SOLVED_PYRA)).toEqual([]);
  });
});

describe("Pyraminx optimality", () => {
  it("has a complete distance table and God's number 11", () => {
    const census = pyraminxDistanceCensus();
    expect(census.reachable).toBe(PYRAMINX_FACE_POSITIONS);
    expect(census.maxDistance).toBe(PYRAMINX_GOD_NUMBER);
    expect(census.histogram).toEqual([1, 8, 48, 288, 1728, 9896, 51808, 220111, 480467, 166276, 2457, 32]);
    for (let distance = 0; distance <= PYRAMINX_GOD_NUMBER; distance += 1) {
      const state = pyraminxExample(distance);
      const moves = solvePyraminx(state).moves;
      expect(applyPyraMoves(state, moves)).toBe(SOLVED_PYRA);
      expect(faceMoves(moves).length).toBe(distance);
      expect(faceMoves(moves).length).toBe(independentFaceSolution(state).length);
    }
  }, 60_000);

  it("undoes every single face turn in one move and a tip in one tip move", () => {
    for (const move of ["U", "U'", "L", "L'", "R", "R'", "B", "B'"]) {
      const state = applyPyraMoves(SOLVED_PYRA, [move]);
      const solution = solvePyraminx(state).moves;
      expect(faceMoves(solution)).toHaveLength(1);
      expect(applyPyraMoves(state, solution)).toBe(SOLVED_PYRA);
      expect(solution).toEqual(independentFaceSolution(state));
    }
    for (const move of ["u", "u'", "l", "l'", "r", "r'", "b", "b'"]) {
      const state = applyPyraMoves(SOLVED_PYRA, [move]);
      const solution = solvePyraminx(state).moves;
      expect(faceMoves(solution)).toEqual([]);
      expect(solution).toEqual([move.endsWith("'") ? move[0]! : `${move}'`]);
      expect(applyPyraMoves(state, solution)).toBe(SOLVED_PYRA);
    }
  });

  it("matches an independent breadth-first search on seeded scrambles", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = applyPyraMoves(SOLVED_PYRA, randomPyraScramble(mulberry32(seed), 4 + (seed % 8)));
      const solution = solvePyraminx(state).moves;
      expect(applyPyraMoves(state, solution)).toBe(SOLVED_PYRA);
      expect(faceMoves(solution).length).toBe(independentFaceSolution(state).length);
      expect(faceMoves(solution).length).toBeLessThanOrEqual(PYRAMINX_GOD_NUMBER);
    }
  }, 60_000);

  it("solves 300 seeded scrambles, never past God's number", () => {
    const faces: number[] = [];
    for (let seed = 1; seed <= 300; seed += 1) {
      const state = applyPyraMoves(SOLVED_PYRA, randomPyraScramble(mulberry32(10_000 + seed), 16));
      const solution = solvePyraminx(state).moves;
      expect(applyPyraMoves(state, solution)).toBe(SOLVED_PYRA);
      const face = faceMoves(solution).length;
      expect(face).toBeLessThanOrEqual(PYRAMINX_GOD_NUMBER);
      expect(solution.length - face).toBeLessThanOrEqual(4);
      faces.push(face);
    }
    expect(faces.reduce((sum, length) => sum + length, 0) / faces.length).toBeLessThan(9.5);
  });
});

const FACE_TURN = new Set<string>(PYRA_MOVES);

function faceMoves(moves: readonly string[]): string[] {
  return moves.filter((move) => FACE_TURN.has(move));
}

/** Face-turn breadth-first search that does not use the solver's distance table. */
function independentFaceSolution(facelets: string): string[] {
  const verdict = validatePyraminx(facelets);
  const start = verdict.canonical ? readCoreOf(verdict.canonical) : null;
  if (!start) throw new Error("unsolvable");
  const goal = solvedCore();
  const startKey = coreKey(start);
  const goalKey = coreKey(goal);
  if (startKey === goalKey) return [];
  const inverse: Record<string, string> = { U: "U'", "U'": "U", L: "L'", "L'": "L", R: "R'", "R'": "R", B: "B'", "B'": "B" };
  const forward = new Map<number, { prev: number; move: string }>([[startKey, { prev: -1, move: "" }]]);
  const backward = new Map<number, { prev: number; move: string }>([[goalKey, { prev: -1, move: "" }]]);
  const cores = new Map<number, ReturnType<typeof solvedCore>>([[startKey, start], [goalKey, goal]]);
  let forwardLayer = [startKey];
  let backwardLayer = [goalKey];
  const walk = (links: Map<number, { prev: number; move: string }>, node: number) => {
    const moves: string[] = [];
    let cursor = node;
    while (true) {
      const info = links.get(cursor);
      if (!info || info.prev < 0) break;
      moves.push(info.move);
      cursor = info.prev;
    }
    return moves;
  };
  for (let guard = 0; guard < 16 && forwardLayer.length && backwardLayer.length; guard += 1) {
    const growForward = forwardLayer.length <= backwardLayer.length;
    const layer = growForward ? forwardLayer : backwardLayer;
    const mine = growForward ? forward : backward;
    const other = growForward ? backward : forward;
    const next: number[] = [];
    for (const key of layer) {
      const core = cores.get(key);
      if (!core) continue;
      for (const move of PYRA_MOVES) {
        const child = applyCore(core, growForward ? move : inverse[move]!);
        const childKey = coreKey(child);
        if (mine.has(childKey)) continue;
        if (other.has(childKey)) {
          return growForward
            ? [...walk(forward, key).reverse(), move, ...walk(backward, childKey)]
            : [...walk(forward, childKey).reverse(), move, ...walk(backward, key)];
        }
        mine.set(childKey, { prev: key, move });
        cores.set(childKey, child);
        next.push(childKey);
      }
    }
    if (growForward) forwardLayer = next;
    else backwardLayer = next;
  }
  throw new Error("independent search found nothing");
}
