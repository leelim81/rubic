/**
 * 3-cycle insertion for the pieces a block search does not finish.
 * Kept separate from the block search so the two strategies stay readable.
 */
import type { Solution, TeachingChunk } from "../solver/beginner";
import {
  MEGA_MOVE_TABLES,
  clonePieces,
  formatMegaMove,
  megaFromString,
  parseMegaMove,
  readPieces,
  solvedMegaString,
  type PieceView,
} from "./model";
import { validateMega } from "./validate";

const EDGE_CYCLE = moves("R U R' U R U-- R' U");
const CORNER_CYCLE = moves("L' U++ R U-- L U++ R' U--");
const EDGE_FLIP = conjugateMoves(moves("U L U' F"), moves("F R U R' U' F'"));
const CORNER_TWIST = conjugateMoves(moves("U R' F'"), CORNER_CYCLE);

const EDGE_CYCLE_SLOTS = new Set([0, 1, 4]);
const CORNER_CYCLE_SLOTS = new Set([0, 1, 4]);
const FLIP_SLOTS = [2, 4];
const TWIST_SLOTS = [0, 1];

interface Tracked {
  id: number;
  slot: number;
  ori: number;
}

/**
 * Staged megaminx solver. Edges are placed with a 3-cycle, then flipped in
 * pairs. Corners use an edge-safe 3-cycle, then a pure +1/−1 twist. Each
 * insertion is a shortest setup into the algorithm's slots. Optimal length
 * is not claimed.
 */
export function solveByCycles(text: string, progress?: (message: string) => void): Solution {
  const verdict = validateMega(text);
  if (!verdict.ok) throw new Error(verdict.issues[0]?.message ?? "This colouring is not a solvable megaminx.");
  if (text === solvedMegaString()) return packSolution([]);
  const view = readPieces(megaFromString(text));
  const out: number[] = [];
  progress?.("Searching");
  peelSolvedPieces(view, out);
  progress?.("Placing edges");
  placeCycles(view, out, "edge", EDGE_CYCLE, EDGE_CYCLE_SLOTS);
  progress?.("Flipping edges");
  placeFlips(view, out);
  progress?.("Placing corners");
  placeCycles(view, out, "corner", CORNER_CYCLE, CORNER_CYCLE_SLOTS);
  progress?.("Twisting corners");
  placeTwists(view, out);
  if (!isSolved(view)) throw new Error("The megaminx solver stopped before the puzzle was solved.");
  return packSolution(compress(out).map(formatMove));
}

/** Take any face-turn sequence of up to three moves that puts more pieces home. */
function peelSolvedPieces(view: PieceView, out: number[]) {
  for (let round = 0; round < 60 && !isSolved(view); round += 1) {
    const start = orientationScore(view);
    let bestGain = 0;
    let best: number[] = [];
    const walk = (depth: number, lastFace: number, path: number[]) => {
      if (depth === 3) return;
      for (let move = 0; move < 48; move += 1) {
        const face = Math.floor(move / 4);
        if (face === lastFace) continue;
        applyInPlace(view, move);
        path.push(move);
        const gain = orientationScore(view) - start;
        if (gain > bestGain || (gain === bestGain && gain > 0 && path.length < best.length)) {
          bestGain = gain;
          best = [...path];
        }
        walk(depth + 1, face, path);
        path.pop();
        applyInPlace(view, inverseMoves([move])[0]!);
      }
    };
    walk(0, -1, []);
    if (bestGain <= 0) return;
    commit(view, out, best);
  }
}

function orientationScore(view: PieceView): number {
  return solvedCount(view, "edge") + solvedCount(view, "corner");
}

function applyInPlace(view: PieceView, move: number) {
  const next = clonePieces(view);
  applyView(view, move, next);
  view.edgePiece.set(next.edgePiece);
  view.edgeOri.set(next.edgeOri);
  view.cornerPiece.set(next.cornerPiece);
  view.cornerOri.set(next.cornerOri);
}

