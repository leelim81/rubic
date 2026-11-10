import {
  FIVE_EDGES,
  FIVE_MOVES,
  FIVE_STICKERS,
  applyFive,
  applyFiveInto,
  fiveCentreKind,
  fiveCentreSlots,
  fiveFaceOf,
  fiveFromString,
  fiveDestination,
  fivePerm,
  fiveToString,
  formatFiveMove,
  invertFiveMove,
  parseFiveMove,
  solvedFiveBytes,
  type FiveEdge,
} from "../cube/five";
import { COLORS, COLOR_LETTER, FACES, HOME_CENTER, colorIndex, type Face } from "../cube/model";
import type { Solution, TeachingChunk } from "./beginner";
import { solveCube } from "./twoPhase";

export interface FiveStats {
  moves: number;
  milliseconds: number;
}

/**
 * Reduction solver: centres, then edge pairs, then the 3×3 two-phase search.
 * Move counts are not optimal. Gullicube's shorter search needs about a
 * gigabyte of memory and cross-origin isolation, which phones and GitHub
 * Pages do not reliably have, so this is the solver the site uses.
 */
export function solveFive(text: string, progress?: (message: string) => void): Solution {
  const state = fiveFromString(text);
  if (sameBytes(state, solvedFiveBytes())) return pack([]);
  progress?.("Solving centres");
  const centers = placeCenters(state);
  progress?.("Pairing edges");
  const edges = placeEdges(state);
  if (!FIVE_EDGES.every((edge) => edgePaired(state, edge))) {
    const centreOk = FACES.every((face) => fiveCentreSlots(face).every((slot) => state[slot] === colorIndex(HOME_CENTER[face])));
    throw new Error(`Edges stayed unpaired (${FIVE_EDGES.filter((edge) => edgePaired(state, edge)).length}/12, centres ${centreOk}).`);
  }
  progress?.("Fixing parity");
  const parity = repairParity(state);
  progress?.("Solving the reduced cube");
  let tail: string[] = [];
  try {
    tail = solveCube(toThree(state)).moves;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "This colouring isn't possible on a real cube.");
  }
  const moves = normalizeFive([...centers, ...edges, ...parity, ...tail]);
  if (!sameBytes(applyFive(fiveFromString(text), moves), solvedFiveBytes())) {
    const paired = FIVE_EDGES.filter((edge) => edgePaired(state, edge)).length;
    throw new Error(`Unsolved after reduction (paired ${paired}/12, centres ${FACES.every((face) => fiveCentreSlots(face).every((slot) => state[slot] === colorIndex(HOME_CENTER[face])))}).`);
  }
  return pack(moves);
}

const T_CYCLE = Array.from({ length: 5 }, () => ["2R", "U", "2R'", "U'"]).flat();
const X_CYCLE = ["2R", "U", "2L'", "U'", "2R'", "U", "2L", "U'"];
const T_FROM = 2 * 25 + 2 * 5 + 3;
const T_TO = 1 * 5 + 2;
const T_VIA = 2 * 5 + 3;
const X_FROM = 2 * 25 + 3 * 5 + 3;
const X_TO = 3 * 5 + 3;
const X_VIA = 2 * 25 + 3 * 5 + 1;

function placeCenters(state: Uint8Array): string[] {
  const moves: string[] = [];
  const solved = new Set<Face>();
  for (const face of FACES) {
    const color = colorIndex(HOME_CENTER[face]);
    for (const kind of ["t", "x"] as const) {
      for (let guard = 0; guard < 8; guard += 1) {
        const slot = fiveCentreSlots(face, kind).find((index) => state[index] !== color);
        if (slot === undefined) break;
        const donors = orbitPositions(state, color, kind).filter((index) => fiveFaceOf(index) !== face);
        const donor = donors[0];
        if (donor === undefined) throw new Error("This colouring isn't possible on a real cube.");
        if (donor === undefined) throw new Error("This colouring isn't possible on a real cube.");
        const helper = helperSlot(state, kind, solved, slot, donor);
        const path = conjugate(kind, donor, slot, helper);
        applyFiveInto(state, path);
        moves.push(...path);
        if (state[slot] !== color) throw new Error(`Could not place a ${face} centre.`);
      }
      if (fiveCentreSlots(face, kind).some((index) => state[index] !== color)) throw new Error(`Could not finish the ${face} centres.`);
    }
    solved.add(face);
  }
  return moves;
}

function helperSlot(state: Uint8Array, kind: "t" | "x", solved: Set<Face>, target: number, donor: number): number {
  const preferred = FACES.filter((face) => !solved.has(face)).flatMap((face) => fiveCentreSlots(face, kind));
  const pool = (preferred.length ? preferred : FACES.flatMap((face) => fiveCentreSlots(face, kind))).filter((index) => index !== target && index !== donor);
  const otherFace = pool.find((index) => fiveFaceOf(index) !== fiveFaceOf(target));
  if (otherFace !== undefined) return otherFace;
  const wrong = pool.find((index) => state[index] !== colorIndex(HOME_CENTER[fiveFaceOf(index)]));
  if (wrong !== undefined) return wrong;
  const helper = pool[0];
  if (helper === undefined) throw new Error("This colouring isn't possible on a real cube.");
  return helper;
}

