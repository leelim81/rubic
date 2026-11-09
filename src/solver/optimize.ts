import { applyMoves, copyBytes, faceletsToString } from "../cube/model";
import { fingerTricks } from "../teaching/fingers";
import type { Solution, StageId, TeachingChunk } from "./beginner";

const OPPOSITE: Record<string, string> = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };

export const STAGE_ORDER: { id: StageId; name: string; number: number }[] = [
  { id: "cross", name: "White cross", number: 1 },
  { id: "corners", name: "White corners", number: 2 },
  { id: "middle", name: "Middle layer", number: 3 },
  { id: "yellowCross", name: "Yellow cross", number: 4 },
  { id: "yellowEdges", name: "Yellow edges", number: 5 },
  { id: "yellowCorners", name: "Yellow corners", number: 6 },
  { id: "orientCorners", name: "Orient corners", number: 7 },
];

type Atom = { face: string; quarters: number };

/** Merge turns of one face, including when only the opposite face sits between them. */
export function cancelCommuting(moves: string[]): string[] {
  let atoms = parse(moves);
  let changed = true;
  while (changed) {
    changed = false;
    const next: Atom[] = [];
    for (const atom of atoms) {
      const quarters = atom.quarters % 4;
      if (quarters === 0) continue;
      const opposite = OPPOSITE[atom.face];
      let index = next.length - 1;
      while (index >= 0 && opposite && next[index]!.face === opposite) index -= 1;
      if (index >= 0 && next[index]!.face === atom.face) {
        next[index]!.quarters = (next[index]!.quarters + quarters) % 4;
        if (next[index]!.quarters === 0) next.splice(index, 1);
        changed = true;
        continue;
      }
      next.push({ face: atom.face, quarters });
    }
    atoms = next;
  }
  return format(atoms);
}

/** Drop any stretch of moves that returns the cube to a state already on the path. */
export function removeCycles(moves: string[], start: Uint8Array): string[] {
  const kept: string[] = [];
  const seen = new Map<string, number>([[faceletsToString(start), 0]]);
  let state = start;
  for (const move of moves) {
    kept.push(move);
    state = applyMoves(state, [move]);
    const key = faceletsToString(state);
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      kept.length = earlier;
      return removeCycles(kept, start);
    }
    seen.set(key, kept.length);
  }
  return kept;
}

/** Cancel wasted turns and loops until nothing else drops out. */
export function stripWaste(moves: string[], start: Uint8Array): string[] {
  let current = moves.slice();
  for (let guard = 0; guard < 16; guard += 1) {
    const next = removeCycles(cancelCommuting(current), start);
    if (next.join(" ") === current.join(" ")) return next;
    current = next;
  }
  return current;
}

/** Name each remaining move by the beginner stage it is still working on. */
export function labelStages(start: Uint8Array, moves: string[], done: (id: StageId, state: Uint8Array) => boolean): Solution {
  if (!moves.length) return { moves: [], chunkOfMove: [], chunks: [] };
  let state = copyBytes(start);
  let stage = 0;
  while (stage < STAGE_ORDER.length && done(STAGE_ORDER[stage]!.id, state)) stage += 1;
  const groups: { id: StageId; name: string; number: number; moves: string[] }[] = [];
  for (const move of moves) {
    const current = STAGE_ORDER[Math.min(stage, STAGE_ORDER.length - 1)]!;
    const last = groups[groups.length - 1];
    if (!last || last.id !== current.id) groups.push({ id: current.id, name: current.name, number: current.number, moves: [move] });
    else last.moves.push(move);
    state = applyMoves(state, [move]);
    while (stage < STAGE_ORDER.length && done(STAGE_ORDER[stage]!.id, state)) stage += 1;
  }
  const chunks: TeachingChunk[] = groups.map((group, index) => ({
    id: `${index}-${group.id}`,
    stageId: group.id,
    stageNumber: group.number,
    stageName: group.name,
    title: group.name,
    goal: "",
    why: "",
    caseName: group.name,
    hold: "",
    moves: group.moves,
    focus: [],
    advice: "",
    tip: null,
    fingertricks: fingerTricks(group.moves),
  }));
  const chunkOfMove: number[] = [];
  chunks.forEach((chunk, index) => {
    for (let i = 0; i < chunk.moves.length; i += 1) chunkOfMove.push(index);
  });
  return { moves: chunks.flatMap((chunk) => chunk.moves), chunkOfMove, chunks };
}

function parse(moves: string[]): Atom[] {
  return moves.filter(Boolean).map((move) => ({
    face: move[0] ?? "",
    quarters: move.endsWith("2") ? 2 : move.endsWith("'") ? 3 : 1,
  }));
}

function format(atoms: Atom[]): string[] {
  return atoms.map((atom) => {
    const quarters = ((atom.quarters % 4) + 4) % 4;
    if (quarters === 2) return `${atom.face}2`;
    if (quarters === 3) return `${atom.face}'`;
    return atom.face;
  });
}