function placeCycles(view: PieceView, out: number[], kind: "edge" | "corner", alg: number[], support: Set<number>) {
  const algs = [alg, inverseMoves(alg)];
  const count = kind === "edge" ? 30 : 20;
  for (let guard = 0; guard < count; guard += 1) {
    const cycles = permutationCycles(view, kind).filter((cycle) => cycle.length > 1).sort((a, b) => a.length - b.length);
    if (!cycles.length) return;
    const plans = cyclePlans(cycles);
    let chosen: { setup: number[]; alg: number[] } | null = null;
    for (const plan of plans) {
      const original = locate(view, plan.ids, kind);
      for (const candidate of algs) {
        const setup = searchSetup(original, kind, (path, pieces) => {
          if (!occupies(pieces, support)) return false;
          const after = applyTracked(applyTracked(pieces, candidate, kind), inverseMoves(path), kind);
          return plan.ids.every((id) => after.find((piece) => piece.id === id)?.slot === plan.targets.get(id));
        });
        if (setup) {
          chosen = { setup, alg: candidate };
          break;
        }
      }
      if (chosen) break;
    }
    if (!chosen) throw new Error(`Could not place the ${kind}s.`);
    const before = placedCount(view, kind);
    commit(view, out, [...chosen.setup, ...chosen.alg, ...inverseMoves(chosen.setup)]);
    if (placedCount(view, kind) <= before) throw new Error(`A ${kind} cycle did not place a piece.`);
  }
  if (permutationCycles(view, kind).some((cycle) => cycle.length > 1)) throw new Error(`Could not finish the ${kind}s.`);
}

function cyclePlans(cycles: number[][]): { ids: number[]; targets: Map<number, number> }[] {
  const plans: { ids: number[]; targets: Map<number, number> }[] = [];
  for (const cycle of cycles) {
    if (cycle.length >= 3) plans.push(planFromCycle(cycle));
  }
  const pairs = cycles.filter((cycle) => cycle.length === 2);
  if (pairs.length >= 2) plans.push(planFromPairs(pairs[0]!, pairs[1]!));
  return plans;
}

/** Shorten a cycle. Two pieces go home; a 3-cycle goes home entirely. */
function planFromCycle(cycle: number[]): { ids: number[]; targets: Map<number, number> } {
  const first = cycle[0]!;
  const second = cycle[1]!;
  const last = cycle[cycle.length - 1]!;
  const slotOfSecond = cycle[2 % cycle.length]!;
  const targets = new Map<number, number>([
    [first, first],
    [second, second],
    [last, slotOfSecond],
  ]);
  return { ids: [last, first, second], targets };
}

/** Break one swap in a pair of swaps. Piece b goes home. */
function planFromPairs(left: number[], right: number[]): { ids: number[]; targets: Map<number, number> } {
  const a = left[0]!;
  const b = left[1]!;
  const c = right[0]!;
  const d = right[1]!;
  const targets = new Map<number, number>([
    [b, b],
    [a, d],
    [c, a],
  ]);
  return { ids: [a, b, c], targets };
}

function placeFlips(view: PieceView, out: number[]) {
  for (let guard = 0; guard < 16; guard += 1) {
    const flipped = flippedEdges(view);
    if (!flipped.length) return;
    if (flipped.length === 1) throw new Error("A single edge is flipped, so this megaminx cannot be solved.");
    const pair = flipped.slice(0, 2);
    const setup = searchSetup(locate(view, pair, "edge"), "edge", (path, pieces) => {
      if (!inSlots(pieces, FLIP_SLOTS)) return false;
      const after = applyTracked(applyTracked(pieces, EDGE_FLIP, "edge"), inverseMoves(path), "edge");
      return after.every((piece) => piece.slot === piece.id && piece.ori === 0);
    });
    if (!setup) throw new Error("Could not flip a pair of edges.");
    commit(view, out, [...setup, ...EDGE_FLIP, ...inverseMoves(setup)]);
  }
  if (flippedEdges(view).length) throw new Error("Could not finish the edge flips.");
}

