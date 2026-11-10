import {
  FIVE_MOVES,
  applyFive,
  fiveCentreKind,
  fiveCentreSlots,
  fiveDestination,
} from "../cube/five";
import { FACES, HOME_CENTER, colorIndex, type Face } from "../cube/model";

/**
 * Centre reduction.
 *
 * T-centres are identical within a colour, so each face is a 4-piece
 * search. The first face is free. Later faces use 3-move insertions that
 * put a piece on the face and restore the faces already solved.
 * X-centres then move by the pure 8-move cycles, which do not touch
 * t-centres, plus outer turns that only cycle a face among itself.
 * Several face orders are tried and the shortest is kept.
 */

const ORDERS: Face[][] = [
  ["F", "B", "U", "D", "R", "L"],
  ["U", "D", "F", "B", "R", "L"],
  ["R", "L", "U", "D", "F", "B"],
];

const OUTERS = FIVE_MOVES.filter((move) => !move.includes("w") && !move.startsWith("2"));
const SLICES = FIVE_MOVES.filter((move) => move.startsWith("2"));

function keyOf(slots: number[]): string {
  return slots.slice().sort((a, b) => a - b).join(",");
}

function invert(move: string): string {
  if (move.endsWith("'")) return move.slice(0, -1);
  if (move.endsWith("2")) return move;
  return `${move}'`;
}

function slotsOf(cube: Uint8Array, color: number, kind: "t" | "x"): number[] {
  const found: number[] = [];
  for (let index = 0; index < cube.length; index += 1) if (cube[index] === color && fiveCentreKind(index) === kind) found.push(index);
  return found;
}

function keeps(seq: string[], groups: number[][]): boolean {
  for (const group of groups) {
    let images = group;
    for (const move of seq) images = images.map((slot) => fiveDestination(move, slot));
    if (keyOf(images) !== keyOf(group)) return false;
  }
  return true;
}

interface Generator {
  moves: string[];
}

let cycleCache: Generator[] | null = null;

function xCycles(): Generator[] {
  if (cycleCache) return cycleCache;
  const faces = ["U", "D", "R", "L", "F", "B"] as const;
  const found: Generator[] = [];
  const seen = new Set<string>();
  for (const a of faces) for (const b of faces) if (a !== b) {
    for (const turn of faces) if (turn !== a && turn !== b) {
      for (const turnSuffix of ["", "'"] as const) {
        const quarter = `${turn}${turnSuffix}`;
        const back = turnSuffix === "'" ? turn : `${turn}'`;
        for (const form of [0, 1]) {
          const seq = form === 0
            ? [`2${a}`, quarter, `2${b}'`, back, `2${a}'`, quarter, `2${b}`, back]
            : [`2${a}`, quarter, `2${b}`, back, `2${a}'`, quarter, `2${b}'`, back];
          const name = seq.join(" ");
          if (seen.has(name) || !pureX(seq)) continue;
          seen.add(name);
          found.push({ moves: seq });
        }
      }
    }
  }
  cycleCache = found;
  return found;
}

function solvedCube(): Uint8Array {
  const bytes = new Uint8Array(150);
  for (let index = 0; index < 150; index += 1) {
    const face = Math.floor(index / 25);
    bytes[index] = colorIndex(HOME_CENTER[FACES[face]!]);
  }
  return bytes;
}

function pureX(moves: string[]): boolean {
  const home = solvedCube();
  const next = applyFive(home, moves);
  let t = 0;
  let x = 0;
  let other = 0;
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] === home[index]) continue;
    const kind = fiveCentreKind(index);
    if (kind === "t") t += 1;
    else if (kind === "x") x += 1;
    else other += 1;
  }
  return t === 0 && other === 0 && x > 0 && x <= 4;
}

function generators(groups: number[][], turns: Face[], extra: Generator[] = []): Generator[] {
  if (!groups.length) return FIVE_MOVES.map((move) => ({ moves: [move] }));
  const gens: Generator[] = [];
  for (const move of OUTERS) if (keeps([move], groups)) gens.push({ moves: [move] });
  for (const slice of SLICES) {
    for (const face of turns) {
      for (const suffix of ["", "'", "2"]) {
        const seq = [slice, `${face}${suffix}`, invert(slice)];
        if (keeps(seq, groups)) gens.push({ moves: seq });
      }
    }
  }
  for (const cycle of extra) if (keeps(cycle.moves, groups)) gens.push(cycle);
  return gens;
}

function bfs(start: number[], goal: string, gens: Generator[]): string[] | null {
  const startKey = keyOf(start);
  if (startKey === goal) return [];
  const previous = new Map<string, { from: string; moves: string }>();
  const queue = [start.slice().sort((a, b) => a - b)];
  previous.set(startKey, { from: "", moves: "" });
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = keyOf(current);
    for (const gen of gens) {
      let next = current;
      for (const move of gen.moves) next = next.map((index) => fiveDestination(move, index));
      next = next.slice().sort((a, b) => a - b);
      const key = next.join(",");
      if (previous.has(key)) continue;
      previous.set(key, { from: currentKey, moves: gen.moves.join(" ") });
      if (key === goal) {
        const out: string[] = [];
        let cursor = key;
        while (true) {
          const step = previous.get(cursor)!;
          if (!step.moves) break;
          out.push(step.moves);
          cursor = step.from;
        }
        return out.reverse().join(" ").split(" ").filter(Boolean);
      }
      queue.push(next);
    }
  }
  return null;
}