function conjugate(kind: "t" | "x", donor: number, target: number, helper: number): string[] {
  const from = kind === "t" ? T_FROM : X_FROM;
  const to = kind === "t" ? T_TO : X_TO;
  const via = kind === "t" ? T_VIA : X_VIA;
  const base = kind === "t" ? T_CYCLE : X_CYCLE;
  const setup = placeThree(kind, [
    [donor, from],
    [target, to],
    [helper, via],
  ]);
  return [...setup, ...base, ...setup.slice().reverse().map((move) => invertFiveMove(move))];
}

const setupCache = new Map<string, string[]>();
const macroImages = new Map<string, Uint16Array>();

function imageOf(macro: string[]): Uint16Array {
  const key = macro.join(" ");
  const cached = macroImages.get(key);
  if (cached) return cached;
  const image = new Uint16Array(FIVE_STICKERS);
  for (let index = 0; index < FIVE_STICKERS; index += 1) {
    let at = index;
    for (const move of macro) at = fiveDestination(move, at);
    image[index] = at;
  }
  macroImages.set(key, image);
  return image;
}

function placeThree(kind: "t" | "x", goals: [number, number][]): string[] {
  const cacheKey = `${kind}:${goals.map(([source, dest]) => `${source}>${dest}`).join(",")}`;
  const cached = setupCache.get(cacheKey);
  if (cached) return cached;
  const stamp = (items: number[]) => items.join(",");
  const start = goals.map(([source]) => source);
  const wanted = goals.map(([, dest]) => dest).join(",");
  if (stamp(start) === wanted) {
    setupCache.set(cacheKey, []);
    return [];
  }
  const queue: number[][] = [start];
  const previous = new Map<string, { from: string; move: string }>();
  previous.set(stamp(start), { from: "", move: "" });
  const moves = FIVE_MOVES;
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = stamp(current);
    for (const move of moves) {
      const next = current.map((index) => fiveDestination(move, index));
      if (new Set(next).size !== next.length) continue;
      if (next.some((index) => fiveCentreKind(index) !== kind)) continue;
      const key = stamp(next);
      if (previous.has(key)) continue;
      previous.set(key, { from: currentKey, move });
      if (key === wanted) {
        const sequence = rewind(previous, key);
        setupCache.set(cacheKey, sequence);
        return sequence;
      }
      queue.push(next);
    }
  }
  throw new Error("This colouring isn't possible on a real cube.");
}

function searchOrbit(state: Uint8Array, face: Face, kind: "t" | "x", solved: Set<Face>): string[] {
  const color = colorIndex(HOME_CENTER[face]);
  const goal = fiveCentreSlots(face, kind);
  const start = orbitPositions(state, color, kind);
  if (start.length !== goal.length) throw new Error("This colouring isn't possible on a real cube.");
  const moves = FIVE_MOVES.filter((move) => !disturbs(move, solved, new Set()));
  const stamp = (positions: number[]) => positions.slice().sort((a, b) => a - b).join(",");
  const goalKey = stamp(goal);
  const startKey = stamp(start);
  if (startKey === goalKey) return [];
  const previous = new Map<string, { from: string; move: string }>();
  const queue = [start];
  previous.set(startKey, { from: "", move: "" });
  while (queue.length) {
    const current = queue.shift()!;
    const currentKey = stamp(current);
    for (const move of moves) {
      const next = current.map((index) => fiveDestination(move, index));
      const key = stamp(next);
      if (previous.has(key)) continue;
      previous.set(key, { from: currentKey, move });
      if (key === goalKey) return rewind(previous, key);
      queue.push(next);
    }
  }
  throw new Error(`Could not finish the ${face} centres.`);
}

function orbitPositions(state: Uint8Array, color: number, kind: "t" | "x"): number[] {
  const found: number[] = [];
  for (let index = 0; index < state.length; index += 1) {
    if (state[index] === color && fiveCentreKind(index) === kind) found.push(index);
  }
  return found;
}

function rewind(previous: Map<string, { from: string; move: string }>, key: string): string[] {
  const moves: string[] = [];
  let cursor = key;
  while (true) {
    const step = previous.get(cursor);
    if (!step || !step.move) break;
    moves.push(step.move);
    cursor = step.from;
  }
  return moves.reverse();
}

function findDonor(state: Uint8Array, color: number, kind: "t" | "x", solved: Set<Face>, locked: Set<number>, target: number): number {
  for (const face of FACES) {
    if (solved.has(face)) continue;
    for (const slot of fiveCentreSlots(face, kind)) {
      if (slot === target || locked.has(slot)) continue;
      if (state[slot] === color) return slot;
    }
  }
  return -1;
}