function placeTwists(view: PieceView, out: number[]) {
  for (let guard = 0; guard < 16; guard += 1) {
    const twisted = twistedCorners(view);
    if (!twisted.length) return;
    const pair = twistPair(twisted, view);
    const original = locate(view, pair, "corner");
    const beforeScore = original.filter((piece) => piece.ori !== 0).length;
    const setup = searchSetup(original, "corner", (path, pieces) => {
      if (!inSlots(pieces, TWIST_SLOTS)) return false;
      const after = applyTracked(applyTracked(pieces, CORNER_TWIST, "corner"), inverseMoves(path), "corner");
      const afterScore = after.filter((piece) => piece.slot !== piece.id || piece.ori !== 0).length;
      return after.every((piece) => piece.slot === piece.id) && afterScore < beforeScore;
    });
    if (!setup) throw new Error("Could not twist a pair of corners.");
    commit(view, out, [...setup, ...CORNER_TWIST, ...inverseMoves(setup)]);
  }
  if (twistedCorners(view).length) throw new Error("Could not finish the corner twists.");
}

function twistPair(twisted: number[], view: PieceView): number[] {
  const needPlus1 = twisted.filter((piece) => cornerOriOf(view, piece) === 2);
  const needPlus2 = twisted.filter((piece) => cornerOriOf(view, piece) === 1);
  if (needPlus1.length && needPlus2.length) return [needPlus1[0]!, needPlus2[0]!];
  if (needPlus2.length >= 2) return [needPlus2[0]!, needPlus2[1]!];
  if (needPlus1.length >= 2) return [needPlus1[0]!, needPlus1[1]!];
  return twisted.slice(0, 2);
}

function searchSetup(
  start: Tracked[],
  kind: "edge" | "corner",
  accept: (path: number[], pieces: Tracked[]) => boolean,
): number[] | null {
  const span = start.length === 2 ? 3600 : 216000;
  const seen = new Uint8Array(span);
  const parent = new Int32Array(span);
  const via = new Uint8Array(span);
  parent.fill(-1);
  const startKey = pack(start, kind);
  seen[startKey] = 1;
  parent[startKey] = -2;
  const queue = [startKey];
  const ids = start.map((piece) => piece.id);
  for (let head = 0; head < queue.length; head += 1) {
    const key = queue[head]!;
    const pieces = unpack(key, ids, kind);
    if (accept(rebuild(key, parent, via), pieces)) return rebuild(key, parent, via);
    const lastFace = parent[key]! < 0 ? -1 : Math.floor(via[key]! / 4);
    for (let move = 0; move < 48; move += 1) {
      if (Math.floor(move / 4) === lastFace) continue;
      const next = pieces.map((piece) => step(piece, move, kind));
      if (new Set(next.map((piece) => piece.slot)).size !== next.length) continue;
      const nextKey = pack(next, kind);
      if (seen[nextKey]) continue;
      seen[nextKey] = 1;
      parent[nextKey] = key;
      via[nextKey] = move;
      queue.push(nextKey);
    }
    if (queue.length > span) break;
  }
  return null;
}

function rebuild(key: number, parent: Int32Array, via: Uint8Array): number[] {
  const path: number[] = [];
  let cursor = key;
  while (parent[cursor] !== -2) {
    path.push(via[cursor]!);
    cursor = parent[cursor]!;
  }
  return path.reverse();
}

function applyTracked(pieces: Tracked[], movesToApply: number[], kind: "edge" | "corner"): Tracked[] {
  let current = pieces;
  for (const move of movesToApply) current = current.map((piece) => step(piece, move, kind));
  return current;
}