function solveOrder(start: Uint8Array, order: Face[]): string[] | null {
  let cube = start;
  const moves: string[] = [];
  const solvedT: Face[] = [];
  for (const face of order) {
    const groups = solvedT.map((item) => fiveCentreSlots(item, "t"));
    const turns: Face[] = solvedT.length ? FACES.filter((item) => !solvedT.includes(item)) : [...FACES];
    const path = bfs(slotsOf(cube, colorIndex(HOME_CENTER[face]), "t"), keyOf(fiveCentreSlots(face, "t")), generators(groups, turns));
    if (!path) return null;
    cube = applyFive(cube, path);
    moves.push(...path);
    solvedT.push(face);
  }
  const solvedX: Face[] = [];
  const pending = order.slice();
  let borrows = 0;
  while (pending.length) {
    const face = pending[0]!;
    const path = placeX(cube, face, solvedX);
    if (path) {
      cube = applyFive(cube, path);
      moves.push(...path);
      pending.shift();
      solvedX.push(face);
      continue;
    }
    const borrowed = solvedX.pop();
    if (!borrowed || borrows > 8) return null;
    borrows += 1;
    const retry = placeX(cube, face, solvedX);
    if (!retry) return null;
    cube = applyFive(cube, retry);
    moves.push(...retry);
    pending.shift();
    solvedX.push(face);
    const repair = placeX(cube, borrowed, solvedX);
    if (!repair) return null;
    cube = applyFive(cube, repair);
    moves.push(...repair);
    solvedX.push(borrowed);
  }
  return moves;
}

function placeX(cube: Uint8Array, face: Face, solvedX: Face[]): string[] | null {
  const groups = [...FACES.map((item) => fiveCentreSlots(item, "t")), ...solvedX.map((item) => fiveCentreSlots(item, "x"))];
  return bfs(slotsOf(cube, colorIndex(HOME_CENTER[face]), "x"), keyOf(fiveCentreSlots(face, "x")), generators(groups, [...FACES], xCycles()));
}

function wrongX(cube: Uint8Array): number {
  let wrong = 0;
  for (const face of FACES) {
    const color = colorIndex(HOME_CENTER[face]);
    for (const slot of fiveCentreSlots(face, "x")) if (cube[slot] !== color) wrong += 1;
  }
  return wrong;
}

function xKey(cube: Uint8Array): string {
  let text = "";
  for (let index = 0; index < cube.length; index += 1) if (fiveCentreKind(index) === "x") text += String.fromCharCode(48 + (cube[index] ?? 0));
  return text;
}

function tidyX(cube: Uint8Array): string[] {
  if (!wrongX(cube)) return [];
  const cycles = [...xCycles().map((cycle) => cycle.moves), ...OUTERS.map((move) => [move])];
  const previous = new Map<string, { from: string; index: number }>();
  const queue: Uint8Array[] = [new Uint8Array(cube)];
  previous.set(xKey(cube), { from: "", index: -1 });
  let head = 0;
  let solvedKey = "";
  while (head < queue.length && previous.size < 20000) {
    const current = queue[head++]!;
    const currentKey = xKey(current);
    for (let index = 0; index < cycles.length; index += 1) {
      const next = applyFive(current, cycles[index]!);
      const key = xKey(next);
      if (previous.has(key)) continue;
      previous.set(key, { from: currentKey, index });
      if (!wrongX(next)) {
        solvedKey = key;
        head = queue.length;
        break;
      }
      queue.push(new Uint8Array(next));
    }
  }
  if (!solvedKey) return [];
  const parts: string[][] = [];
  let cursor = solvedKey;
  while (true) {
    const step = previous.get(cursor);
    if (!step || step.index < 0) break;
    parts.push(cycles[step.index]!);
    cursor = step.from;
  }
  const moves = parts.reverse().flat();
  const placed = applyFive(cube, moves);
  for (let index = 0; index < cube.length; index += 1) cube[index] = placed[index]!;
  return moves;
}

export function solveShortCentres(state: Uint8Array): string[] {
  let best: string[] | null = null;
  const started = Date.now();
  for (const order of ORDERS) {
    if (best && Date.now() - started > 3500) break;
    const moves = solveOrder(state.slice(), order);
    if (moves && (!best || moves.length < best.length)) best = moves;
  }
  if (!best) throw new Error("This colouring isn't possible on a real cube.");
  const next = applyFive(state, best);
  for (let index = 0; index < state.length; index += 1) state[index] = next[index]!;
  const tidy = tidyX(state);
  best = best.concat(tidy);
  let wrongT = 0;
  let wrongXCount = 0;
  for (const face of FACES) {
    const color = colorIndex(HOME_CENTER[face]);
    for (const slot of fiveCentreSlots(face, "t")) if (state[slot] !== color) wrongT += 1;
    for (const slot of fiveCentreSlots(face, "x")) if (state[slot] !== color) wrongXCount += 1;
  }
  if (wrongT || wrongXCount) throw new Error("This colouring isn't possible on a real cube.");
  return best;
}