function bfsCenter(donor: number, target: number, solved: Set<Face>, locked: Set<number>): string[] | null {
  if (donor === target) return [];
  const moves = FIVE_MOVES.filter((move) => !disturbs(move, solved, locked));
  const queue: { index: number; path: string[] }[] = [{ index: donor, path: [] }];
  const seen = new Set<number>([donor]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const move of moves) {
      const next = destination(fivePerm(move), current.index);
      if (seen.has(next)) continue;
      const path = [...current.path, move];
      if (next === target) return path;
      seen.add(next);
      queue.push({ index: next, path });
    }
  }
  return null;
}

function disturbs(move: string, solved: Set<Face>, locked: Set<number>): boolean {
  const perm = fivePerm(move);
  for (const slot of locked) if (destination(perm, slot) !== slot) return true;
  for (const face of solved) {
    for (const slot of fiveCentreSlots(face)) {
      if (fiveFaceOf(destination(perm, slot)) !== face) return true;
    }
  }
  return false;
}

function destination(perm: Uint8Array, source: number): number {
  for (let index = 0; index < perm.length; index += 1) if (perm[index] === source) return index;
  return source;
}

const OUTER = FACES.flatMap((face) => ["", "'", "2"].map((suffix) => `${face}${suffix}`));

let cachedMacros: string[][] | null = null;

function pairingMacros(): string[][] {
  if (cachedMacros) return cachedMacros;
  const slices = FIVE_MOVES.filter((move) => {
    const parsed = parseFiveMove(move);
    return parsed.wide || parsed.depth === 2;
  });
  const seen = new Set<string>();
  const found: string[][] = [];
  const consider = (sequence: string[]) => {
    if (!centersStay(sequence)) return;
    const key = sequence.join(" ");
    const effect = effectKey(sequence);
    if (seen.has(effect)) return;
    seen.add(effect);
    if (key) found.push(sequence);
  };
  for (const move of OUTER) consider([move]);
  const extras = [
    ["Uw", "R", "U", "R'", "Uw'"],
    ["Rw", "U", "R'", "U'", "Rw'"],
    ["2R", "U", "R'", "U'", "2R'"],
    ["Rw'", "F", "R", "F'", "Rw"],
    ["Rw2", "F2", "U2", "Rw2", "U2", "F2", "Rw2"],
    ["Uw'", "R", "U", "R'", "F", "R'", "F'", "R", "Uw"],
  ];
  for (const sequence of extras) {
    consider(sequence);
    consider(sequence.slice().reverse().map((move) => invertFiveMove(move)));
  }
  for (const slice of slices) {
    const back = invertFiveMove(slice);
    for (const outer of OUTER) {
      const undo = invertFiveMove(outer);
      consider([slice, outer, back]);
      consider([outer, slice, undo]);
      consider([outer, slice, undo, back]);
    }
  }
  cachedMacros = found;
  return found;
}

function centersStay(moves: string[]): boolean {
  const next = applyFive(solvedFiveBytes(), moves);
  return FACES.every((face) => fiveCentreSlots(face).every((slot) => next[slot] === colorIndex(HOME_CENTER[face])));
}

function effectKey(moves: string[]): string {
  const ids = new Uint8Array(FIVE_STICKERS);
  for (let index = 0; index < FIVE_STICKERS; index += 1) ids[index] = index;
  applyFiveInto(ids, moves);
  return ids.join(",");
}

function placeEdges(state: Uint8Array): string[] {
  const moves: string[] = [];
  const macros = pairingMacros();
  const failed = new Set<string>();
  for (let guard = 0; guard < 40; guard += 1) {
    if (FIVE_EDGES.every((edge) => edgePaired(state, edge))) return moves;
    const job = nextEdge(state);
    if (!job) break;
    const path = bfsEdge(state, job.mid, job.wings[0], job.wings[1], pairedKeys(state), macros);
    if (!path) {
      failed.add(colorKey(state, job.mid));
      continue;
    }
    const before = FIVE_EDGES.filter((edge) => edgePaired(state, edge)).length;
    applyFiveInto(state, path);
    const after = FIVE_EDGES.filter((edge) => edgePaired(state, edge)).length;
    if (after < before) throw new Error(`Pairing path dropped ${before} to ${after}`);
    failed.clear();
    moves.push(...path);
  }
  if (!FIVE_EDGES.every((edge) => edgePaired(state, edge))) {
    const extra = flipLastEdge(state);
    if (extra) {
      applyFiveInto(state, extra);
      moves.push(...extra);
    }
  }
  if (!FIVE_EDGES.every((edge) => edgePaired(state, edge))) {
    const boosted = boostPairs(state, PARITY);
    if (boosted) {
      applyFiveInto(state, boosted);
      moves.push(...boosted);
      const extra = flipLastEdge(state);
      if (extra) {
        applyFiveInto(state, extra);
        moves.push(...extra);
      }
    }
  }
  if (!FIVE_EDGES.every((edge) => edgePaired(state, edge))) {
    const rescue = finishLastEdges(state, macros.filter((macro) => macro.length === 1 || macro.length >= 5));
    if (rescue) {
      applyFiveInto(state, rescue);
      moves.push(...rescue);
    }
  }
  return moves;
}

