/**
 * Pyraminx model.
 *
 * Hold: one face on the bottom, one face toward you, a vertex pointing up.
 * Tips are U (top), L (front-left), R (front-right) and B (back). A capital
 * letter turns that tip together with the centre and three edges under it.
 * A lowercase letter turns only the tip. Clockwise is the turn you see when
 * looking straight at the tip from outside.
 *
 * Solved colours, in that hold: green in front, red on the right, blue on the
 * left, yellow on the bottom. Facelets are 9 triangles per face, F R L D,
 * each face stored point-up as:
 *
 *       0
 *     1 2 3
 *   4 5 6 7 8
 *
 * 0, 4 and 8 are tips, 2, 5 and 7 are centres, and 1, 3 and 6 are edges.
 */

import { mulberry32, type ColorName } from "../cube/model";

export const PYRA_FACES = ["F", "R", "L", "D"] as const;
export type PyraFace = (typeof PYRA_FACES)[number];
export const PYRA_VERTICES = ["U", "L", "R", "B"] as const;
export type PyraVertex = (typeof PYRA_VERTICES)[number];
export const PYRA_STICKERS = 36;
export const PYRA_COLORS: ColorName[] = ["yellow", "red", "blue", "green"];

const LETTER: Record<ColorName, string> = { white: "w", yellow: "y", red: "r", orange: "o", blue: "b", green: "g" };
const COLOR_NAME: Record<string, string> = { y: "yellow", g: "green", r: "red", b: "blue", w: "white", o: "orange" };
const FACE_COLOR: Record<PyraFace, string> = { F: "g", R: "r", L: "b", D: "y" };
const SCALE = 1.9;
const INSET = 0.18;
const LIFT = 0.03;

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface PyraSticker {
  index: number;
  face: PyraFace;
  local: number;
  piece: string;
  /** Triangle corners, inset and lifted, ready to draw. */
  verts: [Vec, Vec, Vec];
  normal: Vec;
  centroid: Vec;
}

export interface PyraAnim {
  axis: Vec;
  angle: number;
  pieces: string[];
}

interface Core {
  ep: number[];
  eo: number[];
  co: number[];
}

interface Effect {
  from: number[];
  eo: number[];
  co: number[];
}

const EDGE_PAIRS: [PyraVertex, PyraVertex][] = [
  ["U", "L"],
  ["U", "R"],
  ["U", "B"],
  ["L", "R"],
  ["R", "B"],
  ["L", "B"],
];

