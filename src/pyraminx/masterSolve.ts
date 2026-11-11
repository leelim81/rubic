import type { Solution, TeachingChunk } from "../solver/beginner";
import { SOLVED_PYRA } from "./model";
import { solvePyraminx } from "./solve";
import {
  MASTER_EFFECTS,
  MASTER_MOVES,
  SOLVED_MASTER,
  applyMasterMoves,
  centerKey,
  invertMaster,
  masterAsPyraminx,
  nonCenterMatches,
  readMaster,
  tipFixMoves,
  validateMaster,
  wideMove,
} from "./master";

/**
 * Reduction, in the same spirit as the 5×5: pair the wings with the midges,
 * solve that Pyraminx with wide turns, then restore the face centres.
 * Tips are turned into place at the end.
 */
export function solveMaster(facelets: string): Solution {
  const verdict = validateMaster(facelets);
  if (!verdict.ok) throw new Error(verdict.message || "This colouring is not a solvable Master Pyraminx.");
  const moves = [
    ...pairWings(facelets),
  ];
  let state = applyMasterMoves(facelets, moves);
  const where = layout(state);
  if ([0, 1, 2, 3, 4, 5].some((edge) => !paired(where, edge))) throw new Error("Wings were not paired.");
  const reduced = solvePyraminx(masterAsPyraminx(state)).moves.filter((move) => move[0] === move[0]?.toUpperCase()).map(wideMove);
  moves.push(...reduced);
  state = applyMasterMoves(state, reduced);
  if (!pyraminxCoreSolved(masterAsPyraminx(state))) throw new Error("The Pyraminx reduction did not finish.");
  const centres = centreMoves(centerKey(state));
  moves.push(...centres);
  state = applyMasterMoves(state, centres);
  if (centerKey(state) !== centerKey(SOLVED_MASTER)) throw new Error(`Centres left ${centerKey(state)}`);
  const tips = tipFixMoves(state);
  moves.push(...tips);
  if (applyMasterMoves(state, tips) !== SOLVED_MASTER) {
    throw new Error("The solver did not finish on a solved Master Pyraminx.");
  }
  return pack(moves);
}

interface Spot {
  slot: number;
  ori: number;
}

function layout(state: string): { midge: Spot[]; wings: Spot[][] } {
  const slots = readMaster(state);
  if (!slots) throw new Error("This colouring is not a solvable Master Pyraminx.");
  const midge = Array.from({ length: 6 }, () => ({ slot: 0, ori: 0 }));
  slots.midgePiece.forEach((piece, slot) => {
    midge[piece] = { slot, ori: slots.midgeOri[slot] ?? 0 };
  });
  const wings = Array.from({ length: 6 }, () => [] as Spot[]);
  slots.wingPiece.forEach((id, slot) => {
    wings[Math.floor(id / 2)]!.push({ slot, ori: slots.wingOri[slot] ?? 0 });
  });
  return { midge, wings };
}

function paired(where: { midge: Spot[]; wings: Spot[][] }, edge: number): boolean {
  const midge = where.midge[edge];
  const wings = where.wings[edge];
  return !!midge && !!wings && wings.length === 2 && wings.every((wing) => Math.floor(wing.slot / 2) === midge.slot && wing.ori === midge.ori);
}

function pairedMask(where: { midge: Spot[]; wings: Spot[][] }): number {
  let mask = 0;
  for (let edge = 0; edge < 6; edge += 1) {
    if (paired(where, edge)) mask |= 1 << where.midge[edge]!.slot;
  }
  return mask;
}

function pairWings(state: string): string[] {
  const moves: string[] = [];
  let current = state;
  for (let guard = 0; guard < 12; guard += 1) {
    const where = layout(current);
    const open = [0, 1, 2, 3, 4, 5].filter((index) => !paired(where, index));
    if (!open.length) return moves;
    const mask = pairedMask(where);
    const edge = open[0]!;
    let found = searchPair(where.midge[edge]!, where.wings[edge]![0]!, where.wings[edge]![1]!, mask);
    if (!found) {
      for (const other of open) {
        if (other === edge) continue;
        found = searchTwo(where, edge, other, mask);
        if (found) break;
      }
    }
    if (!found) {
      for (let other = 0; other < 6 && !found; other += 1) {
        if (!paired(where, other)) continue;
        const slot = where.midge[other]!.slot;
        found = searchTwo(where, edge, other, mask & ~(1 << slot));
      }
    }
    if (!found) throw new Error("A wing could not be paired with its midge.");
    moves.push(...found);
    current = applyMasterMoves(current, found);
  }
  throw new Error("The wings could not be paired.");
}

