/**
 * Geometric 5×5 model.
 *
 * Coordinates match the 3×3: +x right, +y up, +z front, grid −2…2.
 * A clockwise turn is the quarter turn you see when looking at that face.
 * U sends the front edge to the left. Wide turns (Uw) move the outer layer
 * and the slice beside it. 2U turns only that inner slice. 3U turns the
 * middle slice, the layer through the fixed centres.
 *
 * Home hold is the same as the 3×3: yellow on top, white on the bottom,
 * green in front, blue at the back, orange on the right, red on the left.
 */

import { COLORS, COLOR_LETTER, FACES, HOME_CENTER, type ColorName, type Face, type Vec, colorIndex } from "./model";
import { validateFaceletString } from "./validate";

export const FIVE = 5;
export const FIVE_STICKERS = 150;
const K = 2;

const FACE_INDEX: Record<Face, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

export function fiveOffset(face: Face): number {
  return FACE_INDEX[face] * 25;
}

const NORMAL: Record<Face, Vec> = {
  U: { x: 0, y: 1, z: 0 },
  D: { x: 0, y: -1, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  B: { x: 0, y: 0, z: -1 },
  R: { x: 1, y: 0, z: 0 },
  L: { x: -1, y: 0, z: 0 },
};

export interface FiveSlot {
  index: number;
  face: Face;
  row: number;
  col: number;
  /** Integer grid −2…2. The rendered cubie sits at half of this. */
  grid: Vec;
  normal: Vec;
}

function gridPosition(face: Face, row: number, col: number): Vec {
  switch (face) {
    case "U":
      return { x: col - K, y: K, z: row - K };
    case "D":
      return { x: col - K, y: -K, z: K - row };
    case "F":
      return { x: col - K, y: K - row, z: K };
    case "B":
      return { x: K - col, y: K - row, z: -K };
    case "R":
      return { x: K, y: K - row, z: K - col };
    case "L":
      return { x: -K, y: K - row, z: col - K };
  }
}

export const FIVE_SLOTS: FiveSlot[] = FACES.flatMap((face) => {
  const slots: FiveSlot[] = [];
  for (let row = 0; row < FIVE; row += 1) {
    for (let col = 0; col < FIVE; col += 1) {
      slots.push({
        index: fiveOffset(face) + row * FIVE + col,
        face,
        row,
        col,
        grid: gridPosition(face, row, col),
        normal: NORMAL[face],
      });
    }
  }
  return slots;
});

const SLOT_BY_GEOM = new Map<string, number>();
for (const slot of FIVE_SLOTS) SLOT_BY_GEOM.set(geomKey(slot.grid, slot.normal), slot.index);

export function geomKey(pos: Vec, normal: Vec): string {
  return `${pos.x},${pos.y},${pos.z}|${normal.x},${normal.y},${normal.z}`;
}

function quarter(v: Vec, face: Face): Vec {
  const { x, y, z } = v;
  switch (face) {
    case "U":
      return { x: -z, y, z: x };
    case "D":
      return { x: z, y, z: -x };
    case "R":
      return { x, y: z, z: -y };
    case "L":
      return { x, y: -z, z: y };
    case "F":
      return { x: y, y: -x, z };
    case "B":
      return { x: -y, y: x, z };
  }
}

export interface ParsedFive {
  face: Face;
  /** 1 = outer layer, 2 = inner slice, 3 = middle slice. Wide turns outer and inner. */
  depth: 1 | 2 | 3;
  wide: boolean;
  quarters: 1 | 2 | 3;
}

export function parseFiveMove(move: string): ParsedFive {
  let rest = move;
  let depth: 1 | 2 | 3 = 1;
  if (/^[23][URFDLB]/.test(rest)) {
    depth = rest[0] === "3" ? 3 : 2;
    rest = rest.slice(1);
  }
  const face = rest[0] ?? "";
  if (!FACES.includes(face as Face)) throw new Error(`Unknown 5×5 move “${move}”`);
  rest = rest.slice(1);
  const wide = rest.startsWith("w");
  if (wide) rest = rest.slice(1);
  if (depth !== 1 && wide) throw new Error(`Unknown 5×5 move “${move}”`);
  const quarters = rest === "" ? 1 : rest === "'" ? 3 : rest === "2" ? 2 : 0;
  if (!quarters) throw new Error(`Unknown 5×5 move “${move}”`);
  return { face: face as Face, depth, wide, quarters };
}

/** Inner slices are written 2U so they stay distinct from the half turn U2. */
export function formatFiveMove(move: ParsedFive): string {
  const suffix = move.quarters === 2 ? "2" : move.quarters === 3 ? "'" : "";
  if (move.wide) return `${move.face}w${suffix}`;
  if (move.depth === 2) return `2${move.face}${suffix}`;
  if (move.depth === 3) return `3${move.face}${suffix}`;
  return `${move.face}${suffix}`;
}

export function invertFiveMove(move: string): string {
  const parsed = parseFiveMove(move);
  return formatFiveMove({ ...parsed, quarters: ((4 - parsed.quarters) % 4 || 4) as 1 | 2 | 3 });
}

function axisOf(face: Face): "x" | "y" | "z" {
  if (face === "R" || face === "L") return "x";
  if (face === "U" || face === "D") return "y";
  return "z";
}

function layerCoord(face: Face, depth: 1 | 2 | 3): number {
  if (depth === 3) return 0;
  const sign = face === "D" || face === "L" || face === "B" ? -1 : 1;
  return sign * (depth === 1 ? K : 1);
}

function onTurn(grid: Vec, move: ParsedFive): boolean {
  const axis = axisOf(move.face);
  const value = grid[axis];
  if (move.wide) return value === layerCoord(move.face, 1) || value === layerCoord(move.face, 2);
  return value === layerCoord(move.face, move.depth);
}

function buildPerm(text: string): Uint8Array {
  const move = parseFiveMove(text);
  const perm = new Uint8Array(FIVE_STICKERS);
  for (let i = 0; i < FIVE_STICKERS; i += 1) perm[i] = i;
  for (const slot of FIVE_SLOTS) {
    if (!onTurn(slot.grid, move)) continue;
    let pos = slot.grid;
    let normal = slot.normal;
    for (let turn = 0; turn < move.quarters; turn += 1) {
      pos = quarter(pos, move.face);
      normal = quarter(normal, move.face);
    }
    const dest = SLOT_BY_GEOM.get(geomKey(pos, normal));
    if (dest === undefined) throw new Error(`Move ${text} sent ${slot.face}${slot.row},${slot.col} ${JSON.stringify(slot.grid)} -> ${JSON.stringify(pos)} n ${JSON.stringify(normal)}`);
    perm[dest] = slot.index;
  }
  return perm;
}

const FACES_TURN = ["U", "D", "R", "L", "F", "B"] as const;

function moveList(): string[] {
  const moves: string[] = [];
  for (const face of FACES_TURN) {
    for (const kind of ["", "w", "inner"] as const) {
      for (const suffix of ["", "'", "2"]) {
        if (kind === "inner") moves.push(`2${face}${suffix}`);
        else if (kind === "w") moves.push(`${face}w${suffix}`);
        else moves.push(`${face}${suffix}`);
      }
    }
  }
  return moves;
}

export const FIVE_MOVES = moveList();

const MIDDLE_MOVES = ["U", "D", "R", "L", "F", "B"].flatMap((face) => [`3${face}`, `3${face}'`, `3${face}2`]);

const PERMS: Record<string, Uint8Array> = {};
const DESTS: Record<string, Uint16Array> = {};
for (const move of [...FIVE_MOVES, ...MIDDLE_MOVES]) {
  const perm = buildPerm(move);
  PERMS[move] = perm;
  const dest = new Uint16Array(FIVE_STICKERS);
  for (let index = 0; index < FIVE_STICKERS; index += 1) dest[perm[index]!] = index;
  DESTS[move] = dest;
}

export function fivePerm(move: string): Uint8Array {
  const perm = PERMS[move];
  if (!perm) throw new Error(`Unknown 5×5 move “${move}”`);
  return perm;
}

export function fiveDestination(move: string, source: number): number {
  const dest = DESTS[move];
  if (!dest) throw new Error(`Unknown 5×5 move “${move}”`);
  return dest[source] ?? source;
}

export function solvedFiveBytes(): Uint8Array {
  const bytes = new Uint8Array(FIVE_STICKERS);
  for (const slot of FIVE_SLOTS) bytes[slot.index] = colorIndex(HOME_CENTER[slot.face]);
  return bytes;
}

export function solvedFiveString(): string {
  return fiveToString(solvedFiveBytes());
}

export function fiveToString(state: Uint8Array): string {
  let text = "";
  for (let i = 0; i < state.length; i += 1) text += COLOR_LETTER[COLORS[state[i]!]!]!;
  return text;
}

export function fiveFromString(text: string): Uint8Array {
  if (text.length !== FIVE_STICKERS) throw new Error("A 5×5 colouring needs 150 stickers.");
  const bytes = new Uint8Array(FIVE_STICKERS);
  for (let i = 0; i < text.length; i += 1) {
    const index = COLORS.findIndex((color) => COLOR_LETTER[color] === text[i]);
    if (index < 0) throw new Error(`Unknown sticker “${text[i] ?? ""}”.`);
    bytes[i] = index;
  }
  return bytes;
}

const SCRATCH = new Uint8Array(FIVE_STICKERS);

export function applyFiveInto(state: Uint8Array, moves: readonly string[]): void {
  for (const move of moves) {
    const perm = fivePerm(move);
    for (let i = 0; i < FIVE_STICKERS; i += 1) SCRATCH[i] = state[perm[i]!]!;
    state.set(SCRATCH);
  }
}

export function applyFive(state: Uint8Array, moves: readonly string[]): Uint8Array {
  const next = new Uint8Array(state);
  applyFiveInto(next, moves);
  return next;
}

export function applyFiveString(text: string, moves: readonly string[]): string {
  return fiveToString(applyFive(fiveFromString(text), moves));
}

export function fiveFaceOf(index: number): Face {
  return FACES[Math.floor(index / 25)] ?? "F";
}

export function fiveIsCentre(index: number): boolean {
  return index % 25 === 12;
}

export function fiveCentreKind(index: number): "fixed" | "t" | "x" | "other" {
  const local = index % 25;
  const row = Math.floor(local / 5);
  const col = local % 5;
  if (row === 2 && col === 2) return "fixed";
  if (row < 1 || row > 3 || col < 1 || col > 3) return "other";
  if (row === 2 || col === 2) return "t";
  return "x";
}

export function fiveCentreSlots(face: Face, kind: "t" | "x" | "both" = "both"): number[] {
  const slots: number[] = [];
  for (let row = 1; row <= 3; row += 1) {
    for (let col = 1; col <= 3; col += 1) {
      if (row === 2 && col === 2) continue;
      const index = fiveOffset(face) + row * 5 + col;
      const found = fiveCentreKind(index);
      if (kind === "both" || found === kind) slots.push(index);
    }
  }
  return slots;
}

export interface FiveEdge {
  id: string;
  mid: [number, number];
  wings: [[number, number], [number, number]];
}

function stickersAt(grid: Vec): number[] {
  const found: number[] = [];
  for (const slot of FIVE_SLOTS) {
    if (slot.grid.x === grid.x && slot.grid.y === grid.y && slot.grid.z === grid.z) found.push(slot.index);
  }
  return found;
}

export const FIVE_EDGES: FiveEdge[] = (() => {
  const groups = new Map<string, { mid?: number[]; wings: number[][] }>();
  for (let x = -K; x <= K; x += 1) {
    for (let y = -K; y <= K; y += 1) {
      for (let z = -K; z <= K; z += 1) {
        const outer = [Math.abs(x) === K, Math.abs(y) === K, Math.abs(z) === K].filter(Boolean).length;
        if (outer !== 2) continue;
        const free = Math.abs(x) !== K ? x : Math.abs(y) !== K ? y : z;
        const key = `${Math.abs(x) === K ? x : "_"},${Math.abs(y) === K ? y : "_"},${Math.abs(z) === K ? z : "_"}`;
        const group = groups.get(key) ?? { wings: [] };
        const stickers = stickersAt({ x, y, z });
        if (free === 0) group.mid = stickers;
        else group.wings.push(stickers);
        groups.set(key, group);
      }
    }
  }
  return [...groups.entries()].map(([id, group]) => {
    if (!group.mid || group.mid.length !== 2 || group.wings.length !== 2) throw new Error(`Bad edge ${id}`);
    return {
      id,
      mid: [group.mid[0]!, group.mid[1]!] as [number, number],
      wings: group.wings.map((pair) => [pair[0]!, pair[1]!] as [number, number]) as [[number, number], [number, number]],
    };
  });
})();

export function fiveMoveSpeech(move: string): string {
  const parsed = parseFiveMove(move);
  const face = { U: "Up", D: "Down", F: "Front", B: "Back", R: "Right", L: "Left" }[parsed.face];
  const layer = parsed.wide ? "two layers" : parsed.depth === 3 ? "middle slice" : parsed.depth === 2 ? "inner slice" : "outer face";
  const turn = parsed.quarters === 2 ? "half turn" : parsed.quarters === 3 ? "anticlockwise" : "clockwise";
  return `${face} ${layer}, ${turn}.`;
}

export function randomFiveScramble(random: () => number, length = 44): string[] {
  // Middle-slice turns move the face centres. Scrambles stay on outer, wide,
  // and inner turns so a typed cube can keep the centres where the faces are.
  const turns = FIVE_MOVES.filter((move) => !move.startsWith("3"));
  const moves: string[] = [];
  let previous = "";
  while (moves.length < length) {
    const move = turns[Math.floor(random() * turns.length)]!;
    const face = parseFiveMove(move).face;
    if (face === previous) continue;
    previous = face;
    moves.push(move);
  }
  return moves;
}

export function validateFive(text: string): { ok: true } | { ok: false; message: string } {
  if (text.length !== FIVE_STICKERS) return { ok: false, message: "This colouring isn't possible on a real cube." };
  const counts = new Map<string, number>();
  for (const letter of text) {
    if (!"wyrogb".includes(letter)) return { ok: false, message: "This colouring isn't possible on a real cube." };
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  for (const letter of ["w", "y", "r", "o", "b", "g"]) {
    if (counts.get(letter) !== 25) return { ok: false, message: "Some colours don't add up — each colour needs 25 stickers." };
  }
  const home = solvedFiveString();
  for (const face of FACES) {
    const index = fiveOffset(face) + 12;
    if (text[index] !== home[index]) return { ok: false, message: "This colouring isn't possible on a real cube." };
  }
  const orbits = { t: new Map<string, number>(), x: new Map<string, number>() };
  for (let index = 0; index < text.length; index += 1) {
    const kind = fiveCentreKind(index);
    if (kind === "t" || kind === "x") orbits[kind].set(text[index]!, (orbits[kind].get(text[index]!) ?? 0) + 1);
  }
  for (const kind of ["t", "x"] as const) {
    for (const letter of ["w", "y", "r", "o", "b", "g"]) {
      if (orbits[kind].get(letter) !== 4) return { ok: false, message: "This colouring isn't possible on a real cube." };
    }
  }
  if (!piecesMatch(text)) return { ok: false, message: "This colouring isn't possible on a real cube." };
  const reduced = validateFaceletString(fiveReduction(text), { searchRotations: false });
  if (!reduced.ok) return { ok: false, message: "This colouring isn't possible on a real cube." };
  return { ok: true };
}

/** Corners and mid edges, in 3×3 facelet order. Wings and moving centres are left out. */
export function fiveReduction(text: string): string {
  let reduced = "";
  for (let face = 0; face < FACES.length; face += 1) {
    const offset = face * 25;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) reduced += text[offset + row * 10 + col * 2] ?? "";
    }
  }
  return reduced;
}