function flipLastEdge(state: Uint8Array): string[] | null {
  const open = FIVE_EDGES.find((edge) => !edgePaired(state, edge));
  const slot = FIVE_EDGES.find((edge) => {
    const faces = edge.mid.map((index) => fiveFaceOf(index)).sort().join("");
    return faces === "FU";
  });
  if (!open || !slot) return null;
  const setup = moveStickers(open.mid, slot.mid, OUTER);
  const alg = ["Rw2", "B2", "U2", "Lw", "U2", "Rw'", "U2", "Rw", "U2", "F2", "Rw", "F2", "Lw'", "B2", "Rw2"];
  const sequence = [...setup, ...alg, ...setup.slice().reverse().map((move) => invertFiveMove(move))];
  const next = applyFive(state, sequence);
  const centres = FACES.every((face) => fiveCentreSlots(face).every((index) => next[index] === colorIndex(HOME_CENTER[face])));
  if (centres && FIVE_EDGES.every((edge) => edgePaired(next, edge))) return sequence;
  return null;
}

function moveStickers(from: [number, number], to: [number, number], moves: string[]): string[] {
  const goal = [...to].sort((a, b) => a - b).join(",");
  const start = [...from];
  if ([...start].sort((a, b) => a - b).join(",") === goal) return [];
  const queue: number[][] = [start];
  const previous = new Map<string, { from: string; move: string }>();
  const stamp = (points: number[]) => points.join(",");
  previous.set(stamp(start), { from: "", move: "" });
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = stamp(current);
    for (const move of moves) {
      const next = current.map((index) => fiveDestination(move, index));
      const key = [...next].sort((a, b) => a - b).join(",");
      const ordered = stamp(next);
      if (previous.has(ordered)) continue;
      previous.set(ordered, { from: currentKey, move });
      if (key === goal) return rewind(previous, ordered);
      queue.push(next);
    }
  }
  return [];
}

function finishLastEdges(state: Uint8Array, macros: string[][]): string[] | null {
  const stamp = (cube: Uint8Array) => edgeState(cube);
  const startKey = stamp(state);
  const queue = [new Uint8Array(state)];
  const previous = new Map<string, { from: string; move: string[] }>();
  previous.set(startKey, { from: "", move: [] });
  let head = 0;
  while (head < queue.length && previous.size < 30000) {
    const current = queue[head++]!;
    const currentKey = stamp(current);
    for (const macro of macros) {
      const next = applyFive(current, macro);
      if (!FACES.every((face) => fiveCentreSlots(face).every((slot) => next[slot] === colorIndex(HOME_CENTER[face])))) continue;
      const key = stamp(next);
      if (previous.has(key)) continue;
      previous.set(key, { from: currentKey, move: macro });
      if (FIVE_EDGES.every((edge) => edgePaired(next, edge))) {
        const towardStart: string[][] = [];
        let cursor = key;
        while (true) {
          const step = previous.get(cursor);
          if (!step || step.move.length === 0) break;
          towardStart.push(step.move);
          cursor = step.from;
        }
        return towardStart.reverse().flat();
      }
      queue.push(new Uint8Array(next));
    }
  }
  return null;
}

function matchingWings(state: Uint8Array): number {
  let count = 0;
  for (const edge of FIVE_EDGES) {
    const want = new Map(edge.mid.map((index) => [fiveFaceOf(index), state[index]!] as const));
    for (const wing of edge.wings) if (sameFaces(state, wing, want)) count += 1;
  }
  return count;
}

function greedyWing(state: Uint8Array, macros: string[][]): string[] | null {
  const before = matchingWings(state);
  let best: string[] | null = null;
  let score = before;
  for (const macro of macros) {
    const next = applyFive(state, macro);
    const centres = FACES.every((face) => fiveCentreSlots(face).every((slot) => next[slot] === colorIndex(HOME_CENTER[face])));
    const matched = matchingWings(next);
    if (centres && matched > score) {
      score = matched;
      best = macro;
    }
  }
  return best;
}

function edgeState(state: Uint8Array): string {
  return FIVE_EDGES.map((edge) => [...edge.mid, ...edge.wings.flat()].map((index) => state[index]).join(",")).join("|");
}

function boostPairs(state: Uint8Array, algorithms: string[][]): string[] | null {
  const before = FIVE_EDGES.filter((edge) => edgePaired(state, edge)).length;
  const setups: string[][] = [[]];
  for (const first of OUTER) {
    setups.push([first]);
    for (const second of OUTER) setups.push([first, second]);
  }
  for (const setup of setups) {
    for (const alg of algorithms) {
      const sequence = [...setup, ...alg, ...setup.slice().reverse().map((move) => invertFiveMove(move))];
      const next = applyFive(state, sequence);
      const after = FIVE_EDGES.filter((edge) => edgePaired(next, edge)).length;
      const centres = FACES.every((face) => fiveCentreSlots(face).every((slot) => next[slot] === colorIndex(HOME_CENTER[face])));
      if (centres && after > before) return sequence;
    }
  }
  return null;
}

