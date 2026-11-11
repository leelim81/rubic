/**
 * Geometric 4×4 model.
 *
 * The grid is −3, −1, 1, 3 so every layer is an integer and the cube stays
 * centred. A clockwise turn is the quarter turn you see when looking at that
 * face. Outer turns are U, wide turns are Uw, and the inner slice is 2U so it
 * stays distinct from the half turn U2. There is no fixed centre: each face
 * has a 2×2 of centre pieces.
 *
 * Home hold matches the 3×3: yellow on top, white on the bottom, green in
 * front, blue at the back, orange on the right, red on the left.
 */

import { COLOR_LETTER, COLORS, FACES, HOME_CENTER, type Face, type Vec, colorIndex } from "./model";

export const FOUR = 4;
export const FOUR_STICKERS = 96;
const LAYER = [-3, -1, 1, 3] as const;

const FACE_INDEX: Record<Face, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

export function fourOffset(face: Face): number {
  return FACE_INDEX[face] * 16;
}

const NORMAL: Record<Face, Vec> = {
  U: { x: 0, y: 1, z: 0 },
  D: { x: 0, y: -1, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  B: { x: 0, y: 0, z: -1 },
  R: { x: 1, y: 0, z: 0 },
  L: { x: -1, y: 0, z: 0 },
};

export interface FourSlot {
  index: number;
  face: Face;
  row: number;
  col: number;
  grid: Vec;
  normal: Vec;
}

function layerOf(index: number): number {
  return LAYER[index] ?? 0;
}

function gridPosition(face: Face, row: number, col: number): Vec {
  const r = layerOf(row);
  const c = layerOf(col);
  switch (face) {
    case "U":
      return { x: c, y: 3, z: r };
    case "D":
      return { x: c, y: -3, z: -r };
    case "F":
      return { x: c, y: -r, z: 3 };
    case "B":
      return { x: -c, y: -r, z: -3 };
    case "R":
      return { x: 3, y: -r, z: -c };
    case "L":
      return { x: -3, y: -r, z: c };
  }
}

export const FOUR_SLOTS: FourSlot[] = FACES.flatMap((face) => {
  const slots: FourSlot[] = [];
  for (let row = 0; row < FOUR; row += 1) {
    for (let col = 0; col < FOUR; col += 1) {
      slots.push({
        index: fourOffset(face) + row * FOUR + col,
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

function geomKey(pos: Vec, normal: Vec): string {
  return `${pos.x},${pos.y},${pos.z}|${normal.x},${normal.y},${normal.z}`;
}

const SLOT_BY_GEOM = new Map<string, number>();
for (const slot of FOUR_SLOTS) SLOT_BY_GEOM.set(geomKey(slot.grid, slot.normal), slot.index);

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

export interface ParsedFour {
  face: Face;
  depth: 1 | 2;
  wide: boolean;
  quarters: 1 | 2 | 3;
}

export function parseFourMove(move: string): ParsedFour {
  let rest = move;
  let depth: 1 | 2 = 1;
  if (/^2[URFDLB]/.test(rest)) {
    depth = 2;
    rest = rest.slice(1);
  }
  const face = rest[0] ?? "";
  if (!FACES.includes(face as Face)) throw new Error(`Unknown 4×4 move “${move}”`);
  rest = rest.slice(1);
  const wide = rest.startsWith("w");
  if (wide) rest = rest.slice(1);
  if (depth !== 1 && wide) throw new Error(`Unknown 4×4 move “${move}”`);
  const quarters = rest === "" ? 1 : rest === "'" ? 3 : rest === "2" ? 2 : 0;
  if (!quarters) throw new Error(`Unknown 4×4 move “${move}”`);
  return { face: face as Face, depth, wide, quarters };
}

export function formatFourMove(move: ParsedFour): string {
  const suffix = move.quarters === 2 ? "2" : move.quarters === 3 ? "'" : "";
  if (move.wide) return `${move.face}w${suffix}`;
  if (move.depth === 2) return `2${move.face}${suffix}`;
  return `${move.face}${suffix}`;
}

export function invertFourMove(move: string): string {
  const parsed = parseFourMove(move);
  return formatFourMove({ ...parsed, quarters: ((4 - parsed.quarters) % 4 || 4) as 1 | 2 | 3 });
}

function axisOf(face: Face): "x" | "y" | "z" {
  if (face === "R" || face === "L") return "x";
  if (face === "U" || face === "D") return "y";
  return "z";
}

function layerCoord(face: Face, depth: 1 | 2): number {
  const sign = face === "D" || face === "L" || face === "B" ? -1 : 1;
  return sign * (depth === 1 ? 3 : 1);
}

function onTurn(grid: Vec, move: ParsedFour): boolean {
  const value = grid[axisOf(move.face)];
  if (move.wide) return value === layerCoord(move.face, 1) || value === layerCoord(move.face, 2);
  return value === layerCoord(move.face, move.depth);
}

function buildPerm(text: string): Uint8Array {
  const move = parseFourMove(text);
  const perm = new Uint8Array(FOUR_STICKERS);
  for (let i = 0; i < FOUR_STICKERS; i += 1) perm[i] = i;
  for (const slot of FOUR_SLOTS) {
    if (!onTurn(slot.grid, move)) continue;
    let pos = slot.grid;
    let normal = slot.normal;
    for (let turn = 0; turn < move.quarters; turn += 1) {
      pos = quarter(pos, move.face);
      normal = quarter(normal, move.face);
    }
    const dest = SLOT_BY_GEOM.get(geomKey(pos, normal));
    if (dest === undefined) throw new Error(`Move ${text} left the cube`);
    perm[dest] = slot.index;
  }
  return perm;
}

function moveList(): string[] {
  const moves: string[] = [];
  for (const face of ["U", "D", "R", "L", "F", "B"] as const) {
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

export const FOUR_MOVES = moveList();

const PERMS: Record<string, Uint8Array> = {};
for (const move of FOUR_MOVES) PERMS[move] = buildPerm(move);

export function fourPerm(move: string): Uint8Array {
  const perm = PERMS[move];
  if (!perm) throw new Error(`Unknown 4×4 move “${move}”`);
  return perm;
}

export function solvedFourBytes(): Uint8Array {
  const bytes = new Uint8Array(FOUR_STICKERS);
  for (const slot of FOUR_SLOTS) bytes[slot.index] = colorIndex(HOME_CENTER[slot.face]);
  return bytes;
}

export function solvedFourString(): string {
  return fourToString(solvedFourBytes());
}

export function fourToString(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < FOUR_STICKERS; i += 1) text += COLOR_LETTER[COLORS[bytes[i]!]!] ?? "?";
  return text;
}

export function fourFromString(text: string): Uint8Array {
  if (text.length !== FOUR_STICKERS) throw new Error("A 4×4 colouring needs 96 stickers.");
  const bytes = new Uint8Array(FOUR_STICKERS);
  for (let i = 0; i < text.length; i += 1) {
    const name = COLORS.find((color) => COLOR_LETTER[color] === text[i]);
    if (!name) throw new Error("A 4×4 colouring needs the letters w, y, r, o, b and g.");
    bytes[i] = colorIndex(name);
  }
  return bytes;
}

const SCRATCH = new Uint8Array(FOUR_STICKERS);

export function applyFourInto(state: Uint8Array, moves: readonly string[]): void {
  for (const move of moves) {
    const perm = fourPerm(move);
    for (let i = 0; i < FOUR_STICKERS; i += 1) SCRATCH[i] = state[perm[i]!]!;
    state.set(SCRATCH);
  }
}

export function applyFour(state: Uint8Array, moves: readonly string[]): Uint8Array {
  const next = new Uint8Array(state);
  applyFourInto(next, moves);
  return next;
}

export function applyFourString(text: string, moves: readonly string[]): string {
  return fourToString(applyFour(fourFromString(text), moves));
}

export function fourCentreSlots(face: Face): number[] {
  const base = fourOffset(face);
  const slots: number[] = [];
  for (const row of [1, 2]) {
    for (const col of [1, 2]) slots.push(base + row * 4 + col);
  }
  return slots;
}

export const FOUR_CENTRES = FACES.flatMap((face) => fourCentreSlots(face));

export interface FourWing {
  slots: [number, number];
}

export interface FourEdge {
  id: string;
  wings: [FourWing, FourWing];
}

function edgeKey(grid: Vec): string | null {
  const axes: string[] = [];
  for (const [axis, value] of [["x", grid.x], ["y", grid.y], ["z", grid.z]] as const) {
    if (Math.abs(value) === 3) axes.push(`${axis}${value}`);
    else if (Math.abs(value) !== 1) return null;
  }
  return axes.length === 2 ? axes.join(",") : null;
}

/** Two wings on each of the twelve edges. Each wing lists its two stickers. */
export const FOUR_EDGES: FourEdge[] = (() => {
  const cubies = new Map<string, Map<string, number[]>>();
  for (const slot of FOUR_SLOTS) {
    const key = edgeKey(slot.grid);
    if (!key) continue;
    const cubie = `${slot.grid.x},${slot.grid.y},${slot.grid.z}`;
    const group = cubies.get(key) ?? new Map<string, number[]>();
    const stickers = group.get(cubie) ?? [];
    stickers.push(slot.index);
    group.set(cubie, stickers);
    cubies.set(key, group);
  }
  return [...cubies.entries()].map(([id, wings]) => {
    const pair = [...wings.values()];
    if (pair.length !== 2 || pair.some((wing) => wing.length !== 2)) throw new Error(`Bad edge ${id}`);
    return {
      id,
      wings: [
        { slots: [pair[0]![0]!, pair[0]![1]!] },
        { slots: [pair[1]![0]!, pair[1]![1]!] },
      ],
    };
  });
})();

export function fourMoveSpeech(move: string): string {
  const parsed = parseFourMove(move);
  const face = { U: "Up", D: "Down", F: "Front", B: "Back", R: "Right", L: "Left" }[parsed.face];
  const layer = parsed.wide ? "two layers" : parsed.depth === 2 ? "inner slice" : "outer face";
  const turn = parsed.quarters === 2 ? "half turn" : parsed.quarters === 3 ? "anticlockwise" : "clockwise";
  return `${face} ${layer}, ${turn}.`;
}

export function randomFourScramble(random: () => number, length = 40): string[] {
  const moves: string[] = [];
  let previous = "";
  while (moves.length < length) {
    const move = FOUR_MOVES[Math.floor(random() * FOUR_MOVES.length)]!;
    const face = parseFourMove(move).face;
    if (face === previous) continue;
    previous = face;
    moves.push(move);
  }
  return moves;
}

const OPPOSITE: Record<string, string> = { y: "w", w: "y", r: "o", o: "r", g: "b", b: "g" };

function pieceKey(colors: string[]): string {
  return [...colors].sort().join("");
}

export function validateFour(text: string): { ok: true } | { ok: false; message: string } {
  if (text.length !== FOUR_STICKERS) return { ok: false, message: "This colouring isn't possible on a real cube." };
  const counts = new Map<string, number>();
  for (const letter of text) {
    if (!"wyrogb".includes(letter)) return { ok: false, message: "This colouring isn't possible on a real cube." };
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  for (const letter of ["w", "y", "r", "o", "b", "g"]) {
    if (counts.get(letter) !== 16) return { ok: false, message: "Some colours don't add up — each colour needs 16 stickers." };
  }
  const centerCounts = new Map<string, number>();
  for (const slot of FOUR_CENTRES) centerCounts.set(text[slot]!, (centerCounts.get(text[slot]!) ?? 0) + 1);
  for (const letter of ["w", "y", "r", "o", "b", "g"]) {
    if (centerCounts.get(letter) !== 4) return { ok: false, message: "The centre pieces aren't a solvable set." };
  }
  const solved = solvedFourString();
  const homeCorners = new Set<string>();
  for (const corner of cornerSlots()) homeCorners.add(pieceKey(corner.map((slot) => solved[slot]!)));
  const seenCorners = new Set<string>();
  for (const corner of cornerSlots()) {
    const key = pieceKey(corner.map((slot) => text[slot]!));
    if (!homeCorners.has(key) || seenCorners.has(key)) return { ok: false, message: "A corner on this cube isn't a real corner piece." };
    seenCorners.add(key);
  }
  const homeWings = new Map<string, number>();
  for (const edge of FOUR_EDGES) {
    for (const wing of edge.wings) {
      const key = pieceKey(wing.slots.map((slot) => solved[slot]!));
      homeWings.set(key, (homeWings.get(key) ?? 0) + 1);
    }
  }
  const seenWings = new Map<string, number>();
  for (const edge of FOUR_EDGES) {
    for (const wing of edge.wings) {
      const colors = wing.slots.map((slot) => text[slot]!);
      if (colors[0] === colors[1] || OPPOSITE[colors[0]!] === colors[1]) return { ok: false, message: "An edge wing has colours that can't sit together." };
      const key = pieceKey(colors);
      if (!homeWings.has(key)) return { ok: false, message: "An edge wing isn't a real piece." };
      seenWings.set(key, (seenWings.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of homeWings) {
    if (seenWings.get(key) !== count) return { ok: false, message: "An edge wing is missing or repeated." };
  }
  return { ok: true };
}

function cornerSlots(): number[][] {
  const cubies = new Map<string, number[]>();
  for (const slot of FOUR_SLOTS) {
    if (Math.abs(slot.grid.x) !== 3 || Math.abs(slot.grid.y) !== 3 || Math.abs(slot.grid.z) !== 3) continue;
    const key = `${slot.grid.x},${slot.grid.y},${slot.grid.z}`;
    const stickers = cubies.get(key) ?? [];
    stickers.push(slot.index);
    cubies.set(key, stickers);
  }
  return [...cubies.values()].map((stickers) => {
    if (stickers.length !== 3) throw new Error("A corner is missing a sticker.");
    return stickers;
  });
}