interface PieceSpec {
  kind: "corner" | "mid" | "wing";
  indexes: number[];
  key: string;
}

let pieceCatalogCache: PieceSpec[] | null = null;

function pieceCatalog(): PieceSpec[] {
  if (pieceCatalogCache) return pieceCatalogCache;
  const solved = solvedFiveString();
  const groups = new Map<string, { indexes: number[]; grid: Vec }>();
  for (const slot of FIVE_SLOTS) {
    const id = `${slot.grid.x},${slot.grid.y},${slot.grid.z}`;
    const group = groups.get(id) ?? { indexes: [], grid: slot.grid };
    group.indexes.push(slot.index);
    groups.set(id, group);
  }
  const catalog: PieceSpec[] = [];
  for (const group of groups.values()) {
    const coords = [group.grid.x, group.grid.y, group.grid.z];
    const outer = coords.filter((value) => Math.abs(value) === K).length;
    if (outer < 2) continue;
    const kind = outer === 3 ? "corner" : coords.some((value) => value === 0) ? "mid" : "wing";
    catalog.push({ kind, indexes: group.indexes, key: group.indexes.map((index) => solved[index]).sort().join("") });
  }
  pieceCatalogCache = catalog;
  return catalog;
}

function piecesMatch(text: string): boolean {
  const expected = new Map<string, number>();
  const found = new Map<string, number>();
  for (const piece of pieceCatalog()) {
    const home = `${piece.kind}:${piece.key}`;
    expected.set(home, (expected.get(home) ?? 0) + 1);
    const key = piece.indexes.map((index) => text[index]).sort().join("");
    const id = `${piece.kind}:${key}`;
    found.set(id, (found.get(id) ?? 0) + 1);
  }
  if (found.size !== expected.size) return false;
  for (const [id, count] of expected) if (found.get(id) !== count) return false;
  return true;
}

export function fiveCentersSolved(state: Uint8Array): boolean {
  for (const face of FACES) {
    const color = colorIndex(HOME_CENTER[face]);
    for (const slot of fiveCentreSlots(face)) if (state[slot] !== color) return false;
  }
  return true;
}

export function fiveFixedCenters(state: Uint8Array): ColorName[] {
  return FACES.map((face) => COLORS[state[fiveOffset(face) + 12]!]!);
}

export { HOME_CENTER };