function v(x: number, y: number, z: number): Vec {
  return { x, y, z };
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

/** One clockwise step around an outward axis. Two steps is the anticlockwise turn. */
export function rotateSteps(p: Vec, axis: Vec, steps: 1 | 2): Vec {
  const c = -0.5;
  const s = steps === 1 ? -Math.sqrt(3) / 2 : Math.sqrt(3) / 2;
  const d = dot(axis, p);
  const cr = cross(axis, p);
  return add(add(scale(p, c), scale(cr, s)), scale(axis, d * (1 - c)));
}

const RAW: Record<PyraVertex, Vec> = {
  U: v(0, 1, 0),
  L: v(-Math.sqrt(6) / 3, -1 / 3, Math.sqrt(2) / 3),
  R: v(Math.sqrt(6) / 3, -1 / 3, Math.sqrt(2) / 3),
  B: v(0, -1 / 3, (-2 * Math.sqrt(2)) / 3),
};

export const PYRA_VERTEX: Record<PyraVertex, Vec> = {
  U: scale(RAW.U, SCALE),
  L: scale(RAW.L, SCALE),
  R: scale(RAW.R, SCALE),
  B: scale(RAW.B, SCALE),
};

const AXIS: Record<PyraVertex, Vec> = {
  U: normalize(RAW.U),
  L: normalize(RAW.L),
  R: normalize(RAW.R),
  B: normalize(RAW.B),
};

interface FaceSpec {
  name: PyraFace;
  verts: [PyraVertex, PyraVertex, PyraVertex];
  normal: Vec;
}

function faceSpec(name: PyraFace, top: PyraVertex, left: PyraVertex, right: PyraVertex): FaceSpec {
  const A = PYRA_VERTEX[top];
  const B = PYRA_VERTEX[left];
  const C = PYRA_VERTEX[right];
  const mid = centroid([A, B, C]);
  const n = cross(sub(B, A), sub(C, A));
  if (dot(n, mid) < 0) return { name, verts: [top, right, left], normal: normalize(cross(sub(C, A), sub(B, A))) };
  return { name, verts: [top, left, right], normal: normalize(n) };
}

const FACE_SPEC: FaceSpec[] = [
  faceSpec("F", "U", "L", "R"),
  faceSpec("R", "U", "R", "B"),
  faceSpec("L", "U", "B", "L"),
  faceSpec("D", "L", "B", "R"),
];

function bary(a: number, b: number, c: number, A: Vec, B: Vec, C: Vec): Vec {
  const s = a + b + c;
  return v((a * A.x + b * B.x + c * C.x) / s, (a * A.y + b * B.y + c * C.y) / s, (a * A.z + b * B.z + c * C.z) / s);
}

function wind(verts: [Vec, Vec, Vec], outward: Vec): [Vec, Vec, Vec] {
  const n = cross(sub(verts[1], verts[0]), sub(verts[2], verts[0]));
  if (dot(n, outward) < 0) return [verts[0], verts[2], verts[1]];
  return verts;
}

function inset(verts: [Vec, Vec, Vec]): [Vec, Vec, Vec] {
  const c = centroid(verts);
  return verts.map((p) => add(c, scale(sub(p, c), 1 - INSET))) as [Vec, Vec, Vec];
}

function triangle(spec: FaceSpec, kind: "up" | "down", a: number, b: number, c: number): [Vec, Vec, Vec] {
  const [A, B, C] = spec.verts.map((name) => PYRA_VERTEX[name]) as [Vec, Vec, Vec];
  const raw = kind === "up"
    ? [bary(a + 1, b, c, A, B, C), bary(a, b + 1, c, A, B, C), bary(a, b, c + 1, A, B, C)]
    : [bary(a, b + 1, c + 1, A, B, C), bary(a + 1, b, c + 1, A, B, C), bary(a + 1, b + 1, c, A, B, C)];
  const ordered = wind(raw as [Vec, Vec, Vec], spec.normal);
  const shrunk = inset(ordered);
  return shrunk.map((p) => add(p, scale(spec.normal, LIFT))) as [Vec, Vec, Vec];
}

function edgeName(a: PyraVertex, b: PyraVertex): string {
  const pair = EDGE_PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (!pair) throw new Error(`No edge ${a}${b}`);
  return `${pair[0]}${pair[1]}`;
}

function pieceName(spec: FaceSpec, local: number): string {
  const [A, B, C] = spec.verts;
  if (local === 0) return `tip-${A}`;
  if (local === 4) return `tip-${B}`;
  if (local === 8) return `tip-${C}`;
  if (local === 2) return `center-${A}`;
  if (local === 5) return `center-${B}`;
  if (local === 7) return `center-${C}`;
  if (local === 1) return `edge-${edgeName(A, B)}`;
  if (local === 3) return `edge-${edgeName(A, C)}`;
  return `edge-${edgeName(B, C)}`;
}

const LOCALS: { kind: "up" | "down"; a: number; b: number; c: number }[] = [
  { kind: "up", a: 2, b: 0, c: 0 },
  { kind: "up", a: 1, b: 1, c: 0 },
  { kind: "down", a: 1, b: 0, c: 0 },
  { kind: "up", a: 1, b: 0, c: 1 },
  { kind: "up", a: 0, b: 2, c: 0 },
  { kind: "down", a: 0, b: 1, c: 0 },
  { kind: "up", a: 0, b: 1, c: 1 },
  { kind: "down", a: 0, b: 0, c: 1 },
  { kind: "up", a: 0, b: 0, c: 2 },
];

function buildStickers(): PyraSticker[] {
  const stickers: PyraSticker[] = [];
  for (const spec of FACE_SPEC) {
    LOCALS.forEach((local, localIndex) => {
      const verts = triangle(spec, local.kind, local.a, local.b, local.c);
      stickers.push({
        index: stickers.length,
        face: spec.name,
        local: localIndex,
        piece: pieceName(spec, localIndex),
        verts,
        normal: spec.normal,
        centroid: centroid(verts),
      });
    });
  }
  return stickers;
}

export const PYRA_MESH: PyraSticker[] = buildStickers();

const BY_INDEX = PYRA_MESH.slice().sort((a, b) => a.index - b.index);

function piecesFor(vertex: PyraVertex, tipsOnly: boolean): string[] {
  const pieces = [`tip-${vertex}`];
  if (tipsOnly) return pieces;
  pieces.push(`center-${vertex}`);
  for (const [a, b] of EDGE_PAIRS) {
    if (a === vertex || b === vertex) pieces.push(`edge-${a}${b}`);
  }
  return pieces;
}

function permutation(vertex: PyraVertex, steps: 1 | 2, tipsOnly: boolean): number[] {
  const moving = new Set(piecesFor(vertex, tipsOnly));
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
    if (bestD > 1e-4) throw new Error(`Pyraminx move ${vertex} did not land sticker ${sticker.index}`);
    to[sticker.index] = best;
  }
  return to;
}

