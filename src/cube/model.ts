/**
 * Geometric 3×3 model.
 *
 * Coordinates: +x right, +y up, +z front. A clockwise face turn is the
 * quarter-turn you see when looking straight at that face. Those turns were
 * checked against the standard edge cycles (U sends UF to UL, R sends UR to BR,
 * F sends UF to FR, and the matching cycles for D, L and B).
 *
 * Home / teaching hold (a z2 rotation of the usual Western scheme):
 * yellow on top, white on the bottom, green in front, blue at the back,
 * orange on the right, red on the left. R means the right face, not red.
 */

export const COLORS = ["white", "yellow", "red", "orange", "blue", "green"] as const;
export type ColorName = (typeof COLORS)[number];

export const FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type Face = (typeof FACES)[number];

export const HOME_CENTER: Record<Face, ColorName> = {
  U: "yellow",
  R: "orange",
  F: "green",
  D: "white",
  L: "red",
  B: "blue",
};

export const OPPOSITE_COLOR: Record<ColorName, ColorName> = {
  white: "yellow",
  yellow: "white",
  red: "orange",
  orange: "red",
  blue: "green",
  green: "blue",
};

export const OPPOSITE_FACE: Record<Face, Face> = {
  U: "D",
  D: "U",
  R: "L",
  L: "R",
  F: "B",
  B: "F",
};

export const COLOR_LETTER: Record<ColorName, string> = {
  white: "w",
  yellow: "y",
  red: "r",
  orange: "o",
  blue: "b",
  green: "g",
};

export const LETTER_COLOR: Record<string, ColorName> = {
  w: "white",
  y: "yellow",
  r: "red",
  o: "orange",
  b: "blue",
  g: "green",
};

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface Slot {
  index: number;
  face: Face;
  pos: Vec;
  normal: Vec;
  row: number;
  col: number;
}

const FACE_INDEX: Record<Face, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

export function faceOffset(face: Face): number {
  return FACE_INDEX[face] * 9;
}

function slotPosition(face: Face, row: number, col: number): Vec {
  switch (face) {
    case "U":
      return { x: col - 1, y: 1, z: row - 1 };
    case "D":
      return { x: col - 1, y: -1, z: 1 - row };
    case "F":
      return { x: col - 1, y: 1 - row, z: 1 };
    case "B":
      return { x: 1 - col, y: 1 - row, z: -1 };
    case "R":
      return { x: 1, y: 1 - row, z: 1 - col };
    case "L":
      return { x: -1, y: 1 - row, z: col - 1 };
  }
}

const NORMAL: Record<Face, Vec> = {
  U: { x: 0, y: 1, z: 0 },
  D: { x: 0, y: -1, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  B: { x: 0, y: 0, z: -1 },
  R: { x: 1, y: 0, z: 0 },
  L: { x: -1, y: 0, z: 0 },
};

export const SLOTS: Slot[] = FACES.flatMap((face) => {
  const slots: Slot[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      slots.push({
        index: faceOffset(face) + row * 3 + col,
        face,
        row,
        col,
        pos: slotPosition(face, row, col),
        normal: NORMAL[face],
      });
    }
  }
  return slots;
});

const SLOT_BY_GEOM = new Map<string, number>();
for (const slot of SLOTS) {
  SLOT_BY_GEOM.set(geomKey(slot.pos, slot.normal), slot.index);
}

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

function quarterAxis(v: Vec, axis: "x" | "y" | "z"): Vec {
  if (axis === "x") return quarter(v, "R");
  if (axis === "y") return quarter(v, "U");
  return quarter(v, "F");
}

function onLayer(pos: Vec, face: Face): boolean {
  switch (face) {
    case "U":
      return pos.y === 1;
    case "D":
      return pos.y === -1;
    case "R":
      return pos.x === 1;
    case "L":
      return pos.x === -1;
    case "F":
      return pos.z === 1;
    case "B":
      return pos.z === -1;
  }
}

function turnVec(v: Vec, kind: string): Vec {
  const face = kind[0]!;
  const quarters = kind.endsWith("2") ? 2 : kind.endsWith("'") ? 3 : 1;
  let out = v;
  if (face === "x" || face === "y" || face === "z") {
    for (let i = 0; i < quarters; i++) out = quarterAxis(out, face);
    return out;
  }
  for (let i = 0; i < quarters; i++) out = quarter(out, face as Face);
  return out;
}