function nextEdge(state: Uint8Array): { mid: [number, number]; wings: [[number, number], [number, number]] } | null {
  for (const edge of FIVE_EDGES) {
    if (edgePaired(state, edge)) continue;
    const want = new Map(edge.mid.map((index) => [fiveFaceOf(index), state[index]!] as const));
    if (new Set(want.values()).size !== 2) continue;
    const wings: [number, number][] = [];
    for (const candidate of FIVE_EDGES) {
      for (const wing of candidate.wings) {
        const colors = wing.map((index) => state[index]!);
        if (want.get(fiveFaceOf(wing[0])) === undefined && ![...want.values()].every((color) => colors.includes(color))) continue;
        if (![...want.values()].every((color) => colors.includes(color))) continue;
        if (wings.some((item) => item[0] === wing[0] && item[1] === wing[1])) continue;
        wings.push(wing);
      }
    }
    if (wings.length < 2) return null;
    return { mid: edge.mid, wings: [wings[0]!, wings[1]!] };
  }
  return null;
}

function bfsEdge(state: Uint8Array, mid: [number, number], wingA: [number, number], wingB: [number, number], _paired: string[], macros: string[][]): string[] | null {
  const protectedGroups = FIVE_EDGES.filter((edge) => edgePaired(state, edge) && colorKey(state, edge.mid) !== colorKey(state, mid)).map((edge) => [...edge.mid, ...edge.wings.flat()]);
  const start = [...mid, ...wingA, ...wingB, ...protectedGroups.flat()];
  const keyOf = (points: number[]) => points.slice(0, 6).join(",");
  const queue: number[][] = [start];
  const previous = new Map<string, { from: string; macro: number }>();
  previous.set(keyOf(start), { from: "", macro: -1 });
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = keyOf(current);
    for (let macroIndex = 0; macroIndex < macros.length; macroIndex += 1) {
      const macro = macros[macroIndex]!;
      const image = imageOf(macro);
      let points = current.map((index) => image[index]!);
      if (new Set(points.slice(0, 6)).size !== 6) continue;
      const outer = macro.length === 1 ? parseFiveMove(macro[0]!) : null;
      const safeOuter = !!outer && !outer.wide && outer.depth === 1;
      if (!safeOuter && !protectedOk(points, protectedGroups, state)) continue;
      const loc = keyOf(points);
      if (previous.has(loc)) continue;
      previous.set(loc, { from: currentKey, macro: macroIndex });
      if (wholePoints(points.slice(0, 6), state, start.slice(0, 6))) {
        const sequence: string[][] = [];
        let cursor = loc;
        while (true) {
          const step = previous.get(cursor);
          if (!step || step.macro < 0) break;
          sequence.push(macros[step.macro]!);
          cursor = step.from;
        }
        return sequence.reverse().flat();
      }
      queue.push(points);
    }
  }
  return null;
}

function protectedOk(points: number[], groups: number[][], state: Uint8Array): boolean {
  let offset = 6;
  for (const group of groups) {
    const slice = points.slice(offset, offset + group.length);
    offset += group.length;
    const colors = group.map((index) => state[index]!);
    const mid = slice.slice(0, 2);
    const wingA = slice.slice(2, 4);
    const wingB = slice.slice(4, 6);
    const slot = (stickers: number[]) => [...stickers].sort((a, b) => a - b).join(",");
    let intact = false;
    for (const edge of FIVE_EDGES) {
      if (slot(edge.mid) !== slot(mid)) continue;
      const wings = new Set(edge.wings.map((wing) => slot([...wing])));
      if (!wings.has(slot(wingA)) || !wings.has(slot(wingB))) continue;
      const want = new Map(mid.map((index, indexOffset) => [fiveFaceOf(index), colors[indexOffset]!] as const));
      intact = [...wingA, ...wingB].every((index, indexOffset) => want.get(fiveFaceOf(index)) === colors[indexOffset + 2]);
      break;
    }
    if (!intact) return false;
  }
  return true;
}

function groupStays(state: Uint8Array, group: number[], macro: string[]): boolean {
  let at = group;
  for (const move of macro) at = at.map((index) => fiveDestination(move, index));
  const colors = group.map((index) => state[index]!);
  const mid = at.slice(0, 2);
  const wingA = at.slice(2, 4);
  const wingB = at.slice(4, 6);
  const slot = (stickers: number[]) => [...stickers].sort((a, b) => a - b).join(",");
  for (const edge of FIVE_EDGES) {
    if (slot(edge.mid) !== slot(mid)) continue;
    const wings = new Set(edge.wings.map((wing) => slot([...wing])));
    if (!wings.has(slot(wingA)) || !wings.has(slot(wingB))) continue;
    const want = new Map(mid.map((index, offset) => [fiveFaceOf(index), colors[offset]!] as const));
    return [...wingA, ...wingB].every((index, offset) => want.get(fiveFaceOf(index)) === colors[offset + 2]);
  }
  return false;
}

