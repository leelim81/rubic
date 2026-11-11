import type { Solution, TeachingChunk } from "../solver/beginner";
import {
  SOLVED_PYRA,
  PYRA_MOVES,
  applyCore,
  applyPyraMoves,
  coreFromKey,
  coreKey,
  readCoreOf,
  solvedCore,
  tipFixes,
  validatePyraminx,
} from "./model";

/**
 * Face-turn metric on edges and centres. Tips are excluded: there are
 * 933,120 reachable positions and every one is at most 11 face turns away.
 */
export const PYRAMINX_FACE_POSITIONS = 933_120;
export const PYRAMINX_GOD_NUMBER = 11;
const FACE_SPACE = 81 * 64 * 720;

const INVERSE_INDEX = [1, 0, 3, 2, 5, 4, 7, 6];

let distanceTable: Uint8Array | null = null;
let towardSolved: Uint8Array | null = null;
let censusCache: { reachable: number; maxDistance: number; histogram: number[] } | null = null;
const exampleKey: number[] = [];

function buildTables(): void {
  if (distanceTable && towardSolved) return;
  const distance = new Uint8Array(FACE_SPACE);
  distance.fill(255);
  const toward = new Uint8Array(FACE_SPACE);
  const solvedKey = coreKey(solvedCore());
  if (coreKey(coreFromKey(solvedKey)) !== solvedKey) throw new Error("Pyraminx state packing does not round-trip.");
  distance[solvedKey] = 0;
  const queue = new Int32Array(PYRAMINX_FACE_POSITIONS);
  queue[0] = solvedKey;
  const histogram = Array(16).fill(0);
  histogram[0] = 1;
  exampleKey[0] = solvedKey;
  let reachable = 1;
  let maxDistance = 0;
  let tail = 1;
  for (let head = 0; head < tail; head += 1) {
    const key = queue[head]!;
    const dist = distance[key]!;
    const core = coreFromKey(key);
    for (let index = 0; index < PYRA_MOVES.length; index += 1) {
      const childKey = coreKey(applyCore(core, PYRA_MOVES[index]!));
      if (distance[childKey] !== 255) continue;
      const next = dist + 1;
      distance[childKey] = next;
      toward[childKey] = INVERSE_INDEX[index]!;
      histogram[next] += 1;
      if (exampleKey[next] === undefined) exampleKey[next] = childKey;
      if (next > maxDistance) maxDistance = next;
      queue[tail] = childKey;
      tail += 1;
      reachable += 1;
    }
  }
  if (reachable !== PYRAMINX_FACE_POSITIONS || maxDistance !== PYRAMINX_GOD_NUMBER) {
    throw new Error(`Pyraminx distance table covered ${reachable} positions, diameter ${maxDistance}.`);
  }
  distanceTable = distance;
  towardSolved = toward;
  censusCache = { reachable, maxDistance, histogram: histogram.slice(0, maxDistance + 1) };
}

function tables(): { distance: Uint8Array; toward: Uint8Array } {
  buildTables();
  return { distance: distanceTable!, toward: towardSolved! };
}

/** Every reachable face-turn distance, counted from the breadth-first table. */
export function pyraminxDistanceCensus(): { reachable: number; maxDistance: number; histogram: number[] } {
  buildTables();
  return censusCache!;
}

/** A solved-colouring scramble whose shortest face solution has this length. */
export function pyraminxExample(distance: number): string {
  const { distance: distances, toward } = tables();
  const key = exampleKey[distance];
  if (key === undefined || distances[key] !== distance) throw new Error(`No Pyraminx position at distance ${distance}.`);
  const towardSolvedMoves: string[] = [];
  let cursor = key;
  let core = coreFromKey(key);
  while (distances[cursor] !== 0) {
    const move = PYRA_MOVES[toward[cursor]!]!;
    towardSolvedMoves.push(move);
    core = applyCore(core, move);
    cursor = coreKey(core);
  }
  const scramble = towardSolvedMoves.reverse().map((move) => (move.endsWith("'") ? move[0]! : `${move}'`));
  return applyPyraMoves(SOLVED_PYRA, scramble);
}

export function pyraminxKeyDistance(key: number): number {
  const { distance } = tables();
  return distance[key] ?? 255;
}

/**
 * Optimal face-turn solutions for this colouring, up to `limit` of them.
 * Tips are left out; each list has the minimum possible length.
 */
export function listOptimalFaceMoves(facelets: string, limit: number): string[][] {
  const verdict = validatePyraminx(facelets);
  if (!verdict.ok || !verdict.canonical) throw new Error(verdict.message || "This colouring is not a solvable Pyraminx.");
  const start = readCoreOf(verdict.canonical);
  if (!start) throw new Error("This colouring is not a solvable Pyraminx.");
  const { distance } = tables();
  const found: string[][] = [];
  const path: string[] = [];
  const walk = (core: ReturnType<typeof solvedCore>) => {
    if (found.length >= limit) return;
    const dist = distance[coreKey(core)]!;
    if (dist === 255) throw new Error("This colouring is not a solvable Pyraminx.");
    if (dist === 0) {
      found.push(path.slice());
      return;
    }
    for (const move of PYRA_MOVES) {
      const next = applyCore(core, move);
      if (distance[coreKey(next)] !== dist - 1) continue;
      path.push(move);
      walk(next);
      path.pop();
      if (found.length >= limit) return;
    }
  };
  walk(start);
  if (!found.length) throw new Error("No Pyraminx solution was found for this colouring.");
  return found;
}

/**
 * Fewest face turns of the edges and centres, then at most one turn of each
 * tip. The face-turn length is optimal; among those, the tip count is the
 * smallest seen in a sample of optimal face solutions.
 */
export function solvePyraminx(facelets: string): Solution {
  const verdict = validatePyraminx(facelets);
  if (!verdict.ok || !verdict.canonical) throw new Error(verdict.message || "This colouring is not a solvable Pyraminx.");
  const faces = listOptimalFaceMoves(facelets, 32);
  let chosen = faces[0]!;
  let tipCount = Infinity;
  for (const face of faces) {
    const tips = tipFixes(applyPyraMoves(verdict.canonical, face));
    if (tips.length < tipCount) {
      tipCount = tips.length;
      chosen = [...face, ...tips];
    }
  }
  if (applyPyraMoves(verdict.canonical, chosen) !== SOLVED_PYRA) {
    throw new Error("The solver did not finish on a solved Pyraminx.");
  }
  return pack(chosen);
}

function pack(moves: string[]): Solution {
  if (!moves.length) return { moves: [], chunkOfMove: [], chunks: [] };
  const chunk: TeachingChunk = {
    id: "pyraminx",
    stageId: "hold",
    stageNumber: 0,
    stageName: "Solve",
    title: "Solve",
    goal: "",
    why: "",
    caseName: "pyraminx",
    hold: "",
    moves,
    focus: [],
    advice: "",
    tip: null,
    fingertricks: moves.map(() => ""),
  };
  return { moves, chunkOfMove: moves.map(() => 0), chunks: [chunk] };
}
