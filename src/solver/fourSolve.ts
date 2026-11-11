import {
  FOUR_CENTRES,
  FOUR_EDGES,
  FOUR_MOVES,
  FOUR_STICKERS,
  applyFour,
  applyFourInto,
  fourCentreSlots,
  fourFromString,
  fourOffset,
  fourPerm,
  solvedFourBytes,
  type FourEdge,
} from "../cube/four";
import { COLOR_LETTER, COLORS, FACES, HOME_CENTER, colorIndex, stringToFacelets, type Face } from "../cube/model";
import type { Solution, TeachingChunk } from "./beginner";
import { solveCube } from "./twoPhase";
import { validateBytes } from "../cube/validate";

/**
 * 4×4 reduction. Centres are placed face by face, edges are paired with
 * centre-preserving sequences, OLL and PLL parity are fixed with the usual
 * slice algorithms, then the cube is solved as a 3×3. Move counts are not optimal.
 */
export function solveFour(text: string, progress?: (message: string) => void): Solution {
  const state = fourFromString(text);
  if (same(state, solvedFourBytes())) return pack([]);
  progress?.("Solving centres");
  const centers = solveCentres(state);
  progress?.("Pairing edges");
  const edges = pairEdges(state);
  progress?.("Fixing parity");
  const parity = fixParity(state);
  progress?.("Solving the reduced cube");
  const tail = solveCube(toThree(state)).moves;
  const moves = [...centers, ...edges, ...parity, ...tail];
  if (!same(applyFour(fourFromString(text), moves), solvedFourBytes())) {
    throw new Error("The 4×4 reduction did not finish on a solved cube.");
  }
  return pack(moves);
}

const CENTER_INDEX = new Map(FOUR_CENTRES.map((slot, index) => [slot, index]));
const CENTER_MOVE: Record<string, Uint8Array> = {};
for (const move of FOUR_MOVES) {
  const perm = fourPerm(move);
  const map = new Uint8Array(24);
  for (let index = 0; index < 24; index += 1) map[index] = CENTER_INDEX.get(perm[FOUR_CENTRES[index]!]!)!;
  CENTER_MOVE[move] = map;
}

function readCentres(state: Uint8Array): Uint8Array {
  const colors = new Uint8Array(24);
  for (let index = 0; index < 24; index += 1) colors[index] = state[FOUR_CENTRES[index]!]!;
  return colors;
}

function turnCentres(colors: Uint8Array, move: string): Uint8Array {
  const map = CENTER_MOVE[move]!;
  const next = new Uint8Array(24);
  for (let index = 0; index < 24; index += 1) next[index] = colors[map[index]!]!;
  return next;
}

function keeps(move: string, faces: readonly Face[]): boolean {
  if (!faces.length) return true;
  const perm = fourPerm(move);
  return faces.every((face) => {
    const slots = fourCentreSlots(face);
    const set = new Set(slots);
    return slots.every((slot) => set.has(perm[slot]!));
  });
}

export function solveCentres(state: Uint8Array): string[] {
  const colors = readCentres(state);
  const moves: string[] = [];
  const preserved: Face[] = [];
  for (const face of ["U", "D", "F", "B", "R", "L"] as const) {
    if (preserved.includes(face)) continue;
    const color = colorIndex(HOME_CENTER[face]);
    const slots = fourCentreSlots(face);
    let found = bfsColour(colors, color, slots, preserved);
    let solvedFaces: Face[] = [face];
    if (!found) {
      solvedFaces = face === "R" ? ["R", "L"] : [face];
      found = searchFaces(state, solvedFaces, preserved);
    }
    if (!found) throw new Error(`The ${face} centres could not be solved.`);
    const faceMoves: string[] = [];
    for (const move of found) {
      for (const part of move.split(" ")) {
        colors.set(turnCentres(colors, part));
        faceMoves.push(part);
      }
    }
    applyFourInto(state, faceMoves);
    moves.push(...faceMoves);
    for (const doneFace of solvedFaces) preserved.push(doneFace);
  }
  return moves;
}