function step(piece: Tracked, move: number, kind: "edge" | "corner"): Tracked {
  const table = MEGA_MOVE_TABLES[move]!;
  if (kind === "edge") return { id: piece.id, slot: table.edgeSlot[piece.slot]!, ori: (piece.ori + table.edgeTwist[piece.slot]!) & 1 };
  return { id: piece.id, slot: table.cornerSlot[piece.slot]!, ori: (piece.ori + table.cornerTwist[piece.slot]!) % 3 };
}

function pack(pieces: Tracked[], kind: "edge" | "corner"): number {
  let key = 0;
  for (const piece of pieces) {
    const local = kind === "edge" ? piece.slot * 2 + piece.ori : piece.slot * 3 + piece.ori;
    key = key * 60 + local;
  }
  return key;
}

function unpack(key: number, ids: number[], kind: "edge" | "corner"): Tracked[] {
  const pieces: Tracked[] = [];
  let rest = key;
  const locals: number[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    locals.push(rest % 60);
    rest = Math.floor(rest / 60);
  }
  locals.reverse();
  locals.forEach((local, index) => {
    if (kind === "edge") pieces.push({ id: ids[index]!, slot: Math.floor(local / 2), ori: local % 2 });
    else pieces.push({ id: ids[index]!, slot: Math.floor(local / 3), ori: local % 3 });
  });
  return pieces;
}

function occupies(pieces: Tracked[], support: Set<number>): boolean {
  return pieces.every((piece) => support.has(piece.slot));
}

function inSlots(pieces: Tracked[], slots: number[]): boolean {
  return pieces.every((piece) => slots.includes(piece.slot));
}

function locate(view: PieceView, ids: number[], kind: "edge" | "corner"): Tracked[] {
  return ids.map((id) => {
    if (kind === "edge") {
      for (let slot = 0; slot < 30; slot += 1) if (view.edgePiece[slot] === id) return { id, slot, ori: view.edgeOri[slot]! };
    } else {
      for (let slot = 0; slot < 20; slot += 1) if (view.cornerPiece[slot] === id) return { id, slot, ori: view.cornerOri[slot]! };
    }
    throw new Error(`Missing ${kind} ${id}`);
  });
}

function permutationCycles(view: PieceView, kind: "edge" | "corner"): number[][] {
  const count = kind === "edge" ? 30 : 20;
  const slotOf = new Int16Array(count);
  for (let slot = 0; slot < count; slot += 1) slotOf[kind === "edge" ? view.edgePiece[slot]! : view.cornerPiece[slot]!] = slot;
  const seen = new Uint8Array(count);
  const cycles: number[][] = [];
  for (let start = 0; start < count; start += 1) {
    if (seen[start]) continue;
    const cycle: number[] = [];
    let piece = start;
    while (!seen[piece]) {
      seen[piece] = 1;
      cycle.push(piece);
      piece = slotOf[piece]!;
    }
    if (cycle.length > 1) cycles.push(cycle);
  }
  return cycles;
}

function flippedEdges(view: PieceView): number[] {
  const flipped: number[] = [];
  for (let slot = 0; slot < 30; slot += 1) if (view.edgePiece[slot] === slot && view.edgeOri[slot] !== 0) flipped.push(slot);
  return flipped;
}

function twistedCorners(view: PieceView): number[] {
  const twisted: number[] = [];
  for (let slot = 0; slot < 20; slot += 1) if (view.cornerPiece[slot] === slot && view.cornerOri[slot] !== 0) twisted.push(slot);
  return twisted;
}

function cornerOriOf(view: PieceView, piece: number): number {
  for (let slot = 0; slot < 20; slot += 1) if (view.cornerPiece[slot] === piece) return view.cornerOri[slot]!;
  return 0;
}

function placedCount(view: PieceView, kind: "edge" | "corner"): number {
  const count = kind === "edge" ? 30 : 20;
  let placed = 0;
  for (let slot = 0; slot < count; slot += 1) {
    const piece = kind === "edge" ? view.edgePiece[slot] : view.cornerPiece[slot];
    if (piece === slot) placed += 1;
  }
  return placed;
}

