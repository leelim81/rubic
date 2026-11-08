import Cube from "cubejs";
import {
  applyMoves,
  centersAreHome,
  faceletsToString,
  matchesCenters,
  rotationToHome,
  searchMoves,
  stringToFacelets,
} from "../cube/model";
import { validateBytes } from "../cube/validate";
import type { Solution, TeachingChunk } from "./beginner";
import { normalizePlan } from "./simplify";

/**
 * Solutions come from cubejs 1.3.2, an MIT implementation of Kociemba's
 * two-phase algorithm. Its face turns were checked against this cube's move
 * model for all 18 face turns. The search is not a claim of a shortest path.
 *
 * The beginner method also solved the cube, but it taught each trigger as
 * separate steps, so three quarter turns of one face were left uncombined.
 * Those are the same as one shorter turn. This plan is the two-phase result
 * with adjacent turns merged and any no-op stretch removed.
 */

const COLOR_TO_FACE: Record<string, string> = { y: "U", o: "R", g: "F", w: "D", r: "L", b: "B" };

let solverReady = false;

export function solveCube(facelets: string): Solution {
  const initial = stringToFacelets(facelets);
  const verdict = validateBytes(initial, { searchRotations: false });
  if (!verdict.ok) throw new Error(verdict.issues[0]?.message ?? "This colouring is not a solvable 3×3.");
  if (matchesCenters(initial)) return pack([]);
  const short = searchMoves(initial, matchesCenters, { maxDepth: 2 });
  if (short) return pack(normalizePlan(short));
  ensureSolver();
  const setup = centersAreHome(initial) ? [] : rotationToHome(initial);
  const home = setup.length ? applyMoves(initial, setup) : initial;
  const cube = Cube.fromString([...faceletsToString(home)].map((letter) => COLOR_TO_FACE[letter] ?? "?").join(""));
  const raw = cube.solve() ?? "";
  const faceTurns = raw.split(/\s+/).filter((move) => /^[UDFBLR][2']?$/.test(move));
  const moves = normalizePlan([...setup, ...faceTurns]);
  if (!matchesCenters(applyMoves(initial, moves))) throw new Error("The solver did not finish on a solved cube.");
  return pack(moves);
}

function ensureSolver() {
  if (solverReady) return;
  Cube.initSolver();
  solverReady = true;
}

function pack(moves: string[]): Solution {
  if (!moves.length) return { moves: [], chunkOfMove: [], chunks: [] };
  const chunk: TeachingChunk = {
    id: "solve",
    stageId: "hold",
    stageNumber: 0,
    stageName: "Solve",
    title: "Solve",
    goal: "",
    why: "",
    caseName: "two-phase",
    hold: "",
    moves,
    focus: [],
    advice: "",
    tip: null,
    fingertricks: moves.map(() => ""),
  };
  return { moves, chunkOfMove: moves.map(() => 0), chunks: [chunk] };
}
