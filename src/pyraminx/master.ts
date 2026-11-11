/**
 * Master Pyraminx: four layers on each face, 16 stickers per face.
 *
 * Same hold as the Pyraminx. u l r b turn only a tip. U L R B turn the tip,
 * the corner under it, and the near wings. Uw Lw Rw Bw turn those plus the
 * midges, the far wings, and the face centres around that vertex.
 * Clockwise is the turn you see when looking at the tip.
 *
 * Facelets are F R L D, 16 triangles each, point-up. Centres are the single
 * triangle in the middle of a face. They move; they are not fixed like a
 * cube centre.
 */

import { mulberry32, type ColorName } from "../cube/model";
import {
  PYRA_FACES,
  PYRA_VERTEX,
  PYRA_VERTICES,
  letterOfColor,
  pyraFacePose,
  rotateSteps,
  type PyraAnim,
  type PyraFace,
  type PyraSticker,
  type PyraVertex,
  type Vec,
} from "./model";

export const MASTER_STICKERS = 64;
export const MASTER_PER_FACE = 16;
export const MASTER_COLORS: ColorName[] = ["yellow", "red", "blue", "green"];
export { pyraFacePose as masterFacePose, letterOfColor };

const FACE_COLOR: Record<PyraFace, string> = { F: "g", R: "r", L: "b", D: "y" };
const COLOR_NAME: Record<string, string> = { y: "yellow", g: "green", r: "red", b: "blue" };
const PALETTE = ["y", "g", "r", "b"];
const INSET = 0.12;
const LIFT = 0.035;
const EDGES: [PyraVertex, PyraVertex][] = [
  ["U", "L"],
  ["U", "R"],
  ["U", "B"],
  ["L", "R"],
  ["R", "B"],
  ["L", "B"],
];

export const MASTER_EDGES = EDGES.map(([a, b]) => `${a}${b}`);

interface RawSticker {
  face: PyraFace;
  verts: [PyraVertex, PyraVertex, PyraVertex];
  piece: string;
  bary: Record<PyraVertex, number>;
  draw: [Vec, Vec, Vec];
  normal: Vec;
  centroid: Vec;
}