function recolor(original: Uint8Array, from: number[], to: number[]): Uint8Array {
  const colors = new Uint8Array(original);
  const carried = from.map((index) => original[index]!);
  for (let index = 0; index < from.length; index += 1) colors[to[index]!] = carried[index]!;
  return colors;
}

function wholePoints(points: number[], state: Uint8Array, start: number[]): boolean {
  const mid = points.slice(0, 2);
  const wingA = points.slice(2, 4);
  const wingB = points.slice(4, 6);
  const colors = start.map((index) => state[index]!);
  const at = (stickers: number[]) => [...stickers].sort((a, b) => a - b).join(",");
  for (const edge of FIVE_EDGES) {
    if (at(edge.mid) !== at(mid)) continue;
    const slots = new Set(edge.wings.map((wing) => at([...wing])));
    if (!slots.has(at(wingA)) || !slots.has(at(wingB))) continue;
    const want = new Map(mid.map((index, offset) => [fiveFaceOf(index), colors[offset]!] as const));
    return [...wingA, ...wingB].every((index, offset) => want.get(fiveFaceOf(index)) === colors[offset + 2]);
  }
  return false;
}

function wholeEdge(ids: Uint8Array, mid: [number, number], wingA: [number, number], wingB: [number, number], state: Uint8Array): boolean {
  const at = (stickers: readonly number[]) => stickers.map((source) => destinationOfId(ids, source)).sort((a, b) => a - b).join(",");
  const midAt = at(mid);
  const wingsAt = new Set([at(wingA), at(wingB)]);
  for (const edge of FIVE_EDGES) {
    if ([...edge.mid].sort((a, b) => a - b).join(",") !== midAt) continue;
    const slots = edge.wings.map((wing) => [...wing].sort((a, b) => a - b).join(","));
    if (!slots.every((slot) => wingsAt.has(slot))) continue;
    const want = new Map(mid.map((source) => [fiveFaceOf(destinationOfId(ids, source)), state[source]!] as const));
    return [...wingA, ...wingB].every((source) => want.get(fiveFaceOf(destinationOfId(ids, source))) === state[source]);
  }
  return false;
}

interface WingJob {
  stickers: [number, number];
  mid: [number, number];
}

function nextWing(state: Uint8Array, failed = new Set<string>()): WingJob | null {
  for (const edge of FIVE_EDGES) {
    if (edgePaired(state, edge) || failed.has(colorKey(state, edge.mid))) continue;
    const want = new Map(edge.mid.map((index) => [fiveFaceOf(index), state[index]!] as const));
    const colors = new Set(want.values());
    if (colors.size !== 2) continue;
    const donor = findWing(state, want, edge.mid);
    if (!donor) return null;
    return { stickers: donor, mid: edge.mid };
  }
  return null;
}

function findWing(state: Uint8Array, want: Map<Face, number>, mid: [number, number]): [number, number] | null {
  for (const edge of FIVE_EDGES) {
    if (edgePaired(state, edge)) continue;
    for (const wing of edge.wings) {
      const faces = new Map(wing.map((index) => [fiveFaceOf(index), state[index]!] as const));
      if (faces.size !== 2) continue;
      let match = true;
      for (const color of want.values()) if (![...faces.values()].includes(color)) match = false;
      if (!match) continue;
      const home = new Map(edge.mid.map((index) => [fiveFaceOf(index), state[index]!] as const));
      if (sameFaces(state, wing, home) && edge.mid[0] === mid[0] && edge.mid[1] === mid[1]) continue;
      return wing;
    }
  }
  return null;
}

function bfsWing(state: Uint8Array, stickers: [number, number], mid: [number, number], paired: string[], macros: string[][]): string[] | null {
  const startIds = identity();
  const keyOf = (ids: Uint8Array) => [...stickers, ...mid].map((source) => destinationOfId(ids, source)).join(",");
  const queue: Uint8Array[] = [startIds];
  const previous = new Map<string, { from: string; macro: number }>();
  previous.set(keyOf(startIds), { from: "", macro: -1 });
  const protectedKeys = paired.filter((key) => key !== colorKey(state, mid));
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = keyOf(current);
    for (let macroIndex = 0; macroIndex < macros.length; macroIndex += 1) {
      const macro = macros[macroIndex]!;
      const ids = new Uint8Array(current);
      applyFiveInto(ids, macro);
      const colors = paintIds(state, ids);
      if (!protectedKeys.every((key) => pairAlive(colors, key))) continue;
      const loc = keyOf(ids);
      if (previous.has(loc)) continue;
      previous.set(loc, { from: currentKey, macro: macroIndex });
      if (joined(ids, stickers, mid, state)) {
        const sequence: string[][] = [];
        let cursor = loc;
        while (true) {
          const step = previous.get(cursor);
          if (!step || step.macro < 0) break;
          sequence.push(macros[step.macro]!);
          cursor = step.from;
        }
        const flat = sequence.reverse().flat();
        const check = new Uint8Array(startIds);
        applyFiveInto(check, flat);
        if (!joined(check, stickers, mid, state)) throw new Error("Reconstructed wing path does not join");
        return flat;
      }
      queue.push(ids);
    }
  }
  return null;
}