function macroSearch(state: Uint8Array, goals: readonly Face[]): string[] | null {
  const turns = ["R", "R'", "R2", "L", "L'", "L2"];
  const slices = ["2U2", "2D2", "2F2", "2B2"];
  const macros: string[][] = turns.map((turn) => [turn]);
  for (const slice of slices) {
    for (const turn of turns) macros.push([slice, turn, slice]);
    for (const first of turns) for (const second of turns) macros.push([slice, first, second, slice]);
  }
  const goalSlots = goals.map((face) => ({ slots: fourCentreSlots(face), color: colorIndex(HOME_CENTER[face]) }));
  const preservedSlots = (["U", "D", "F", "B"] as const).flatMap((face) => fourCentreSlots(face).map((slot) => ({ slot, color: colorIndex(HOME_CENTER[face]) })));
  const keyOf = (cube: Uint8Array) => FOUR_CENTRES.map((slot) => cube[slot]).join("");
  const done = (cube: Uint8Array) => goalSlots.every((goal) => goal.slots.every((slot) => cube[slot] === goal.color));
  const safe = (cube: Uint8Array) => preservedSlots.every((item) => cube[item.slot] === item.color);
  if (done(state) && safe(state)) return [];
  const start = keyOf(state);
  const queue: Uint8Array[] = [new Uint8Array(state)];
  const seen = new Map<string, { from: string; moves: string[] }>([[start, { from: "", moves: [] }]]);
  let head = 0;
  while (head < queue.length && seen.size < 5_000) {
    const current = queue[head++]!;
    const here = keyOf(current);
    for (const macro of macros) {
      const next = applyFour(current, macro);
      if (!safe(next)) continue;
      const key = keyOf(next);
      if (seen.has(key)) continue;
      seen.set(key, { from: here, moves: macro });
      if (done(next)) {
        const path: string[] = [];
        let cursor = key;
        while (cursor !== start) {
          const step = seen.get(cursor)!;
          path.unshift(...step.moves);
          cursor = step.from;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function searchFaces(state: Uint8Array, goals: readonly Face[], preserved: readonly Face[]): string[] | null {
  if (goals.length === 2) {
    const quick = macroSearch(state, goals);
    if (quick) return quick;
  }
  const goalSlots = goals.map((face) => ({ slots: fourCentreSlots(face), color: colorIndex(HOME_CENTER[face]) }));
  const preservedSlots = preserved.flatMap((item) => fourCentreSlots(item).map((slot) => ({ slot, color: colorIndex(HOME_CENTER[item]) })));
  const generators = FOUR_MOVES.filter((move) => !move.includes("w"));
  const keyOf = (cube: Uint8Array) => FOUR_CENTRES.map((slot) => cube[slot]).join("");
  const wrong = (cube: Uint8Array) => preservedSlots.reduce((count, item) => count + (cube[item.slot] === item.color ? 0 : 1), 0);
  const done = (cube: Uint8Array) => goalSlots.every((goal) => goal.slots.every((slot) => cube[slot] === goal.color)) && wrong(cube) === 0;
  if (done(state)) return [];
  const startKey = keyOf(state);
  const queue: { cube: Uint8Array; depth: number }[] = [{ cube: new Uint8Array(state), depth: 0 }];
  const seen = new Map<string, { from: string; move: string }>([[startKey, { from: "", move: "" }]]);
  let head = 0;
  while (head < queue.length && seen.size < 200_000) {
    const current = queue[head++]!;
    if (current.depth >= 10) continue;
    const here = keyOf(current.cube);
    for (const move of generators) {
      const next = applyFour(current.cube, [move]);
      if (wrong(next) > 6) continue;
      const key = keyOf(next);
      if (seen.has(key)) continue;
      seen.set(key, { from: here, move });
      if (done(next)) return rewind(seen, key);
      queue.push({ cube: next, depth: current.depth + 1 });
    }
  }
  return null;
}

function rewind(seen: Map<string, { from: string; move: string }>, key: string): string[] {
  const path: string[] = [];
  let cursor = key;
  while (true) {
    const step = seen.get(cursor);
    if (!step || !step.move) break;
    path.push(step.move);
    cursor = step.from;
  }
  path.reverse();
  return path;
}

function restoringMoves(preserved: readonly Face[]): string[] {
  const singles = FOUR_MOVES.filter((move) => keeps(move, preserved));
  const slices = FOUR_MOVES.filter((move) => (move.startsWith("2") || move.includes("w")) && !move.endsWith("2"));
  const outers = FOUR_MOVES.filter((move) => !move.startsWith("2") && !move.includes("w"));
  const macros: string[] = [];
  for (const slice of slices) {
    const back = invertSlice(slice);
    for (const first of outers) {
      const one = [slice, first, back];
      if (sequenceRestores(one, preserved)) macros.push(one.join(" "));
      for (const second of outers) {
        if (first[0] === second[0]) continue;
        const two = [slice, first, second, back];
        if (sequenceRestores(two, preserved)) macros.push(two.join(" "));
      }
    }
  }
  return [...singles, ...macros];
}

function invertSlice(slice: string): string {
  if (slice.endsWith("'")) return slice.slice(0, -1);
  return `${slice}'`;
}

function sequenceRestores(moves: string[], preserved: readonly Face[]): boolean {
  const perm = new Uint8Array(FOUR_STICKERS);
  for (let index = 0; index < FOUR_STICKERS; index += 1) perm[index] = index;
  for (const move of moves) {
    const step = fourPerm(move);
    const next = new Uint8Array(FOUR_STICKERS);
    for (let index = 0; index < FOUR_STICKERS; index += 1) next[index] = perm[step[index]!]!;
    perm.set(next);
  }
  return preserved.every((face) => {
    const slots = fourCentreSlots(face);
    const set = new Set(slots);
    return slots.every((slot) => set.has(perm[slot]!));
  });
}

function colourMask(colors: Uint8Array, color: number): number {
  let bits = 0;
  for (let index = 0; index < 24; index += 1) if (colors[index] === color) bits |= 1 << index;
  return bits;
}

function moveMask(bits: number, move: string): number {
  let next = bits;
  for (const part of move.split(" ")) {
    const map = CENTER_MOVE[part]!;
    let turned = 0;
    for (let index = 0; index < 24; index += 1) if ((next & (1 << map[index]!)) !== 0) turned |= 1 << index;
    next = turned;
  }
  return next;
}

function bfsColour(colors: Uint8Array, color: number, slots: number[], preserved: readonly Face[]): string[] | null {
  const wanted = slots.map((slot) => CENTER_INDEX.get(slot)!);
  const goal = wanted.reduce((bits, index) => bits | (1 << index), 0);
  const start = colourMask(colors, color);
  if ((start & goal) === goal) return [];
  const moves = preserved.length ? restoringMoves(preserved) : FOUR_MOVES;
  const queue = [start];
  const seen = new Map<number, { from: number; move: string }>([[start, { from: -1, move: "" }]]);
  let head = 0;
  while (head < queue.length) {
    const state = queue[head]!;
    head += 1;
    for (const move of moves) {
      const next = moveMask(state, move);
      if (seen.has(next)) continue;
      seen.set(next, { from: state, move });
      if ((next & goal) === goal) {
        const path: string[] = [];
        let cursor = next;
        while (cursor !== start) {
          const step = seen.get(cursor)!;
          path.push(step.move);
          cursor = step.from;
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

const PAIR_OUTERS = ["U", "U'", "U2", "D", "D'", "D2", "R", "R'", "R2", "L", "L'", "L2", "F", "F'", "F2", "B", "B'", "B2"];
const PAIR_MACROS: string[][] = [
  ["2D", "R", "U", "R'", "2D'"],
  ["2U", "R", "U", "R'", "2U'"],
  ["2R", "U", "R", "U'", "2R'"],
  ["2L", "U", "R", "U'", "2L'"],
  ["2F", "U", "R", "U'", "2F'"],
  ["2B", "U", "R", "U'", "2B'"],
  ["2D", "R", "F'", "U", "R'", "F", "2D'"],
  ["2U", "R", "F'", "U", "R'", "F", "2U'"],
  ["Uw'", "R", "U", "R'", "F", "R'", "F'", "R", "Uw"],
  ["Dw'", "R", "U", "R'", "F", "R'", "F'", "R", "Dw"],
  ["Rw'", "U", "R", "U'", "Rw"],
  ["Lw", "U", "R", "U'", "Lw'"],
  ["2D", "R", "F'", "U", "R'", "F", "2D'", "R", "F", "R'"],
  ["Uw2", "R", "U2", "R'", "Uw2"],
  ["2U2", "R", "U2", "R'", "2U2"],
];

function pairEdges(state: Uint8Array): string[] {
  const moves: string[] = [];
  const solved = solvedFourBytes();
  const centresOk = (cube: Uint8Array) => FOUR_CENTRES.every((slot) => cube[slot] === solved[slot]);
  for (let guard = 0; guard < 16 && FOUR_EDGES.some((edge) => !edgePaired(state, edge)); guard += 1) {
    const before = FOUR_EDGES.filter((edge) => edgePaired(state, edge)).length;
    const found = findPair(state, before, centresOk, 3) ?? findPair(state, before, centresOk, 5);
    if (!found) throw new Error(`Edges stayed unpaired (${before}/12).`);
    applyFourInto(state, found);
    moves.push(...found);
  }
  const flags = FOUR_EDGES.map((edge) => edgePaired(state, edge) ? "1" : "0").join("");
  if (flags.includes("0")) throw new Error(`Edges stayed unpaired (${flags}).`);
  return moves;
}

function findPair(state: Uint8Array, before: number, centresOk: (cube: Uint8Array) => boolean, setupDepth: number): string[] | null {
  const keyOf = (cube: Uint8Array) => FOUR_EDGES.map((edge) => edge.wings.map((wing) => `${cube[wing.slots[0]]}${cube[wing.slots[1]]}`).join(",")).join("|");
  const queue: { cube: Uint8Array; moves: string[] }[] = [{ cube: new Uint8Array(state), moves: [] }];
  const seen = new Set<string>([keyOf(state)]);
  let head = 0;
  while (head < queue.length && seen.size < (setupDepth > 3 ? 60_000 : 8_000)) {
    const current = queue[head++]!;
    if (current.moves.length <= setupDepth) {
      for (const outer of PAIR_OUTERS) {
        if (current.moves.length && current.moves[current.moves.length - 1]![0] === outer[0]) continue;
        const next = applyFour(current.cube, [outer]);
        const key = keyOf(next);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ cube: next, moves: [...current.moves, outer] });
      }
    }
    for (const macro of PAIR_MACROS) {
      const next = applyFour(current.cube, macro);
      if (!centresOk(next) || FOUR_EDGES.filter((edge) => edgePaired(next, edge)).length <= before) continue;
      return [...current.moves, ...macro];
    }
  }
  return null;
}

function edgePaired(state: Uint8Array, edge: FourEdge): boolean {
  const [a, b] = edge.wings;
  return state[a.slots[0]] === state[b.slots[0]] && state[a.slots[1]] === state[b.slots[1]];
}

const OLL_PARITY = ["2R2", "B2", "U2", "2L", "U2", "2R'", "U2", "2R", "U2", "F2", "2R", "F2", "2L'", "B2", "2R2"];
const PLL_PARITY = ["2R2", "U2", "2R2", "Uw2", "2R2", "Uw2"];

function fixParity(state: Uint8Array): string[] {
  const moves: string[] = [];
  for (let guard = 0; guard < 3; guard += 1) {
    const verdict = validateBytes(stringToFacelets(toThree(state)), { searchRotations: false });
    if (verdict.ok) return moves;
    const codes = new Set(verdict.issues.map((issue) => issue.code));
    if (codes.has("edge-flip")) {
      applyFourInto(state, OLL_PARITY);
      moves.push(...OLL_PARITY);
      continue;
    }
    if (codes.has("parity")) {
      applyFourInto(state, PLL_PARITY);
      moves.push(...PLL_PARITY);
      continue;
    }
    break;
  }
  return moves;
}

function letterAt(state: Uint8Array, index: number): string {
  return COLOR_LETTER[COLORS[state[index]!]!] ?? "?";
}

function toThree(state: Uint8Array): string {
  const pick = [
    [0, 0], [0, 1], [0, 3],
    [1, 0], [1, 1], [1, 3],
    [3, 0], [3, 1], [3, 3],
  ];
  let text = "";
  for (const face of FACES) {
    const base = fourOffset(face);
    for (const pair of pick) text += letterAt(state, base + (pair[0] ?? 0) * 4 + (pair[1] ?? 0));
  }
  return text;
}

function same(left: Uint8Array, right: Uint8Array): boolean {
  for (let index = 0; index < FOUR_STICKERS; index += 1) if (left[index] !== right[index]) return false;
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