/** perm[i] is the source slot whose colour moves into slot i. */
function buildPerm(kind: string): Uint8Array {
  const perm = new Uint8Array(54);
  for (let i = 0; i < 54; i++) perm[i] = i;
  const face = kind[0]!;
  const whole = face === "x" || face === "y" || face === "z";
  for (const slot of SLOTS) {
    if (!whole && !onLayer(slot.pos, face as Face)) continue;
    const destPos = turnVec(slot.pos, kind);
    const destNormal = turnVec(slot.normal, kind);
    const dest = SLOT_BY_GEOM.get(geomKey(destPos, destNormal));
    if (dest === undefined) throw new Error(`Move ${kind} sent a sticker off the cube`);
    perm[dest] = slot.index;
  }
  return perm;
}

export const BASIC_MOVES = [
  "U",
  "U'",
  "U2",
  "D",
  "D'",
  "D2",
  "F",
  "F'",
  "F2",
  "B",
  "B'",
  "B2",
  "R",
  "R'",
  "R2",
  "L",
  "L'",
  "L2",
  "x",
  "x'",
  "x2",
  "y",
  "y'",
  "y2",
  "z",
  "z'",
  "z2",
] as const;

export type MoveName = (typeof BASIC_MOVES)[number];

const PERMS: Record<string, Uint8Array> = {};
for (const move of BASIC_MOVES) PERMS[move] = buildPerm(move);