function joinedPoints(points: number[], state: Uint8Array, origin: number[]): boolean {
  const wingAt = [points[0]!, points[1]!].sort((a, b) => a - b);
  const midAt = [points[2]!, points[3]!].sort((a, b) => a - b);
  const colors = origin.slice(0, 4).map((index) => state[index]!);
  for (const edge of FIVE_EDGES) {
    const edgeMid = [...edge.mid].sort((a, b) => a - b);
    if (edgeMid[0] !== midAt[0] || edgeMid[1] !== midAt[1]) continue;
    const slot = edge.wings.find((wing) => {
      const sorted = [...wing].sort((a, b) => a - b);
      return sorted[0] === wingAt[0] && sorted[1] === wingAt[1];
    });
    if (!slot) continue;
    const want = new Map([points[2]!, points[3]!].map((index, offset) => [fiveFaceOf(index), colors[offset + 2]!] as const));
    return [points[0]!, points[1]!].every((index, offset) => want.get(fiveFaceOf(index)) === colors[offset]);
  }
  return false;
}

function joined(ids: Uint8Array, wing: [number, number], mid: [number, number], state: Uint8Array): boolean {
  const wingAt = [...wing.map((source) => destinationOfId(ids, source))].sort((a, b) => a - b);
  const midAt = [...mid.map((source) => destinationOfId(ids, source))].sort((a, b) => a - b);
  for (const edge of FIVE_EDGES) {
    const edgeMid = [...edge.mid].sort((a, b) => a - b);
    if (edgeMid[0] !== midAt[0] || edgeMid[1] !== midAt[1]) continue;
    const slot = edge.wings.find((item) => {
      const sorted = [...item].sort((a, b) => a - b);
      return sorted[0] === wingAt[0] && sorted[1] === wingAt[1];
    });
    if (!slot) continue;
    const want = new Map(mid.map((source) => [fiveFaceOf(destinationOfId(ids, source)), state[source]!] as const));
    return wing.every((source) => want.get(fiveFaceOf(destinationOfId(ids, source))) === state[source]);
  }
  return false;
}

function orientedKey(ids: Uint8Array, stickers: [number, number], state: Uint8Array): string {
  return stickers.map((source) => `${destinationOfId(ids, source)}:${state[source]}`).sort().join(",");
}

function oriented(ids: Uint8Array, stickers: [number, number], goal: [number, number], state: Uint8Array, want: Map<Face, number>): boolean {
  for (const source of stickers) {
    const at = destinationOfId(ids, source);
    if (at !== goal[0] && at !== goal[1]) return false;
    if (want.get(fiveFaceOf(at)) !== state[source]) return false;
  }
  return true;
}

function identity(): Uint8Array {
  const ids = new Uint8Array(FIVE_STICKERS);
  for (let index = 0; index < FIVE_STICKERS; index += 1) ids[index] = index;
  return ids;
}

function where(ids: Uint8Array, stickers: [number, number]): string {
  const at = stickers.map((source) => destinationOfId(ids, source)).sort((a, b) => a - b);
  return at.join(",");
}

function destinationOfId(ids: Uint8Array, source: number): number {
  for (let index = 0; index < ids.length; index += 1) if (ids[index] === source) return index;
  return -1;
}

function arrived(ids: Uint8Array, stickers: [number, number], goal: [number, number]): boolean {
  const at = new Set(stickers.map((source) => destinationOfId(ids, source)));
  return at.has(goal[0]) && at.has(goal[1]);
}

function paintIds(original: Uint8Array, ids: Uint8Array): Uint8Array {
  const colors = new Uint8Array(FIVE_STICKERS);
  for (let index = 0; index < FIVE_STICKERS; index += 1) colors[index] = original[ids[index]!]!;
  return colors;
}

function pairedKeys(state: Uint8Array): string[] {
  return FIVE_EDGES.filter((edge) => edgePaired(state, edge)).map((edge) => colorKey(state, edge.mid));
}

function pairAlive(state: Uint8Array, key: string): boolean {
  return FIVE_EDGES.some((edge) => colorKey(state, edge.mid) === key && edgePaired(state, edge));
}

function edgePaired(state: Uint8Array, edge: FiveEdge): boolean {
  const want = new Map(edge.mid.map((index) => [fiveFaceOf(index), state[index]!] as const));
  if (new Set(want.values()).size !== 2) return false;
  return edge.wings.every((wing) => sameFaces(state, wing, want));
}

function sameFaces(state: Uint8Array, stickers: readonly number[], want: Map<Face, number>): boolean {
  for (const index of stickers) if (want.get(fiveFaceOf(index)) !== state[index]) return false;
  return true;
}