function searchPair(midge: Spot, first: Spot, second: Spot, mask: number): string[] | null {
  const start = keyOf(midge, [first, second], mask);
  if (together(midge.slot, midge.ori, [first, second])) return [];
  const seen = new Set<string>([start]);
  const queue: { midge: Spot; wings: Spot[]; mask: number; moves: string[] }[] = [{ midge, wings: [first, second], mask, moves: [] }];
  let head = 0;
  while (head < queue.length) {
    const item = queue[head]!;
    head += 1;
    for (const move of MASTER_MOVES) {
      const effect = MASTER_EFFECTS[move];
      if (!effect) continue;
      let blocked = false;
      let nextMask = 0;
      for (let slot = 0; slot < 6; slot += 1) {
        if ((item.mask & (1 << slot)) === 0) continue;
        const dest = effect.edgeTo[slot] ?? -1;
        if (dest < 0) {
          blocked = true;
          break;
        }
        nextMask |= 1 << dest;
      }
      if (blocked) continue;
      const nextMidge = { slot: effect.midgeTo[item.midge.slot] ?? 0, ori: item.midge.ori ^ (effect.midgeFlip[item.midge.slot] ?? 0) };
      const nextWings = item.wings.map((wing) => ({ slot: effect.wingTo[wing.slot] ?? 0, ori: wing.ori ^ (effect.wingFlip[wing.slot] ?? 0) }));
      const code = keyOf(nextMidge, nextWings, nextMask);
      if (seen.has(code)) continue;
      const moves = [...item.moves, move];
      if (together(nextMidge.slot, nextMidge.ori, nextWings)) return moves;
      seen.add(code);
      queue.push({ midge: nextMidge, wings: nextWings, mask: nextMask, moves });
    }
  }
  return null;
}

function searchTwo(where: { midge: Spot[]; wings: Spot[][] }, edgeA: number, edgeB: number, mask: number): string[] | null {
  const start = {
    a: where.midge[edgeA]!,
    b: where.midge[edgeB]!,
    wingsA: where.wings[edgeA]!,
    wingsB: where.wings[edgeB]!,
    mask,
    moves: [] as string[],
  };
  if (together(start.a.slot, start.a.ori, start.wingsA) && together(start.b.slot, start.b.ori, start.wingsB)) return [];
  const seen = new Set<string>([twoKey(start.a, start.b, start.wingsA, start.wingsB, mask)]);
  const queue = [start];
  let head = 0;
  while (head < queue.length && seen.size < 400_000) {
    const item = queue[head]!;
    head += 1;
    for (const move of MASTER_MOVES) {
      const effect = MASTER_EFFECTS[move];
      if (!effect || blocked(effect, item.mask)) continue;
      const next = {
        a: shiftMidge(effect, item.a),
        b: shiftMidge(effect, item.b),
        wingsA: item.wingsA.map((wing) => shiftWing(effect, wing)),
        wingsB: item.wingsB.map((wing) => shiftWing(effect, wing)),
        mask: shiftMask(effect, item.mask),
        moves: [...item.moves, move],
      };
      const code = twoKey(next.a, next.b, next.wingsA, next.wingsB, next.mask);
      if (seen.has(code)) continue;
      if (together(next.a.slot, next.a.ori, next.wingsA) && together(next.b.slot, next.b.ori, next.wingsB)) return next.moves;
      seen.add(code);
      queue.push(next);
    }
  }
  return null;
}

function shiftMidge(effect: (typeof MASTER_EFFECTS)[string], spot: Spot): Spot {
  return { slot: effect.midgeTo[spot.slot] ?? 0, ori: spot.ori ^ (effect.midgeFlip[spot.slot] ?? 0) };
}

function shiftWing(effect: (typeof MASTER_EFFECTS)[string], spot: Spot): Spot {
  return { slot: effect.wingTo[spot.slot] ?? 0, ori: spot.ori ^ (effect.wingFlip[spot.slot] ?? 0) };
}

function blocked(effect: (typeof MASTER_EFFECTS)[string], mask: number): boolean {
  for (let slot = 0; slot < 6; slot += 1) {
    if ((mask & (1 << slot)) !== 0 && (effect.edgeTo[slot] ?? -1) < 0) return true;
  }
  return false;
}

