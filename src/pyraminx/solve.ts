import type { Solution, TeachingChunk } from "../solver/beginner";
import {
  SOLVED_PYRA,
  applyCore,
  applyPyraMoves,
  coreKey,
  readCoreOf,
  solvedCore,
  tipFixes,
  validatePyraminx,
  PYRA_MOVES,
} from "./model";

const INVERSE: Record<string, string> = {
  U: "U'",
  "U'": "U",
  L: "L'",
  "L'": "L",
  R: "R'",
  "R'": "R",
  B: "B'",
  "B'": "B",
};

/**
 * Optimal turns of the edges and centres (bidirectional breadth-first search;
 * that puzzle has 933,120 positions), then at most one turn of each tip.
 * Tips never change the rest of the puzzle, so they can wait until the end.
 */
export function solvePyraminx(facelets: string): Solution {
  const verdict = validatePyraminx(facelets);
  if (!verdict.ok || !verdict.canonical) throw new Error(verdict.message || "This colouring is not a solvable Pyraminx.");
  const start = readCoreOf(verdict.canonical);
  if (!start) throw new Error("This colouring is not a solvable Pyraminx.");
  const layers = search(start);
  const withTips = [...layers, ...tipFixes(applyPyraMoves(verdict.canonical, layers))];
  if (applyPyraMoves(verdict.canonical, withTips) !== SOLVED_PYRA) {
    throw new Error("The solver did not finish on a solved Pyraminx.");
  }
  return pack(withTips);
}

function search(start: ReturnType<typeof solvedCore>): string[] {
  const goal = solvedCore();
  const startKey = coreKey(start);
  const goalKey = coreKey(goal);
  if (startKey === goalKey) return [];

  const forward = new Map<number, { prev: number; move: string }>();
  const backward = new Map<number, { prev: number; move: string }>();
  const cores = new Map<number, ReturnType<typeof solvedCore>>();
  forward.set(startKey, { prev: -1, move: "" });
  backward.set(goalKey, { prev: -1, move: "" });
  cores.set(startKey, start);
  cores.set(goalKey, goal);
  let forwardLayer = [startKey];
  let backwardLayer = [goalKey];

  for (let guard = 0; guard < 16 && forwardLayer.length && backwardLayer.length; guard += 1) {
    const growForward = forwardLayer.length <= backwardLayer.length;
    const layer = growForward ? forwardLayer : backwardLayer;
    const mine = growForward ? forward : backward;
    const other = growForward ? backward : forward;
    const next: number[] = [];
    for (const key of layer) {
      const core = cores.get(key);
      if (!core) continue;
      const previous = mine.get(key)?.move ?? "";
      const face = previous[0] ?? "";
      for (const move of PYRA_MOVES) {
        if (face && move[0] === face) continue;
        const child = applyCore(core, growForward ? move : INVERSE[move]!);
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
  throw new Error("No Pyraminx solution was found for this colouring.");
}

/** Moves from `node` back toward the root, not including the root. */
function walk(links: Map<number, { prev: number; move: string }>, node: number): string[] {
  const moves: string[] = [];
  let cursor = node;
  while (true) {
    const info = links.get(cursor);
    if (!info || info.prev < 0) break;
    moves.push(info.move);
    cursor = info.prev;
  }
  return moves;
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