function colorKey(state: Uint8Array, stickers: readonly number[]): string {
  return stickers.map((index) => state[index]!).sort((a, b) => a - b).join("-");
}

const PARITY = [
  ["Rw", "U2", "Rw", "U2", "F2", "Rw", "F2", "Lw'", "U2", "Lw", "U2", "Rw'", "U2", "Rw", "U2", "Rw'", "U2", "Rw'"],
  ["Rw2", "F2", "U2", "Rw2", "U2", "F2", "Rw2"],
  ["Rw2", "B2", "U2", "Lw", "U2", "Rw'", "U2", "Rw", "U2", "F2", "Rw", "F2", "Lw'", "B2", "Rw2"],
];

function repairParity(state: Uint8Array): string[] {
  if (reducedSolved(state, [])) return [];
  for (const algorithm of PARITY) {
    const moves = algorithm.map((move) => move.replace(/^Rw/, "Rw").replace(/^Lw/, "Lw"));
    const parsed = moves.map((move) => move.replace("Rw", "Rw"));
    if (reducedSolved(state, parsed)) {
      applyFiveInto(state, parsed);
      return parsed;
    }
  }
  return [];
}

function reducedSolved(state: Uint8Array, extra: string[]): boolean {
  try {
    const moved = extra.length ? applyFive(state, extra) : state;
    if (!FIVE_EDGES.every((edge) => edgePaired(moved, edge))) return false;
    const tail = solveCube(toThree(moved)).moves;
    return sameBytes(applyFive(moved, tail), solvedFiveBytes());
  } catch {
    return false;
  }
}

function toThree(state: Uint8Array): string {
  let text = "";
  for (const face of FACES) {
    const offset = FACES.indexOf(face) * 25;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        text += COLOR_LETTER[COLORS[state[offset + row * 2 * 5 + col * 2]!]!] ?? "?";
      }
    }
  }
  return text;
}

interface LayerTurn {
  axis: "x" | "y" | "z";
  quarters: number[];
}

function normalizeFive(moves: string[]): string[] {
  const merged: LayerTurn[] = [];
  for (const move of moves) {
    const turn = asLayers(move);
    const last = merged[merged.length - 1];
    if (last && last.axis === turn.axis) {
      for (let index = 0; index < 5; index += 1) last.quarters[index] = (last.quarters[index]! + turn.quarters[index]!) % 4;
      if (last.quarters.every((quarter) => quarter === 0)) merged.pop();
    } else merged.push(turn);
  }
  return merged.flatMap(emitLayers);
}

function asLayers(move: string): LayerTurn {
  const parsed = parseFiveMove(move);
  const axis = parsed.face === "R" || parsed.face === "L" ? "x" : parsed.face === "U" || parsed.face === "D" ? "y" : "z";
  const negative = parsed.face === "D" || parsed.face === "L" || parsed.face === "B";
  const signed = negative ? (4 - parsed.quarters) % 4 : parsed.quarters;
  const coords = parsed.wide ? [2, 1] : [parsed.depth === 1 ? 2 : 1];
  const quarters = [0, 0, 0, 0, 0];
  const sign = negative ? -1 : 1;
  for (const coord of coords) quarters[sign * coord + 2] = signed;
  return { axis, quarters };
}

function emitLayers(turn: LayerTurn): string[] {
  const faces: Face[] = turn.axis === "y" ? ["U", "D"] : turn.axis === "x" ? ["R", "L"] : ["F", "B"];
  const moves: string[] = [];
  for (const face of faces) {
    const negative = face === "D" || face === "L" || face === "B";
    const sign = negative ? -1 : 1;
    const outer = turn.quarters[sign * 2 + 2] ?? 0;
    const inner = turn.quarters[sign * 1 + 2] ?? 0;
    const outerClock = negative ? (4 - outer) % 4 : outer;
    const innerClock = negative ? (4 - inner) % 4 : inner;
    const push = (depth: 1 | 2, wide: boolean, quarters: number) => {
      if (!quarters) return;
      moves.push(formatFiveMove({ face, depth, wide, quarters: quarters as 1 | 2 | 3 }));
    };
    if (outerClock && outerClock === innerClock) push(1, true, outerClock);
    else {
      push(1, false, outerClock);
      push(2, false, innerClock);
    }
  }
  return moves;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
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
    caseName: "reduction",
    hold: "",
    moves,
    focus: [],
    advice: "",
    tip: null,
    fingertricks: moves.map(() => ""),
  };
  return { moves, chunkOfMove: moves.map(() => 0), chunks: [chunk] };
}

export function fiveFaceletsSolved(text: string): boolean {
  return fiveToString(solvedFiveBytes()) === text;
}

void [
  searchOrbit,
  findDonor,
  bfsCenter,
  finishLastEdges,
  greedyWing,
  boostPairs,
  groupStays,
  recolor,
  wholeEdge,
  nextWing,
  bfsWing,
  joinedPoints,
  orientedKey,
  oriented,
  where,
  arrived,
];