function shiftMask(effect: (typeof MASTER_EFFECTS)[string], mask: number): number {
  let next = 0;
  for (let slot = 0; slot < 6; slot += 1) {
    if ((mask & (1 << slot)) === 0) continue;
    next |= 1 << (effect.edgeTo[slot] ?? 0);
  }
  return next;
}

function twoKey(a: Spot, b: Spot, wingsA: Spot[], wingsB: Spot[], mask: number): string {
  return `${keyOf(a, wingsA, 0)}|${keyOf(b, wingsB, 0)}|${mask}`;
}

function together(slot: number, ori: number, wings: Spot[]): boolean {
  return wings.length === 2 && wings.every((wing) => Math.floor(wing.slot / 2) === slot && wing.ori === ori) && wings[0]!.slot !== wings[1]!.slot;
}

function keyOf(midge: Spot, wings: Spot[], mask: number): string {
  const ordered = wings.slice().sort((left, right) => left.slot - right.slot || left.ori - right.ori);
  return `${midge.slot}.${midge.ori}.${ordered.map((wing) => `${wing.slot}.${wing.ori}`).join(".")}.${mask}`;
}

let centreTable: Map<string, string[]> | null = null;

function centreMoves(key: string): string[] {
  const table = centreTable ?? (centreTable = buildCentreTable());
  const moves = table.get(key);
  if (!moves) throw new Error("The face centres are not a solvable Master Pyraminx pattern.");
  return moves.slice().reverse().map(invertMaster);
}

function buildCentreTable(): Map<string, string[]> {
  const generators = pureCentreGenerators();
  const best = new Map<string, string[]>([[centerKey(SOLVED_MASTER), []]]);
  const queue: string[] = [centerKey(SOLVED_MASTER)];
  while (queue.length) {
    const key = queue.shift()!;
    const base = best.get(key) ?? [];
    const state = applyMasterMoves(SOLVED_MASTER, base);
    for (const generator of generators) {
      const next = applyMasterMoves(state, generator);
      const nextKey = centerKey(next);
      if (best.has(nextKey)) continue;
      best.set(nextKey, [...base, ...generator]);
      queue.push(nextKey);
    }
  }
  return best;
}

function pureCentreGenerators(): string[][] {
  const wide = MASTER_MOVES.filter((move) => move.includes("w"));
  const normal = MASTER_MOVES.filter((move) => !move.includes("w") && move[0] === move[0]?.toUpperCase());
  const found = new Map<string, string[]>();
  const consider = (moves: string[]) => {
    const next = applyMasterMoves(SOLVED_MASTER, moves);
    if (next === SOLVED_MASTER || !nonCenterMatches(next, SOLVED_MASTER)) return;
    const key = centerKey(next);
    const previous = found.get(key);
    if (!previous || moves.length < previous.length) found.set(key, moves);
  };
  for (const left of wide) {
    for (const right of [...wide, ...normal]) {
      if (left[0]?.toUpperCase() === right[0]?.toUpperCase()) continue;
      const commutator = [left, right, invertMaster(left), invertMaster(right)];
      for (const times of [1, 2, 3]) consider(Array.from({ length: times }, () => commutator).flat());
    }
  }
  for (const vertex of ["U", "L", "R", "B"]) {
    for (const other of ["U", "L", "R", "B"]) {
      if (vertex === other) continue;
      const slice = [`${vertex}w`, `${other}w`, `${other}'`, `${vertex}w'`, `${other}w`, `${other}'`];
      consider(slice);
      consider([...slice, ...slice]);
    }
  }
  return [...found.values()];
}

function pyraminxCoreSolved(image: string): boolean {
  for (let face = 0; face < 4; face += 1) {
    for (let local = 0; local < 9; local += 1) {
      if (local === 0 || local === 4 || local === 8) continue;
      if (image[face * 9 + local] !== SOLVED_PYRA[face * 9 + local]) return false;
    }
  }
  return true;
}

function pack(moves: string[]): Solution {
  if (!moves.length) return { moves: [], chunkOfMove: [], chunks: [] };
  const chunk: TeachingChunk = {
    id: "master-pyraminx",
    stageId: "hold",
    stageNumber: 0,
    stageName: "Solve",
    title: "Solve",
    goal: "",
    why: "",
    caseName: "master-pyraminx",
    hold: "",
    moves,
    focus: [],
    advice: "",
    tip: null,
    fingertricks: moves.map(() => ""),
  };
  return { moves, chunkOfMove: moves.map(() => 0), chunks: [chunk] };
}