const TOKEN = /^([URFDLBxyz])(2|'|’)?$/;

export function parseAlg(alg: string): string[] {
  const parts = alg.trim().split(/\s+/).filter(Boolean);
  const moves: string[] = [];
  for (const part of parts) {
    const match = TOKEN.exec(part);
    if (!match) throw new Error(`Unknown move “${part}”`);
    const suffix = match[2] === "’" ? "'" : (match[2] ?? "");
    moves.push(`${match[1]}${suffix}`);
  }
  return moves;
}

export function invertMove(move: string): string {
  if (move.endsWith("2")) return move;
  if (move.endsWith("'")) return move[0]!;
  return `${move[0]}'`;
}

export function invertAlg(moves: readonly string[]): string[] {
  return moves.map(invertMove).reverse();
}

export function colorIndex(color: ColorName): number {
  return COLORS.indexOf(color);
}

export function colorFromIndex(index: number): ColorName {
  const color = COLORS[index];
  if (!color) throw new Error(`Bad colour index ${index}`);
  return color;
}

export function solvedBytes(): Uint8Array {
  const bytes = new Uint8Array(54);
  for (const slot of SLOTS) bytes[slot.index] = colorIndex(HOME_CENTER[slot.face]);
  return bytes;
}

export function copyBytes(state: Uint8Array): Uint8Array {
  const next = new Uint8Array(state.length);
  next.set(state);
  return next;
}

export function applyMoves(state: Uint8Array, moves: readonly string[]): Uint8Array {
  const next = copyBytes(state);
  applyMovesInto(next, moves);
  return next;
}

export function applyMovesInto(state: Uint8Array, moves: readonly string[]): void {
  const scratch = new Uint8Array(54);
  for (const move of moves) {
    const perm = PERMS[move];
    if (!perm) throw new Error(`Unknown move “${move}”`);
    for (let i = 0; i < 54; i++) scratch[i] = state[perm[i]!]!;
    state.set(scratch);
  }
}

/** perm[destination] is the sticker that moves there, for a whole algorithm. */
export function slotSources(moves: readonly string[]): Uint8Array {
  const perm = new Uint8Array(54);
  for (let i = 0; i < 54; i++) perm[i] = i;
  for (const move of moves) {
    const step = PERMS[move];
    if (!step) throw new Error(`Unknown move “${move}”`);
    const next = new Uint8Array(54);
    for (let i = 0; i < 54; i++) next[i] = perm[step[i]!]!;
    perm.set(next);
  }
  return perm;
}

export function faceletsToString(state: Uint8Array): string {
  let out = "";
  for (let i = 0; i < 54; i++) out += COLOR_LETTER[colorFromIndex(state[i]!)];
  return out;
}

export function stringToFacelets(value: string): Uint8Array {
  if (value.length !== 54) throw new Error("A cube facelet string must be 54 colours");
  const bytes = new Uint8Array(54);
  for (let i = 0; i < 54; i++) {
    const color = LETTER_COLOR[value[i]!];
    if (!color) throw new Error(`Bad facelet letter “${value[i]}”`);
    bytes[i] = colorIndex(color);
  }
  return bytes;
}

export function centerIndex(state: Uint8Array, face: Face): number {
  return state[faceOffset(face) + 4]!;
}

export function centerColor(state: Uint8Array, face: Face): ColorName {
  return colorFromIndex(centerIndex(state, face));
}

export function matchesCenters(state: Uint8Array): boolean {
  for (const slot of SLOTS) {
    if (state[slot.index] !== centerIndex(state, slot.face)) return false;
  }
  return true;
}

export function centersAreHome(state: Uint8Array): boolean {
  return FACES.every((face) => centerColor(state, face) === HOME_CENTER[face]);
}

export function colorsOfFace(state: Uint8Array, face: Face): ColorName[] {
  const start = faceOffset(face);
  const colors: ColorName[] = [];
  for (let i = 0; i < 9; i++) colors.push(colorFromIndex(state[start + i]!));
  return colors;
}

export function faceletColors(state: Uint8Array): ColorName[] {
  return Array.from(state, (value) => colorFromIndex(value));
}

/** Where the front/top/side edge of a face travels, from the solver's view. */
export function moveDirection(move: string): string {
  const base = move[0]!;
  const prime = move.endsWith("'");
  const table: Record<string, [string, string]> = {
    U: ["the front edge of the top moves left", "the front edge of the top moves right"],
    D: ["the front edge of the bottom moves right", "the front edge of the bottom moves left"],
    R: ["the front edge of the right face moves up", "the front edge of the right face moves down"],
    L: ["the front edge of the left face moves down", "the front edge of the left face moves up"],
    F: ["the top edge of the front face moves right", "the top edge of the front face moves left"],
    B: ["the top edge of the back face moves left (as you look at the cube)", "the top edge of the back face moves right"],
    x: ["the whole cube rolls so the top comes toward you", "the whole cube rolls so the top goes away from you"],
    y: ["the whole cube turns clockwise as seen from above", "the whole cube turns anticlockwise as seen from above"],
    z: ["the whole cube rolls clockwise as you look at the front", "the whole cube rolls anticlockwise as you look at the front"],
  };
  const pair = table[base];
  if (!pair) return move;
  if (move.endsWith("2")) return `${pair[0].replace("moves", "moves halfway; a half turn also means")}`.replace(
    /moves.*/,
    "makes a half turn",
  );
  return prime ? pair[1] : pair[0];
}

export function rotationToHome(state: Uint8Array): string[] {
  if (centersAreHome(state)) return [];
  const rotations = ["", "x", "x2", "x'", "y", "y'", "y2", "z", "z'", "z2"];
  type Node = { moves: string[]; bytes: Uint8Array };
  const queue: Node[] = [{ moves: [], bytes: copyBytes(state) }];
  const seen = new Set<string>();
  seen.add(centerKey(state));
  while (queue.length) {
    const current = queue.shift()!;
    if (current.moves.length >= 3) continue;
    for (const move of rotations) {
      if (!move) continue;
      const next = applyMoves(current.bytes, [move]);
      const key = centerKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      const moves = [...current.moves, move];
      if (centersAreHome(next)) return moves;
      queue.push({ moves, bytes: next });
    }
  }
  return [];
}

function centerKey(state: Uint8Array): string {
  return FACES.map((face) => centerIndex(state, face)).join("");
}

export interface PieceSpot {
  kind: "edge" | "corner";
  /** Slot position key, such as UF or URF. */
  place: string;
  colors: ColorName[];
  /** 0 when the polar (or green/blue) sticker sits on its reference face. */
  ori: number;
  faceletIndexes: number[];
}

const EDGE_PLACES: { place: string; pos: Vec; normals: [Vec, Vec] }[] = [
  { place: "UR", pos: { x: 1, y: 1, z: 0 }, normals: [NORMAL.U, NORMAL.R] },
  { place: "UF", pos: { x: 0, y: 1, z: 1 }, normals: [NORMAL.U, NORMAL.F] },
  { place: "UL", pos: { x: -1, y: 1, z: 0 }, normals: [NORMAL.U, NORMAL.L] },
  { place: "UB", pos: { x: 0, y: 1, z: -1 }, normals: [NORMAL.U, NORMAL.B] },
  { place: "DR", pos: { x: 1, y: -1, z: 0 }, normals: [NORMAL.D, NORMAL.R] },
  { place: "DF", pos: { x: 0, y: -1, z: 1 }, normals: [NORMAL.D, NORMAL.F] },
  { place: "DL", pos: { x: -1, y: -1, z: 0 }, normals: [NORMAL.D, NORMAL.L] },
  { place: "DB", pos: { x: 0, y: -1, z: -1 }, normals: [NORMAL.D, NORMAL.B] },
  { place: "FR", pos: { x: 1, y: 0, z: 1 }, normals: [NORMAL.F, NORMAL.R] },
  { place: "FL", pos: { x: -1, y: 0, z: 1 }, normals: [NORMAL.F, NORMAL.L] },
  { place: "BL", pos: { x: -1, y: 0, z: -1 }, normals: [NORMAL.B, NORMAL.L] },
  { place: "BR", pos: { x: 1, y: 0, z: -1 }, normals: [NORMAL.B, NORMAL.R] },
];

const CORNER_PLACES: { place: string; pos: Vec; normals: [Vec, Vec, Vec] }[] = [
  { place: "URF", pos: { x: 1, y: 1, z: 1 }, normals: [NORMAL.U, NORMAL.R, NORMAL.F] },
  { place: "UFL", pos: { x: -1, y: 1, z: 1 }, normals: [NORMAL.U, NORMAL.F, NORMAL.L] },
  { place: "ULB", pos: { x: -1, y: 1, z: -1 }, normals: [NORMAL.U, NORMAL.L, NORMAL.B] },
  { place: "UBR", pos: { x: 1, y: 1, z: -1 }, normals: [NORMAL.U, NORMAL.B, NORMAL.R] },
  { place: "DFR", pos: { x: 1, y: -1, z: 1 }, normals: [NORMAL.D, NORMAL.F, NORMAL.R] },
  { place: "DLF", pos: { x: -1, y: -1, z: 1 }, normals: [NORMAL.D, NORMAL.L, NORMAL.F] },
  { place: "DBL", pos: { x: -1, y: -1, z: -1 }, normals: [NORMAL.D, NORMAL.B, NORMAL.L] },
  { place: "DRB", pos: { x: 1, y: -1, z: -1 }, normals: [NORMAL.D, NORMAL.R, NORMAL.B] },
];

function stickerAt(pos: Vec, normal: Vec): number {
  const index = SLOT_BY_GEOM.get(geomKey(pos, normal));
  if (index === undefined) throw new Error("Missing sticker");
  return index;
}

export function readEdges(state: Uint8Array): PieceSpot[] {
  return EDGE_PLACES.map((edge) => {
    const indexes = edge.normals.map((normal) => stickerAt(edge.pos, normal));
    const colors = indexes.map((index) => colorFromIndex(state[index]!));
    const piece = EDGE_PIECE_ORDER.findIndex((ordered) => sameSet(ordered, colors));
    const ordered = piece >= 0 ? EDGE_PIECE_ORDER[piece]! : null;
    const ori = ordered && colors[0] === ordered[0] ? 0 : 1;
    return { kind: "edge" as const, place: edge.place, colors, ori, faceletIndexes: indexes };
  });
}

export function readCorners(state: Uint8Array): PieceSpot[] {
  return CORNER_PLACES.map((corner) => {
    const indexes = corner.normals.map((normal) => stickerAt(corner.pos, normal));
    const colors = indexes.map((index) => colorFromIndex(state[index]!));
    const piece = CORNER_PIECE_ORDER.findIndex((ordered) => sameSet(ordered, colors));
    const ordered = piece >= 0 ? CORNER_PIECE_ORDER[piece]! : null;
    let ori = 0;
    if (ordered) {
      ori = -1;
      for (let twist = 0; twist < 3; twist++) {
        const matches = colors.every((color, index) => color === ordered[(index - twist + 3) % 3]);
        if (matches) ori = twist;
      }
    }
    return { kind: "corner" as const, place: corner.place, colors, ori, faceletIndexes: indexes };
  });
}

export const EDGE_PIECE_ORDER: [ColorName, ColorName][] = [
  ["yellow", "orange"],
  ["yellow", "green"],
  ["yellow", "red"],
  ["yellow", "blue"],
  ["white", "orange"],
  ["white", "green"],
  ["white", "red"],
  ["white", "blue"],
  ["green", "orange"],
  ["green", "red"],
  ["blue", "red"],
  ["blue", "orange"],
];

export const CORNER_PIECE_ORDER: [ColorName, ColorName, ColorName][] = [
  ["yellow", "orange", "green"],
  ["yellow", "green", "red"],
  ["yellow", "red", "blue"],
  ["yellow", "blue", "orange"],
  ["white", "green", "orange"],
  ["white", "red", "green"],
  ["white", "blue", "red"],
  ["white", "orange", "blue"],
];

function sameSet(a: readonly ColorName[], b: readonly ColorName[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((color, index) => color === right[index]);
}

export interface CubieRead {
  edges: { piece: number; ori: number; place: string }[];
  corners: { piece: number; ori: number; place: string }[];
  duplicateEdges: string[];
  duplicateCorners: string[];
  unknownEdges: string[];
  unknownCorners: string[];
  edgePerm: number[];
  cornerPerm: number[];
  edgeOri: number[];
  cornerOri: number[];
}

export function readCubies(state: Uint8Array): CubieRead {
  const edges = readEdges(state);
  const corners = readCorners(state);
  const edgePerm = Array(12).fill(-1);
  const cornerPerm = Array(8).fill(-1);
  const edgeOri = Array(12).fill(0);
  const cornerOri = Array(8).fill(0);
  const duplicateEdges: string[] = [];
  const duplicateCorners: string[] = [];
  const unknownEdges: string[] = [];
  const unknownCorners: string[] = [];
  const seenEdge = new Map<number, string>();
  edges.forEach((edge, slot) => {
    const piece = EDGE_PIECE_ORDER.findIndex((colors) => sameSet(colors, edge.colors));
    if (piece < 0) {
      unknownEdges.push(edge.colors.join("-"));
      return;
    }
    if (seenEdge.has(piece)) duplicateEdges.push(edge.colors.slice().sort().join("-"));
    seenEdge.set(piece, edge.place);
    edgePerm[slot] = piece;
    edgeOri[slot] = edge.ori;
  });
  const seenCorner = new Map<number, string>();
  corners.forEach((corner, slot) => {
    const piece = CORNER_PIECE_ORDER.findIndex((colors) => sameSet(colors, corner.colors));
    if (piece < 0 || corner.ori < 0) {
      unknownCorners.push(corner.colors.join("-"));
      return;
    }
    if (seenCorner.has(piece)) duplicateCorners.push(corner.colors.slice().sort().join("-"));
    seenCorner.set(piece, corner.place);
    cornerPerm[slot] = piece;
    cornerOri[slot] = corner.ori;
  });
  return {
    edges: edges.map((edge, slot) => ({ piece: edgePerm[slot]!, ori: edge.ori, place: edge.place })),
    corners: corners.map((corner, slot) => ({ piece: cornerPerm[slot]!, ori: corner.ori, place: corner.place })),
    duplicateEdges,
    duplicateCorners,
    unknownEdges,
    unknownCorners,
    edgePerm,
    cornerPerm,
    edgeOri,
    cornerOri,
  };
}

export function permutationParity(perm: readonly number[]): 0 | 1 | null {
  if (perm.some((value) => value < 0)) return null;
  const seen = new Array(perm.length).fill(false);
  let transpositions = 0;
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let length = 0;
    let cursor = i;
    while (!seen[cursor]) {
      seen[cursor] = true;
      cursor = perm[cursor]!;
      length++;
      if (length > perm.length) return null;
    }
    transpositions += length - 1;
  }
  return (transpositions % 2) as 0 | 1;
}

/** Paint an arbitrary cubie state, including illegal ones, in the home hold. */
export function faceletsFromCubie(args: {
  edgePerm: number[];
  edgeOri: number[];
  cornerPerm: number[];
  cornerOri: number[];
}): Uint8Array {
  const bytes = solvedBytes();
  for (let slot = 0; slot < 12; slot++) {
    const edge = EDGE_PLACES[slot]!;
    const piece = args.edgePerm[slot]!;
    const colors = EDGE_PIECE_ORDER[piece]!;
    const ori = args.edgeOri[slot]! % 2;
    const indexes = edge.normals.map((normal) => stickerAt(edge.pos, normal));
    bytes[indexes[0]!] = colorIndex(colors[ori]!);
    bytes[indexes[1]!] = colorIndex(colors[1 - ori]!);
  }
  for (let slot = 0; slot < 8; slot++) {
    const corner = CORNER_PLACES[slot]!;
    const piece = args.cornerPerm[slot]!;
    const colors = CORNER_PIECE_ORDER[piece]!;
    const ori = args.cornerOri[slot]! % 3;
    const indexes = corner.normals.map((normal) => stickerAt(corner.pos, normal));
    for (let n = 0; n < 3; n++) {
      bytes[indexes[(n + ori) % 3]!] = colorIndex(colors[n]!);
    }
  }
  return bytes;
}

export function findEdge(state: Uint8Array, a: ColorName, b: ColorName): PieceSpot | null {
  return readEdges(state).find((edge) => sameSet(edge.colors, [a, b])) ?? null;
}

export function findCorner(state: Uint8Array, colors: ColorName[]): PieceSpot | null {
  return readCorners(state).find((corner) => sameSet(corner.colors, colors)) ?? null;
}

export function colorOn(state: Uint8Array, pos: Vec, normal: Vec): ColorName {
  return colorFromIndex(state[stickerAt(pos, normal)]!);
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const FACE_TURNS = ["U", "D", "F", "B", "R", "L"] as const;

export function randomScramble(rng: () => number, length = 22): string[] {
  const moves: string[] = [];
  let previous = "";
  const suffixes = ["", "'", "2"];
  while (moves.length < length) {
    const face = FACE_TURNS[Math.floor(rng() * FACE_TURNS.length)]!;
    if (face === previous) continue;
    if (moves.length > 0 && OPPOSITE_FACE[face as Face] === previous) {
      // Keep scrambles from cancelling a face against its opposite in a trivial way.
      if (rng() < 0.5) continue;
    }
    previous = face;
    moves.push(face + suffixes[Math.floor(rng() * suffixes.length)]!);
  }
  return moves;
}

export function randomLegalState(rng: () => number): Uint8Array {
  const edgePerm = shuffle([...Array(12).keys()], rng);
  const cornerPerm = shuffle([...Array(8).keys()], rng);
  if (permutationParity(edgePerm) !== permutationParity(cornerPerm)) {
    const swap = edgePerm[0]!;
    edgePerm[0] = edgePerm[1]!;
    edgePerm[1] = swap;
  }
  const edgeOri = Array(12).fill(0);
  let edgeSum = 0;
  for (let i = 0; i < 11; i++) {
    edgeOri[i] = rng() < 0.5 ? 0 : 1;
    edgeSum += edgeOri[i];
  }
  edgeOri[11] = edgeSum % 2;
  const cornerOri = Array(8).fill(0);
  let cornerSum = 0;
  for (let i = 0; i < 7; i++) {
    cornerOri[i] = Math.floor(rng() * 3);
    cornerSum += cornerOri[i];
  }
  cornerOri[7] = (3 - (cornerSum % 3)) % 3;
  return faceletsFromCubie({ edgePerm, edgeOri, cornerPerm, cornerOri });
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** Breadth-first search over face turns. Fine for one piece at a time. */
export function searchMoves(
  start: Uint8Array,
  goal: (state: Uint8Array) => boolean,
  options?: { maxDepth?: number; moves?: readonly string[] },
): string[] | null {
  const maxDepth = options?.maxDepth ?? 6;
  const moves = options?.moves ?? ["U", "U'", "U2", "D", "D'", "D2", "R", "R'", "R2", "L", "L'", "L2", "F", "F'", "F2", "B", "B'", "B2"];
  if (goal(start)) return [];
  const queue: { state: Uint8Array; path: string[] }[] = [{ state: copyBytes(start), path: [] }];
  const seen = new Set<string>([faceletsToString(start)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.path.length >= maxDepth) continue;
    for (const move of moves) {
      const last = current.path[current.path.length - 1];
      if (last && last[0] === move[0]) continue;
      const next = applyMoves(current.state, [move]);
      const key = faceletsToString(next);
      if (seen.has(key)) continue;
      const path = [...current.path, move];
      if (goal(next)) return path;
      seen.add(key);
      queue.push({ state: next, path });
    }
  }
  return null;
}

export function ringIndexes(): number[] {
  return [0, 1, 2, 5, 8, 7, 6, 3];
}

export function rotateFaceRing(state: Uint8Array, face: Face, quarters: number): Uint8Array {
  const next = copyBytes(state);
  const start = faceOffset(face);
  const turns = ((quarters % 4) + 4) % 4;
  const ring = ringIndexes();
  for (let i = 0; i < 8; i++) {
    const from = ring[i]!;
    const to = ring[(i + turns * 2) % 8]!;
    next[start + to] = state[start + from]!;
  }
  return next;
}

export { PERMS, NORMAL, EDGE_PLACES, CORNER_PLACES, stickerAt };