function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(a: Vec, k: number): Vec {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}
function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec, b: Vec): Vec {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function normalize(a: Vec): Vec {
  const n = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / n);
}
function centroid(verts: [Vec, Vec, Vec]): Vec {
  return scale(add(add(verts[0], verts[1]), verts[2]), 1 / 3);
}
function dist2(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

const AXIS: Record<PyraVertex, Vec> = {
  U: normalize(PYRA_VERTEX.U),
  L: normalize(PYRA_VERTEX.L),
  R: normalize(PYRA_VERTEX.R),
  B: normalize(PYRA_VERTEX.B),
};

function faceVerts(top: PyraVertex, left: PyraVertex, right: PyraVertex): [PyraVertex, PyraVertex, PyraVertex] {
  const A = PYRA_VERTEX[top];
  const B = PYRA_VERTEX[left];
  const C = PYRA_VERTEX[right];
  const mid = centroid([A, B, C]);
  const n = cross(sub(B, A), sub(C, A));
  if (dot(n, mid) < 0) return [top, right, left];
  return [top, left, right];
}

const FACE_VERTS: Record<PyraFace, [PyraVertex, PyraVertex, PyraVertex]> = {
  F: faceVerts("U", "L", "R"),
  R: faceVerts("U", "R", "B"),
  L: faceVerts("U", "B", "L"),
  D: faceVerts("L", "B", "R"),
};

function faceNormal(verts: [PyraVertex, PyraVertex, PyraVertex]): Vec {
  const A = PYRA_VERTEX[verts[0]];
  const B = PYRA_VERTEX[verts[1]];
  const C = PYRA_VERTEX[verts[2]];
  return normalize(cross(sub(B, A), sub(C, A)));
}

function baryPoint(a: number, b: number, c: number, verts: [PyraVertex, PyraVertex, PyraVertex]): Vec {
  const A = PYRA_VERTEX[verts[0]];
  const B = PYRA_VERTEX[verts[1]];
  const C = PYRA_VERTEX[verts[2]];
  const s = a + b + c;
  return {
    x: (a * A.x + b * B.x + c * C.x) / s,
    y: (a * A.y + b * B.y + c * C.y) / s,
    z: (a * A.z + b * B.z + c * C.z) / s,
  };
}

function edgeName(a: PyraVertex, b: PyraVertex): string {
  const pair = EDGES.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (!pair) throw new Error(`No edge ${a}${b}`);
  return `${pair[0]}${pair[1]}`;
}

function pieceOf(face: PyraFace, kind: "up" | "down", a: number, b: number, c: number, verts: [PyraVertex, PyraVertex, PyraVertex]): string {
  const [A, B, C] = verts;
  if (kind === "up" && a === 3) return `tip-${A}`;
  if (kind === "up" && b === 3) return `tip-${B}`;
  if (kind === "up" && c === 3) return `tip-${C}`;
  if (kind === "down" && a === 2 && b === 0 && c === 0) return `corner-${A}`;
  if (kind === "down" && b === 2 && a === 0 && c === 0) return `corner-${B}`;
  if (kind === "down" && c === 2 && a === 0 && b === 0) return `corner-${C}`;
  if (kind === "up" && a === 1 && b === 1 && c === 1) return `center-${face}`;
  if (kind === "down" && c === 0 && a === 1 && b === 1) return `midge-${edgeName(A, B)}`;
  if (kind === "down" && b === 0 && a === 1 && c === 1) return `midge-${edgeName(A, C)}`;
  if (kind === "down" && a === 0 && b === 1 && c === 1) return `midge-${edgeName(B, C)}`;
  if (kind === "up" && c === 0) return `wing-${edgeName(A, B)}-${a > b ? A : B}`;
  if (kind === "up" && b === 0) return `wing-${edgeName(A, C)}-${a > c ? A : C}`;
  if (kind === "up" && a === 0) return `wing-${edgeName(B, C)}-${b > c ? B : C}`;
  throw new Error(`Unclassified ${face} ${kind} ${a},${b},${c}`);
}

function centroidBary(kind: "up" | "down", a: number, b: number, c: number, verts: [PyraVertex, PyraVertex, PyraVertex]): Record<PyraVertex, number> {
  const shift = kind === "up" ? 1 : 2;
  const raw = [(3 * a + shift) / 12, (3 * b + shift) / 12, (3 * c + shift) / 12];
  const bary: Record<PyraVertex, number> = { U: 0, L: 0, R: 0, B: 0 };
  verts.forEach((name, index) => {
    bary[name] = raw[index]!;
  });
  return bary;
}

function drawTriangle(kind: "up" | "down", a: number, b: number, c: number, verts: [PyraVertex, PyraVertex, PyraVertex], normal: Vec): [Vec, Vec, Vec] {
  const raw = kind === "up"
    ? [baryPoint(a + 1, b, c, verts), baryPoint(a, b + 1, c, verts), baryPoint(a, b, c + 1, verts)]
    : [baryPoint(a, b + 1, c + 1, verts), baryPoint(a + 1, b, c + 1, verts), baryPoint(a + 1, b + 1, c, verts)];
  const n = cross(sub(raw[1]!, raw[0]!), sub(raw[2]!, raw[0]!));
  const ordered = dot(n, normal) < 0 ? [raw[0]!, raw[2]!, raw[1]!] : [raw[0]!, raw[1]!, raw[2]!];
  const center = centroid(ordered as [Vec, Vec, Vec]);
  const shrunk = ordered.map((point) => add(center, scale(sub(point, center), 1 - INSET))) as [Vec, Vec, Vec];
  return shrunk.map((point) => add(point, scale(normal, LIFT))) as [Vec, Vec, Vec];
}

function buildRaw(): RawSticker[] {
  const stickers: RawSticker[] = [];
  for (const face of PYRA_FACES) {
    const verts = FACE_VERTS[face];
    const normal = faceNormal(verts);
    for (let a = 0; a <= 3; a += 1) {
      for (let b = 0; a + b <= 3; b += 1) {
        const c = 3 - a - b;
        stickers.push({
          face,
          verts,
          piece: pieceOf(face, "up", a, b, c, verts),
          bary: centroidBary("up", a, b, c, verts),
          draw: drawTriangle("up", a, b, c, verts, normal),
          normal,
          centroid: centroid(drawTriangle("up", a, b, c, verts, normal)),
        });
      }
    }
    for (let a = 0; a <= 2; a += 1) {
      for (let b = 0; a + b <= 2; b += 1) {
        const c = 2 - a - b;
        stickers.push({
          face,
          verts,
          piece: pieceOf(face, "down", a, b, c, verts),
          bary: centroidBary("down", a, b, c, verts),
          draw: drawTriangle("down", a, b, c, verts, normal),
          normal,
          centroid: centroid(drawTriangle("down", a, b, c, verts, normal)),
        });
      }
    }
  }
  return stickers;
}

const RAW = buildRaw();

function sortOnFace(face: PyraFace): RawSticker[] {
  return RAW.filter((sticker) => sticker.face === face).sort((left, right) => {
    const down = right.bary[left.verts[0]] - left.bary[left.verts[0]];
    if (Math.abs(down) > 1e-6) return down;
    const across = (left.bary[left.verts[2]] - left.bary[left.verts[1]]) - (right.bary[right.verts[2]] - right.bary[right.verts[1]]);
    return across;
  });
}

export const MASTER_MESH: PyraSticker[] = PYRA_FACES.flatMap((face) => {
  const ordered = sortOnFace(face);
  if (ordered.length !== MASTER_PER_FACE) throw new Error(`${face} has ${ordered.length} stickers`);
  return ordered.map((sticker, local) => ({
    index: PYRA_FACES.indexOf(face) * MASTER_PER_FACE + local,
    face,
    local,
    piece: sticker.piece,
    verts: sticker.draw,
    normal: sticker.normal,
    centroid: sticker.centroid,
  }));
});

const BY_INDEX = MASTER_MESH.slice().sort((a, b) => a.index - b.index);
const RAW_BY_PIECE = new Map<string, RawSticker[]>();
for (const sticker of RAW) {
  const list = RAW_BY_PIECE.get(sticker.piece) ?? [];
  list.push(sticker);
  RAW_BY_PIECE.set(sticker.piece, list);
}

const PIECE_COUNTS = new Map<string, number>();
for (const sticker of MASTER_MESH) PIECE_COUNTS.set(sticker.piece, (PIECE_COUNTS.get(sticker.piece) ?? 0) + 1);
for (const vertex of PYRA_VERTICES) {
  if (PIECE_COUNTS.get(`tip-${vertex}`) !== 3) throw new Error(`Tip ${vertex} is incomplete`);
  if (PIECE_COUNTS.get(`corner-${vertex}`) !== 3) throw new Error(`Corner ${vertex} is incomplete`);
}
for (const edge of MASTER_EDGES) {
  if (PIECE_COUNTS.get(`midge-${edge}`) !== 2) throw new Error(`Midge ${edge} is incomplete`);
  const [a, b] = [edge[0], edge[1]] as [PyraVertex, PyraVertex];
  if (PIECE_COUNTS.get(`wing-${edge}-${a}`) !== 2 || PIECE_COUNTS.get(`wing-${edge}-${b}`) !== 2) throw new Error(`Wing ${edge} is incomplete`);
}
for (const face of PYRA_FACES) {
  if (PIECE_COUNTS.get(`center-${face}`) !== 1) throw new Error(`Centre ${face} is missing`);
}

function layerPieces(vertex: PyraVertex, kind: "tip" | "normal" | "wide"): string[] {
  if (kind === "tip") return [`tip-${vertex}`];
  const threshold = kind === "normal" ? 0.5 : 0.25;
  const pieces = new Set<string>();
  for (const sticker of RAW) {
    if (sticker.bary[vertex] > threshold) pieces.add(sticker.piece);
  }
  for (const piece of pieces) {
    const stickers = RAW_BY_PIECE.get(piece) ?? [];
    if (stickers.some((sticker) => sticker.bary[vertex] <= threshold)) {
      throw new Error(`${kind} ${vertex} splits ${piece}`);
    }
  }
  return [...pieces];
}

function permutation(vertex: PyraVertex, steps: 1 | 2, kind: "tip" | "normal" | "wide"): number[] {
  const moving = new Set(layerPieces(vertex, kind));
  const axis = AXIS[vertex];
  const to = BY_INDEX.map((_, index) => index);
  for (const sticker of BY_INDEX) {
    if (!moving.has(sticker.piece)) continue;
    const turned = rotateSteps(sticker.centroid, axis, steps);
    let best = sticker.index;
    let bestD = Infinity;
    for (const other of BY_INDEX) {
      const d = dist2(turned, other.centroid);
      if (d < bestD) {
        bestD = d;
        best = other.index;
      }
    }
    if (bestD > 1e-4) throw new Error(`Master move ${vertex} ${kind} missed sticker ${sticker.index} by ${bestD}`);
    to[sticker.index] = best;
  }
  if (new Set(to).size !== to.length) throw new Error(`Master move ${vertex} ${kind} is not a permutation`);
  return to;
}

function moveName(vertex: PyraVertex, steps: 1 | 2, kind: "tip" | "normal" | "wide"): string {
  const letter = kind === "tip" ? vertex.toLowerCase() : vertex;
  const wide = kind === "wide" ? "w" : "";
  const prime = steps === 2 ? "'" : "";
  return `${letter}${wide}${prime}`;
}

const PERM = new Map<string, number[]>();
const ANIM = new Map<string, PyraAnim>();
for (const vertex of PYRA_VERTICES) {
  for (const kind of ["tip", "normal", "wide"] as const) {
    for (const steps of [1, 2] as const) {
      const key = moveName(vertex, steps, kind);
      PERM.set(key, permutation(vertex, steps, kind));
      ANIM.set(key, {
        axis: AXIS[vertex],
        angle: steps === 1 ? -2 * Math.PI / 3 : 2 * Math.PI / 3,
        pieces: layerPieces(vertex, kind),
      });
    }
  }
}

export const MASTER_MOVES = [...PERM.keys()];

export function masterAnim(move: string): PyraAnim | null {
  return ANIM.get(move) ?? null;
}

export function applyMaster(state: string, move: string): string {
  const to = PERM.get(move);
  if (!to || state.length !== MASTER_STICKERS) throw new Error(`Unknown Master Pyraminx move “${move}”`);
  const next = Array.from(state);
  for (let src = 0; src < MASTER_STICKERS; src += 1) next[to[src]!] = state[src]!;
  return next.join("");
}

export function applyMasterMoves(state: string, moves: readonly string[]): string {
  return moves.reduce((current, move) => applyMaster(current, move), state);
}

export function invertMaster(move: string): string {
  return move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
}

function solvedLetters(): string {
  return PYRA_FACES.map((face) => FACE_COLOR[face].repeat(MASTER_PER_FACE)).join("");
}

export const SOLVED_MASTER = solvedLetters();

export function solvedMasterString(): string {
  return SOLVED_MASTER;
}

function stickersOf(piece: string): number[] {
  return BY_INDEX.filter((sticker) => sticker.piece === piece).map((sticker) => sticker.index).sort((a, b) => a - b);
}

function orderAround(vertex: PyraVertex, piece: string): number[] {
  const axis = AXIS[vertex];
  const helper = Math.abs(axis.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = normalize(cross(axis, helper));
  const w = cross(axis, u);
  return BY_INDEX.filter((sticker) => sticker.piece === piece)
    .map((sticker) => ({ index: sticker.index, ang: Math.atan2(dot(sticker.centroid, w), dot(sticker.centroid, u)) }))
    .sort((left, right) => right.ang - left.ang)
    .map((sticker) => sticker.index);
}

const TIP_INDEX = Object.fromEntries(PYRA_VERTICES.map((vertex) => [vertex, orderAround(vertex, `tip-${vertex}`)])) as Record<PyraVertex, number[]>;
const CORNER_INDEX = Object.fromEntries(PYRA_VERTICES.map((vertex) => [vertex, orderAround(vertex, `corner-${vertex}`)])) as Record<PyraVertex, number[]>;
const CENTER_INDEX = Object.fromEntries(PYRA_FACES.map((face) => [face, stickersOf(`center-${face}`)[0]!])) as Record<PyraFace, number>;
const MIDGE_INDEX = MASTER_EDGES.map((edge) => stickersOf(`midge-${edge}`));
const WING_INDEX = MASTER_EDGES.flatMap((edge) => {
  const [a, b] = [edge[0] as PyraVertex, edge[1] as PyraVertex];
  return [stickersOf(`wing-${edge}-${a}`), stickersOf(`wing-${edge}-${b}`)];
});

function colorsAt(state: string, indexes: readonly number[]): string[] {
  return indexes.map((index) => state[index] ?? "");
}

function orientationOf(colors: string[], solved: string[]): number {
  for (let turn = 0; turn < solved.length; turn += 1) {
    if (colors.every((color, index) => color === solved[(index + turn) % solved.length])) return turn;
  }
  return -1;
}

const TIP_SOLVED = Object.fromEntries(PYRA_VERTICES.map((vertex) => [vertex, colorsAt(SOLVED_MASTER, TIP_INDEX[vertex])])) as Record<PyraVertex, string[]>;
const CORNER_SOLVED = Object.fromEntries(PYRA_VERTICES.map((vertex) => [vertex, colorsAt(SOLVED_MASTER, CORNER_INDEX[vertex])])) as Record<PyraVertex, string[]>;
const MIDGE_SOLVED = MIDGE_INDEX.map((indexes) => colorsAt(SOLVED_MASTER, indexes));
export interface MasterSlots {
  midgePiece: number[];
  midgeOri: number[];
  wingPiece: number[];
  wingOri: number[];
  cornerOri: number[];
  centers: string[];
  tipOri: number[];
}

function readPair(colors: string[], solvedList: string[][]): { piece: number; ori: number } | null {
  for (let piece = 0; piece < solvedList.length; piece += 1) {
    const solved = solvedList[piece]!;
    if (colors[0] === solved[0] && colors[1] === solved[1]) return { piece, ori: 0 };
    if (colors[0] === solved[1] && colors[1] === solved[0]) return { piece, ori: 1 };
  }
  return null;
}

export function readMaster(state: string): MasterSlots | null {
  const midgePiece: number[] = [];
  const midgeOri: number[] = [];
  for (let slot = 0; slot < MIDGE_INDEX.length; slot += 1) {
    const found = readPair(colorsAt(state, MIDGE_INDEX[slot]!), MIDGE_SOLVED);
    if (!found || midgePiece.includes(found.piece)) return null;
    midgePiece.push(found.piece);
    midgeOri.push(found.ori);
  }
  const wingPiece: number[] = [];
  const wingOri: number[] = [];
  const wingSeen = Array(6).fill(0);
  for (let slot = 0; slot < WING_INDEX.length; slot += 1) {
    const found = readPair(colorsAt(state, WING_INDEX[slot]!), MIDGE_SOLVED);
    if (!found) return null;
    wingSeen[found.piece] += 1;
    wingPiece.push(found.piece * 2 + (wingSeen[found.piece] === 1 ? 0 : 1));
    wingOri.push(found.ori);
  }
  if (wingSeen.some((count) => count !== 2)) return null;
  const cornerOri: number[] = [];
  for (const vertex of PYRA_VERTICES) {
    const ori = orientationOf(colorsAt(state, CORNER_INDEX[vertex]), CORNER_SOLVED[vertex]);
    if (ori < 0) return null;
    cornerOri.push(ori);
  }
  const tipOri: number[] = [];
  for (const vertex of PYRA_VERTICES) {
    const ori = orientationOf(colorsAt(state, TIP_INDEX[vertex]), TIP_SOLVED[vertex]);
    if (ori < 0) return null;
    tipOri.push(ori);
  }
  const centers = PYRA_FACES.map((face) => state[CENTER_INDEX[face]] ?? "");
  if (new Set(centers).size !== 4 || centers.some((color) => !PALETTE.includes(color))) return null;
  return { midgePiece, midgeOri, wingPiece, wingOri, cornerOri, centers, tipOri };
}

function permParity(image: number[]): 0 | 1 {
  const seen = Array(image.length).fill(false);
  let odd = false;
  for (let start = 0; start < image.length; start += 1) {
    if (seen[start]) continue;
    let length = 0;
    let cursor = start;
    while (!seen[cursor]) {
      seen[cursor] = true;
      cursor = image[cursor]!;
      length += 1;
    }
    if (length % 2 === 0) odd = !odd;
  }
  return odd ? 1 : 0;
}

function centerPerm(centers: string[]): number[] {
  const home = PYRA_FACES.map((face) => FACE_COLOR[face]);
  return centers.map((color) => home.indexOf(color));
}

export function validateMaster(state: string): { ok: boolean; message: string } {
  if (state.length !== MASTER_STICKERS || [...state].some((letter) => !PALETTE.includes(letter))) {
    return { ok: false, message: "Enter all 64 stickers. A Master Pyraminx uses yellow, green, red, and blue." };
  }
  const counts = Object.fromEntries(PALETTE.map((letter) => [letter, 0])) as Record<string, number>;
  for (const letter of state) counts[letter] = (counts[letter] ?? 0) + 1;
  if (PALETTE.some((letter) => counts[letter] !== 16)) {
    const detail = PALETTE.map((letter) => `${counts[letter]} ${COLOR_NAME[letter]}`).join(", ");
    return { ok: false, message: `A Master Pyraminx has 16 stickers of each colour. This one has ${detail}.` };
  }
  const slots = readMaster(state);
  if (!slots) {
    return { ok: false, message: "Some stickers do not form a real tip, corner, wing, midge, or centre of this Master Pyraminx." };
  }
  if (slots.midgeOri.reduce((sum, bit) => sum + bit, 0) % 2 !== 0) {
    return { ok: false, message: "Every real piece is present, but a midge is flipped in a way a Master Pyraminx cannot reach." };
  }
  if (permParity(slots.midgePiece) !== 0) {
    return { ok: false, message: "Every real piece is present, but two midges are swapped. A Master Pyraminx cannot make that swap." };
  }
  if (permParity(centerPerm(slots.centers)) !== 0) {
    return { ok: false, message: "The face centres are swapped in a way a Master Pyraminx cannot reach." };
  }
  return { ok: true, message: "" };
}

export function randomMasterScramble(rng: () => number = Math.random, turns = 24): string[] {
  const moves: string[] = [];
  let previous = "";
  const all = MASTER_MOVES;
  for (let n = 0; n < turns; n += 1) {
    let move = all[Math.floor(rng() * all.length)]!;
    let guard = 0;
    while ((move[0] === previous || invertMaster(move) === moves[moves.length - 1]) && guard < 8) {
      move = all[Math.floor(rng() * all.length)]!;
      guard += 1;
    }
    previous = move[0]!;
    moves.push(move);
  }
  return moves;
}

export function scrambleMaster(seed = 1): string {
  return applyMasterMoves(SOLVED_MASTER, randomMasterScramble(mulberry32(seed)));
}

export function blankMaster(): string {
  return ".".repeat(MASTER_STICKERS);
}

export function masterFaceOf(index: number): PyraFace {
  return PYRA_FACES[Math.floor(index / MASTER_PER_FACE)] ?? "F";
}

export function masterFilled(cells: string, face: PyraFace): number {
  const start = PYRA_FACES.indexOf(face) * MASTER_PER_FACE;
  let filled = 0;
  for (let local = 0; local < MASTER_PER_FACE; local += 1) if (cells[start + local] && cells[start + local] !== ".") filled += 1;
  return filled;
}

export function masterFirstBlank(cells: string): PyraFace {
  return PYRA_FACES.find((face) => masterFilled(cells, face) < MASTER_PER_FACE) ?? "F";
}

export function masterStickerLabel(face: PyraFace, local: number): string {
  const piece = BY_INDEX[PYRA_FACES.indexOf(face) * MASTER_PER_FACE + local]?.piece ?? "sticker";
  return `${face === "F" ? "Front" : face === "R" ? "Right" : face === "L" ? "Left" : "Down"} ${piece.replaceAll("-", " ")}`;
}

export function masterStickerPoint(face: PyraFace, local: number): Vec {
  const index = PYRA_FACES.indexOf(face) * MASTER_PER_FACE + local;
  return BY_INDEX[index]!.centroid;
}

export function masterMoveSpeech(move: string): string {
  const letter = (move[0] ?? "").toLowerCase();
  const place = { u: "up", l: "left", r: "right", b: "back" }[letter] ?? "named";
  const dir = move.endsWith("'") ? "anticlockwise" : "clockwise";
  if (move[0] === move[0]?.toLowerCase()) return `The ${place} tip turns ${dir}.`;
  if (move.includes("w")) return `The ${place} vertex turns ${dir} through three layers.`;
  return `The ${place} tip and the layer under it turn ${dir}.`;
}

export const MASTER_GUIDE: Record<PyraFace, { title: string; turn: string }> = {
  F: { title: "Front", turn: "Hold the Master Pyraminx with one face toward you and one face on the bottom. Paint the face toward you." },
  R: { title: "Right", turn: "Turn the Master Pyraminx so the right face comes toward you. Keep the same face on the bottom." },
  L: { title: "Left", turn: "Turn the Master Pyraminx so the left face comes toward you. Keep the same face on the bottom." },
  D: { title: "Down", turn: "Tip the Master Pyraminx toward you so the bottom face comes toward you. The edge that was nearest you sits at the top." },
};

export const MASTER_HOLD = "Hold one face toward you and one face on the bottom. U is the top tip, L the front-left tip, R the front-right tip, and B the back tip. Uw turns three layers; U turns the tip and the layer under it; u turns only the tip.";

/** Pyraminx image of the corners, midges, and tips. Wings and face centres are left out. */
export function masterAsPyraminx(state: string): string {
  const chars = Array.from({ length: 36 }, () => "?");
  for (const face of PYRA_FACES) {
    const verts = FACE_VERTS[face];
    const faceIndex = PYRA_FACES.indexOf(face);
    const put = (pyraLocal: number, piece: string) => {
      const sticker = BY_INDEX.find((item) => item.piece === piece && item.face === face);
      if (!sticker) throw new Error(`Missing ${piece} on ${face}`);
      chars[faceIndex * 9 + pyraLocal] = state[sticker.index] ?? "?";
    };
    const [A, B, C] = verts;
    put(0, `tip-${A}`);
    put(2, `corner-${A}`);
    put(4, `tip-${B}`);
    put(5, `corner-${B}`);
    put(8, `tip-${C}`);
    put(7, `corner-${C}`);
    put(1, `midge-${edgeName(A, B)}`);
    put(3, `midge-${edgeName(A, C)}`);
    put(6, `midge-${edgeName(B, C)}`);
  }
  return chars.join("");
}

export function tipFixMoves(state: string): string[] {
  const slots = readMaster(state);
  if (!slots) return [];
  const fixes: string[] = [];
  PYRA_VERTICES.forEach((vertex, index) => {
    const ori = slots.tipOri[index] ?? 0;
    const letter = vertex.toLowerCase();
    if (ori === 1) fixes.push(letter);
    else if (ori === 2) fixes.push(`${letter}'`);
  });
  return fixes;
}

export interface SlotEffect {
  midgeTo: number[];
  midgeFlip: number[];
  wingTo: number[];
  wingFlip: number[];
  /** Destination edge when a paired edge stays together, otherwise -1. */
  edgeTo: number[];
}

const WING_NAMES = MASTER_EDGES.flatMap((edge) => [`wing-${edge}-${edge[0]}`, `wing-${edge}-${edge[1]}`]);
const MIDGE_NAMES = MASTER_EDGES.map((edge) => `midge-${edge}`);

function landing(move: string, piece: string, names: string[]): { slot: number; flip: number } {
  const perm = PERM.get(move);
  if (!perm) throw new Error(`Missing move ${move}`);
  const sources = stickersOf(piece);
  const dests = sources.map((src) => perm[src]!);
  const slot = names.findIndex((name) => {
    const home = stickersOf(name);
    return home.length === dests.length && home.every((index) => dests.includes(index));
  });
  if (slot < 0) throw new Error(`${move} sent ${piece} off the puzzle`);
  const home = stickersOf(names[slot]!);
  return { slot, flip: dests[0] === home[0] ? 0 : 1 };
}

function effectOf(move: string): SlotEffect {
  const midgeTo = Array(6).fill(0);
  const midgeFlip = Array(6).fill(0);
  MIDGE_NAMES.forEach((name, source) => {
    const landed = landing(move, name, MIDGE_NAMES);
    midgeTo[source] = landed.slot;
    midgeFlip[source] = landed.flip;
  });
  const wingTo = Array(12).fill(0);
  const wingFlip = Array(12).fill(0);
  WING_NAMES.forEach((name, source) => {
    const landed = landing(move, name, WING_NAMES);
    wingTo[source] = landed.slot;
    wingFlip[source] = landed.flip;
  });
  const edgeTo = MASTER_EDGES.map((_, edge) => {
    const wingA = wingTo[edge * 2]!;
    const wingB = wingTo[edge * 2 + 1]!;
    const midge = midgeTo[edge]!;
    const same = Math.floor(wingA / 2) === midge && Math.floor(wingB / 2) === midge;
    const flipOk = (wingFlip[edge * 2]! ^ midgeFlip[edge]!) === 0 && (wingFlip[edge * 2 + 1]! ^ midgeFlip[edge]!) === 0;
    return same && flipOk ? midge : -1;
  });
  return { midgeTo, midgeFlip, wingTo, wingFlip, edgeTo };
}

export const MASTER_EFFECTS: Record<string, SlotEffect> = Object.fromEntries(MASTER_MOVES.map((move) => [move, effectOf(move)]));

export function wideMove(pyraMove: string): string {
  const vertex = pyraMove[0] ?? "";
  if (vertex === vertex.toLowerCase()) return pyraMove;
  return pyraMove.endsWith("'") ? `${vertex}w'` : `${vertex}w`;
}

export function nonCenterMatches(state: string, other: string): boolean {
  for (let index = 0; index < MASTER_STICKERS; index += 1) {
    if (BY_INDEX[index]?.piece.startsWith("center-")) continue;
    if (state[index] !== other[index]) return false;
  }
  return true;
}

export function centerKey(state: string): string {
  return PYRA_FACES.map((face) => state[CENTER_INDEX[face]]).join("");
}