function dist2(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function moveKey(vertex: PyraVertex, steps: 1 | 2, tipsOnly: boolean): string {
  const letter = tipsOnly ? vertex.toLowerCase() : vertex;
  return steps === 1 ? letter : `${letter}'`;
}

const PERM = new Map<string, number[]>();
const ANIM = new Map<string, PyraAnim>();
for (const vertex of PYRA_VERTICES) {
  for (const tipsOnly of [false, true]) {
    for (const steps of [1, 2] as const) {
      const key = moveKey(vertex, steps, tipsOnly);
      PERM.set(key, permutation(vertex, steps, tipsOnly));
      ANIM.set(key, {
        axis: AXIS[vertex],
        angle: steps === 1 ? -2 * Math.PI / 3 : 2 * Math.PI / 3,
        pieces: piecesFor(vertex, tipsOnly),
      });
    }
  }
}

export function pyraAnim(move: string): PyraAnim | null {
  return ANIM.get(move) ?? null;
}

export function applyPyra(state: string, move: string): string {
  const to = PERM.get(move);
  if (!to || state.length !== PYRA_STICKERS) throw new Error(`Unknown Pyraminx move “${move}”`);
  const next = Array.from(state);
  for (let src = 0; src < PYRA_STICKERS; src += 1) next[to[src]!] = state[src]!;
  return next.join("");
}

export function applyPyraMoves(state: string, moves: readonly string[]): string {
  return moves.reduce((current, move) => applyPyra(current, move), state);
}

function solvedLetters(): string {
  return PYRA_FACES.map((face) => FACE_COLOR[face].repeat(9)).join("");
}

export const SOLVED_PYRA = solvedLetters();

export function solvedPyraString(): string {
  return SOLVED_PYRA;
}

function orderAround(vertex: PyraVertex, piece: string): number[] {
  const axis = AXIS[vertex];
  const stickers = BY_INDEX.filter((sticker) => sticker.piece === piece);
  const helper = v(axis.x === 0 && axis.z === 0 ? 1 : 0, axis.x === 0 && axis.z === 0 ? 0 : 1, 0);
  const u = normalize(cross(axis, helper.y === 0 && helper.x === 0 ? v(1, 0, 0) : helper));
  const w = cross(axis, u);
  return stickers
    .map((sticker) => ({ index: sticker.index, ang: Math.atan2(dot(sticker.centroid, w), dot(sticker.centroid, u)) }))
    .sort((a, b) => b.ang - a.ang)
    .map((item) => item.index);
}

const CENTER_INDEX = Object.fromEntries(PYRA_VERTICES.map((vertex) => [vertex, orderAround(vertex, `center-${vertex}`)])) as Record<PyraVertex, number[]>;
const TIP_INDEX = Object.fromEntries(PYRA_VERTICES.map((vertex) => [vertex, orderAround(vertex, `tip-${vertex}`)])) as Record<PyraVertex, number[]>;
const EDGE_INDEX: number[][] = EDGE_PAIRS.map(([a, b]) =>
  BY_INDEX.filter((sticker) => sticker.piece === `edge-${a}${b}`).map((sticker) => sticker.index).sort((a, b) => a - b),
);

function colorsAt(state: string, indexes: number[]): string[] {
  return indexes.map((index) => state[index] ?? "");
}

function orientationOf(colors: string[], solved: string[]): number {
  for (let turn = 0; turn < solved.length; turn += 1) {
    if (colors.every((color, index) => color === solved[(index + turn) % solved.length])) return turn;
  }
  return -1;
}

const CENTER_SOLVED = Object.fromEntries(PYRA_VERTICES.map((vertex) => [vertex, colorsAt(SOLVED_PYRA, CENTER_INDEX[vertex])])) as Record<PyraVertex, string[]>;
const TIP_SOLVED = Object.fromEntries(PYRA_VERTICES.map((vertex) => [vertex, colorsAt(SOLVED_PYRA, TIP_INDEX[vertex])])) as Record<PyraVertex, string[]>;
const EDGE_SOLVED = EDGE_INDEX.map((indexes) => colorsAt(SOLVED_PYRA, indexes));

function readCore(state: string): Core | null {
  const ep: number[] = [];
  const eo: number[] = [];
  for (let slot = 0; slot < EDGE_INDEX.length; slot += 1) {
    const colors = colorsAt(state, EDGE_INDEX[slot]!);
    let found = -1;
    let ori = 0;
    for (let piece = 0; piece < EDGE_SOLVED.length; piece += 1) {
      const solved = EDGE_SOLVED[piece]!;
      if (colors[0] === solved[0] && colors[1] === solved[1]) {
        found = piece;
        ori = 0;
        break;
      }
      if (colors[0] === solved[1] && colors[1] === solved[0]) {
        found = piece;
        ori = 1;
        break;
      }
    }
    if (found < 0 || ep.includes(found)) return null;
    ep.push(found);
    eo.push(ori);
  }
  const co: number[] = [];
  for (const vertex of PYRA_VERTICES) {
    const ori = orientationOf(colorsAt(state, CENTER_INDEX[vertex]), CENTER_SOLVED[vertex]);
    if (ori < 0) return null;
    co.push(ori);
  }
  for (const vertex of PYRA_VERTICES) {
    if (orientationOf(colorsAt(state, TIP_INDEX[vertex]), TIP_SOLVED[vertex]) < 0) return null;
  }
  return { ep, eo, co };
}

function effectFrom(move: string): Effect {
  const core = readCore(applyPyra(SOLVED_PYRA, move));
  if (!core) throw new Error(`Move ${move} broke the solved Pyraminx`);
  return { from: core.ep, eo: core.eo, co: core.co };
}

export const PYRA_MOVES = ["U", "U'", "L", "L'", "R", "R'", "B", "B'"] as const;
const EFFECTS: Record<string, Effect> = Object.fromEntries(PYRA_MOVES.map((move) => [move, effectFrom(move)]));

export function applyCore(core: Core, move: string): Core {
  const effect = EFFECTS[move];
  if (!effect) throw new Error(`Unknown Pyraminx move “${move}”`);
  return {
    ep: effect.from.map((src) => core.ep[src]!),
    eo: effect.from.map((src, dest) => (core.eo[src]! + effect.eo[dest]!) & 1),
    co: core.co.map((ori, index) => (ori + effect.co[index]!) % 3),
  };
}

export function solvedCore(): Core {
  return { ep: [0, 1, 2, 3, 4, 5], eo: [0, 0, 0, 0, 0, 0], co: [0, 0, 0, 0] };
}

export function coreKey(core: Core): number {
  let perm = 0;
  const used = [false, false, false, false, false, false];
  for (let slot = 0; slot < 6; slot += 1) {
    let smaller = 0;
    const piece = core.ep[slot]!;
    for (let other = 0; other < piece; other += 1) if (!used[other]) smaller += 1;
    used[piece] = true;
    perm = perm * (6 - slot) + smaller;
  }
  let ori = 0;
  for (const bit of core.eo) ori = (ori << 1) | bit;
  let centers = 0;
  for (const turn of core.co) centers = centers * 3 + turn;
  return centers * 46080 + ori * 720 + perm;
}

const PERM_PLACE = [120, 24, 6, 2, 1, 1];

/** Inverse of {@link coreKey}. Used by the distance table. */
export function coreFromKey(key: number): Core {
  const centers = Math.floor(key / 46080);
  const rest = key % 46080;
  const ori = Math.floor(rest / 720);
  let perm = rest % 720;
  const co = [0, 0, 0, 0];
  let centerBits = centers;
  for (let index = 3; index >= 0; index -= 1) {
    co[index] = centerBits % 3;
    centerBits = Math.floor(centerBits / 3);
  }
  const eo = [0, 0, 0, 0, 0, 0];
  let oriBits = ori;
  for (let index = 5; index >= 0; index -= 1) {
    eo[index] = oriBits & 1;
    oriBits >>= 1;
  }
  const available = [0, 1, 2, 3, 4, 5];
  const ep: number[] = [];
  for (let slot = 0; slot < 6; slot += 1) {
    const place = PERM_PLACE[slot]!;
    const digit = Math.floor(perm / place);
    perm %= place;
    ep.push(available.splice(digit, 1)[0]!);
  }
  return { ep, eo, co };
}

export function readCoreOf(state: string): Core | null {
  return readCore(state);
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

function tipOrientation(state: string, vertex: PyraVertex): number {
  return orientationOf(colorsAt(state, TIP_INDEX[vertex]), TIP_SOLVED[vertex]);
}

/** Tip turns that put the tips back without disturbing edges or centres. */
export function tipFixes(state: string): string[] {
  const fixes: string[] = [];
  for (const vertex of PYRA_VERTICES) {
    const ori = tipOrientation(state, vertex);
    const letter = vertex.toLowerCase();
    if (ori === 1) fixes.push(letter);
    else if (ori === 2) fixes.push(`${letter}'`);
  }
  return fixes;
}

const PALETTE = ["y", "g", "r", "b"];

function missingColor(colors: string[]): string | null {
  const set = new Set(colors);
  if (set.size !== 3) return null;
  const absent = PALETTE.filter((color) => !set.has(color));
  return absent.length === 1 ? absent[0]! : null;
}

function faceColorMap(state: string): Record<PyraFace, string> | null {
  const omitted: Partial<Record<PyraVertex, string>> = {};
  for (const vertex of PYRA_VERTICES) {
    const color = missingColor(colorsAt(state, CENTER_INDEX[vertex]));
    if (!color) return null;
    omitted[vertex] = color;
  }
  const faces: Record<PyraFace, string> = {
    D: omitted.U!,
    F: omitted.B!,
    R: omitted.L!,
    L: omitted.R!,
  };
  if (new Set(Object.values(faces)).size !== 4) return null;
  return faces;
}

export interface PyraVerdict {
  ok: boolean;
  message: string;
  /** Colouring rewritten into the green-front hold, when the pieces are legal. */
  canonical: string | null;
}

export function validatePyraminx(state: string): PyraVerdict {
  if (state.length !== PYRA_STICKERS || [...state].some((letter) => !PALETTE.includes(letter))) {
    return {
      ok: false,
      message: "Enter all 36 stickers. A Pyraminx uses yellow, green, red, and blue.",
      canonical: null,
    };
  }
  const counts = Object.fromEntries(PALETTE.map((letter) => [letter, 0])) as Record<string, number>;
  for (const letter of state) counts[letter] = (counts[letter] ?? 0) + 1;
  if (PALETTE.some((letter) => counts[letter] !== 9)) {
    const detail = PALETTE.map((letter) => `${counts[letter]} ${COLOR_NAME[letter]}`).join(", ");
    return {
      ok: false,
      message: `A Pyraminx has 9 stickers of each colour. This one has ${detail}.`,
      canonical: null,
    };
  }
  const faces = faceColorMap(state);
  if (!faces) {
    return {
      ok: false,
      message: "The four centres need four different colour triplets, one colour missing from each. Check the stickers beside the tips.",
      canonical: null,
    };
  }
  const map: Record<string, string> = { [faces.F]: "g", [faces.R]: "r", [faces.L]: "b", [faces.D]: "y" };
  const canonical = [...state].map((letter) => map[letter] ?? letter).join("");
  const core = readCore(canonical);
  if (!core) {
    return {
      ok: false,
      message: "Some stickers do not form a real tip, centre, or edge of this Pyraminx. A mirrored colour arrangement cannot be turned into the usual one.",
      canonical: null,
    };
  }
  const flip = core.eo.reduce((sum, bit) => sum + bit, 0) % 2;
  if (flip !== 0) {
    return {
      ok: false,
      message: "Every real piece is present, but an edge is flipped in a way a Pyraminx cannot reach.",
      canonical: null,
    };
  }
  if (permParity(core.ep) !== 0) {
    return {
      ok: false,
      message: "Every real piece is present, but two edges are swapped. A Pyraminx cannot make that swap.",
      canonical: null,
    };
  }
  return { ok: true, message: "", canonical };
}

export function randomPyraScramble(rng: () => number = Math.random, turns = 11): string[] {
  const moves: string[] = [];
  let previous = "";
  for (let n = 0; n < turns; n += 1) {
    let vertex: PyraVertex = PYRA_VERTICES[Math.floor(rng() * 4)]!;
    let guard = 0;
    while (vertex === previous && guard < 6) {
      vertex = PYRA_VERTICES[Math.floor(rng() * 4)]!;
      guard += 1;
    }
    if (vertex === previous) vertex = PYRA_VERTICES[(PYRA_VERTICES.indexOf(vertex) + 1) % 4]!;
    previous = vertex;
    moves.push(rng() < 0.5 ? `${vertex}'` : vertex);
  }
  for (const vertex of PYRA_VERTICES) {
    const roll = rng();
    if (roll < 0.34) moves.push(vertex.toLowerCase());
    else if (roll < 0.67) moves.push(`${vertex.toLowerCase()}'`);
  }
  return moves;
}

export function scramblePyra(seed = 1): string {
  return applyPyraMoves(SOLVED_PYRA, randomPyraScramble(mulberry32(seed)));
}

export function blankPyra(): string {
  return ".".repeat(PYRA_STICKERS);
}

export function pyraFaceOf(index: number): PyraFace {
  return PYRA_FACES[Math.floor(index / 9)] ?? "F";
}

export function pyraFilled(cells: string, face: PyraFace): number {
  const start = PYRA_FACES.indexOf(face) * 9;
  let filled = 0;
  for (let local = 0; local < 9; local += 1) if (cells[start + local] && cells[start + local] !== ".") filled += 1;
  return filled;
}

export function pyraFirstBlank(cells: string): PyraFace {
  return PYRA_FACES.find((face) => pyraFilled(cells, face) < 9) ?? "F";
}

export const PYRA_GUIDE: Record<PyraFace, { title: string; turn: string }> = {
  F: { title: "Front", turn: "Hold the Pyraminx with one face toward you and one face on the bottom. Paint the face toward you." },
  R: { title: "Right", turn: "Turn the Pyraminx so the right face comes toward you. Keep the same face on the bottom." },
  L: { title: "Left", turn: "Turn the Pyraminx so the left face comes toward you. Keep the same face on the bottom." },
  D: { title: "Down", turn: "Tip the Pyraminx toward you so the bottom face comes toward you. The edge that was nearest you sits at the top." },
};

const STICKER_ROLE = ["top tip", "left edge", "top centre", "right edge", "left tip", "left centre", "bottom edge", "right centre", "right tip"];

export function pyraStickerLabel(face: PyraFace, local: number): string {
  return `${PYRA_GUIDE[face].title} ${STICKER_ROLE[local] ?? "sticker"}`;
}

/** Camera sits a little off the face normal so the neighbouring faces stay visible. */
export function pyraFacePose(face: PyraFace): { theta: number; phi: number } {
  const normal = FACE_SPEC.find((spec) => spec.name === face)!.normal;
  const bias = face === "D" ? v(0.15, 0, 0.55) : v(normal.x * 0.08, 0.22, normal.z * 0.08);
  const dir = normalize(add(normal, bias));
  return { theta: Math.atan2(dir.x, dir.z), phi: Math.acos(Math.max(-1, Math.min(1, dir.y))) };
}

export function pyraStickerPoint(face: PyraFace, local: number): Vec {
  const index = PYRA_FACES.indexOf(face) * 9 + local;
  return BY_INDEX[index]!.centroid;
}

export function pyraMoveSpeech(move: string): string {
  const letter = (move[0] ?? "").toLowerCase();
  const place = { u: "up", l: "left", r: "right", b: "back" }[letter] ?? "named";
  const dir = move.endsWith("'") ? "anticlockwise" : "clockwise";
  if (move[0] === move[0]?.toLowerCase()) return `The ${place} tip turns ${dir}.`;
  return `The ${place} vertex, and the layer under it, turns ${dir}.`;
}

export const PYRA_HOLD = "Hold one face toward you and one face on the bottom. U is the top tip, L the front-left tip, R the front-right tip, and B the back tip. Right is red when green is in front and yellow is on the bottom.";

export function pyraBodyTriangles(): { positions: Float32Array; indices: number[] } {
  const names: PyraVertex[] = ["U", "L", "R", "B"];
  const positions = new Float32Array(names.flatMap((name) => {
    const p = scale(PYRA_VERTEX[name], 0.97);
    return [p.x, p.y, p.z];
  }));
  const index = new Map(names.map((name, n) => [name, n]));
  const indices: number[] = [];
  for (const [a, b, c] of [["U", "L", "R"], ["U", "R", "B"], ["U", "B", "L"], ["L", "R", "B"]] as [PyraVertex, PyraVertex, PyraVertex][]) {
    const A = PYRA_VERTEX[a];
    const B = PYRA_VERTEX[b];
    const C = PYRA_VERTEX[c];
    const outward = dot(cross(sub(B, A), sub(C, A)), centroid([A, B, C])) > 0;
    const second = outward ? b : c;
    const third = outward ? c : b;
    indices.push(index.get(a)!, index.get(second)!, index.get(third)!);
  }
  return { positions, indices };
}

export function letterOfColor(color: ColorName): string {
  return LETTER[color];
}