function solvedCount(view: PieceView, kind: "edge" | "corner"): number {
  const count = kind === "edge" ? 30 : 20;
  let solved = 0;
  for (let slot = 0; slot < count; slot += 1) {
    const piece = kind === "edge" ? view.edgePiece[slot] : view.cornerPiece[slot];
    const ori = kind === "edge" ? view.edgeOri[slot] : view.cornerOri[slot];
    if (piece === slot && ori === 0) solved += 1;
  }
  return solved;
}

function commit(view: PieceView, out: number[], seq: number[]) {
  let current = view;
  for (const move of seq) {
    const next = clonePieces(current);
    applyView(current, move, next);
    current.edgePiece.set(next.edgePiece);
    current.edgeOri.set(next.edgeOri);
    current.cornerPiece.set(next.cornerPiece);
    current.cornerOri.set(next.cornerOri);
    out.push(move);
  }
}

function applyView(view: PieceView, move: number, into: PieceView) {
  const table = MEGA_MOVE_TABLES[move]!;
  for (let slot = 0; slot < 30; slot += 1) {
    const dest = table.edgeSlot[slot]!;
    into.edgePiece[dest] = view.edgePiece[slot]!;
    into.edgeOri[dest] = (view.edgeOri[slot]! + table.edgeTwist[slot]!) & 1;
  }
  for (let slot = 0; slot < 20; slot += 1) {
    const dest = table.cornerSlot[slot]!;
    into.cornerPiece[dest] = view.cornerPiece[slot]!;
    into.cornerOri[dest] = (view.cornerOri[slot]! + table.cornerTwist[slot]!) % 3;
  }
}

function isSolved(view: PieceView): boolean {
  return solvedCount(view, "edge") === 30 && solvedCount(view, "corner") === 20;
}

function moves(alg: string): number[] {
  return alg.trim().split(/\s+/).filter(Boolean).map((token) => {
    const parsed = parseMegaMove(token);
    return parsed.face * 4 + parsed.steps - 1;
  });
}

function conjugateMoves(setup: number[], alg: number[]): number[] {
  return [...setup, ...alg, ...inverseMoves(setup), ...inverseMoves(alg)];
}

function inverseMoves(seq: number[]): number[] {
  return [...seq].reverse().map((move) => {
    const face = Math.floor(move / 4);
    const steps = (move % 4) + 1;
    return face * 4 + ((5 - steps) % 5) - 1;
  });
}

function compress(seq: number[]): number[] {
  const stack: { face: number; steps: number }[] = [];
  for (const move of seq) {
    const face = Math.floor(move / 4);
    const steps = (move % 4) + 1;
    const last = stack[stack.length - 1];
    if (last && last.face === face) {
      last.steps = (last.steps + steps) % 5;
      if (last.steps === 0) stack.pop();
    } else stack.push({ face, steps });
  }
  return stack.filter((item) => item.steps).map((item) => item.face * 4 + item.steps - 1);
}

function formatMove(move: number): string {
  return formatMegaMove({ face: Math.floor(move / 4), steps: ((move % 4) + 1) as 1 | 2 | 3 | 4 });
}

function packSolution(list: string[]): Solution {
  if (!list.length) return { moves: [], chunkOfMove: [], chunks: [] };
  const chunk: TeachingChunk = {
    id: "solve",
    stageId: "hold",
    stageNumber: 0,
    stageName: "Solve",
    title: "Solve",
    goal: "",
    why: "",
    caseName: "megaminx",
    hold: "",
    moves: list,
    focus: [],
    advice: "",
    tip: null,
    fingertricks: list.map(() => ""),
  };
  return { moves: list, chunkOfMove: list.map(() => 0), chunks: [chunk] };
}
