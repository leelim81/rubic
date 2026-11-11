/**
 * Megaminx model.
 *
 * Twelve faces of a regular dodecahedron. Each face has one centre, five
 * edges and five corners (11 stickers). Centres stay put and name the faces.
 * A face turn is the rotation you see when looking straight at that face:
 * a bare letter is 72° clockwise, ' is 72° the other way, ++ is 144°
 * clockwise and -- is 144° the other way (R++ D-- U, and the same suffixes
 * on every face).
 *
 * Hold: white on top, grey on the bottom, green in front. Clockwise around
 * white: green, purple, yellow, blue, red. Opposites are white/grey,
 * red/orange, green/lime, yellow/cream, purple/pink, blue/sky.
 */

export const MEGA_STICKERS = 132;
export const FACE_COUNT = 12;
export const STICKERS_PER_FACE = 11;

export const FACE_NAMES = ["U", "L", "F", "R", "BR", "BL", "DR", "B", "DL", "FL", "FR", "D"] as const;
export type MegaFace = (typeof FACE_NAMES)[number];

export interface MegaColor {
  id: string;
  letter: string;
  mark: string;
  hex: string;
  ink: string;
  halo: string;
  /** Spoken name. */
  name: string;
}

/** Index matches the face that wears this colour when the puzzle is solved. */
export const MEGA_COLORS: MegaColor[] = [
  { id: "white", letter: "w", mark: "W", hex: "#f4f1ea", ink: "#161616", halo: "#ffffff", name: "white" },
  { id: "purple", letter: "p", mark: "P", hex: "#6d35d4", ink: "#ffffff", halo: "#1a0838", name: "purple" },
  { id: "green", letter: "g", mark: "G", hex: "#1f9d55", ink: "#06210f", halo: "#ffffff", name: "green" },
  { id: "red", letter: "r", mark: "R", hex: "#d7263d", ink: "#ffffff", halo: "#2a060c", name: "red" },
  { id: "blue", letter: "b", mark: "B", hex: "#2f6fed", ink: "#ffffff", halo: "#06122e", name: "blue" },
  { id: "yellow", letter: "y", mark: "Y", hex: "#f5d20f", ink: "#1c1600", halo: "#ffffff", name: "yellow" },
  { id: "pink", letter: "k", mark: "K", hex: "#e45aa0", ink: "#2a0618", halo: "#ffffff", name: "pink" },
  { id: "lime", letter: "l", mark: "L", hex: "#b6e034", ink: "#172000", halo: "#ffffff", name: "lime" },
  { id: "orange", letter: "o", mark: "O", hex: "#f18f01", ink: "#1c1000", halo: "#ffffff", name: "orange" },
  { id: "sky", letter: "c", mark: "C", hex: "#49c2f2", ink: "#06202c", halo: "#ffffff", name: "sky" },
  { id: "cream", letter: "m", mark: "M", hex: "#e6c56e", ink: "#241800", halo: "#ffffff", name: "cream" },
  { id: "grey", letter: "e", mark: "E", hex: "#8b90a0", ink: "#12141c", halo: "#ffffff", name: "grey" },
];

const LETTER_INDEX = new Map(MEGA_COLORS.map((color, index) => [color.letter, index]));

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface MegaSticker {
  index: number;
  face: number;
  /** 0 centre, 1–5 edge toward clockwise neighbour i−1, 6–10 corner i−6. */
  local: number;
  kind: "center" | "edge" | "corner";
  normal: Vec;
  polygon: Vec[];
  centroid: Vec;
  piece: number;
}

export interface MegaPiece {
  kind: "center" | "edge" | "corner";
  id: number;
  stickers: number[];
  /** Faces in clockwise order, as seen from outside the piece. */
  faces: number[];
}

const PHI = (1 + Math.sqrt(5)) / 2;

function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: Vec, factor: number): Vec {
  return { x: a.x * factor, y: a.y * factor, z: a.z * factor };
}

function cross(a: Vec, b: Vec): Vec {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(a: Vec): Vec {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / length);
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return add(a, scale(sub(b, a), t));
}

function perpendicular(v: Vec): Vec {
  const axis = Math.abs(v.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalize(cross(v, axis));
}

function rodrigues(v: Vec, axis: Vec, angle: number): Vec {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return add(add(scale(v, cos), scale(cross(axis, v), sin)), scale(axis, dot(axis, v) * (1 - cos)));
}

function rotateFromTo(from: Vec, to: Vec): (v: Vec) => Vec {
  const axis = cross(from, to);
  const len = Math.hypot(axis.x, axis.y, axis.z);
  if (len < 1e-8) {
    if (dot(from, to) > 0) return (v) => v;
    const perp = perpendicular(from);
    return (v) => rodrigues(v, perp, Math.PI);
  }
  const angle = Math.atan2(len, dot(from, to));
  const unit = scale(axis, 1 / len);
  return (v) => rodrigues(v, unit, angle);
}

function rotateY(v: Vec, angle: number): Vec {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: v.x * cos + v.z * sin, y: v.y, z: -v.x * sin + v.z * cos };
}

function icosaNormals(): Vec[] {
  const raw: Vec[] = [];
  for (const s of [1, -1]) {
    for (const t of [1, -1]) {
      raw.push(normalize({ x: 0, y: s, z: t * PHI }));
      raw.push(normalize({ x: t * PHI, y: 0, z: s }));
      raw.push(normalize({ x: s, y: t * PHI, z: 0 }));
    }
  }
  return raw;
}

function neighborIndices(normals: Vec[], index: number): number[] {
  const ranked = normals
    .map((normal, i) => ({ i, d: dot(normal, normals[index]!) }))
    .filter((item) => item.i !== index)
    .sort((a, b) => b.d - a.d);
  return ranked.slice(0, 5).map((item) => item.i);
}

function oppositeIndex(normals: Vec[], index: number): number {
  let best = 0;
  let bestDot = Infinity;
  normals.forEach((normal, i) => {
    const value = dot(normal, normals[index]!);
    if (value < bestDot) {
      bestDot = value;
      best = i;
    }
  });
  return best;
}

/** Clockwise when looking at the face from outside. */
function clockwiseOrder(normals: Vec[], index: number, neighbors: number[]): number[] {
  const normal = normals[index]!;
  const tangent = perpendicular(normal);
  const bitangent = cross(normal, tangent);
  const angle = (i: number) => Math.atan2(dot(normals[i]!, bitangent), dot(normals[i]!, tangent));
  return [...neighbors].sort((a, b) => angle(a) - angle(b));
}

function orientNormals(raw: Vec[]): Vec[] {
  const lift = rotateFromTo(raw[0]!, { x: 0, y: 1, z: 0 });
  let normals = raw.map(lift);
  const up = normals.reduce((best, normal, index) => (normal.y > normals[best]!.y ? index : best), 0);
  const neighbors = neighborIndices(normals, up);
  const front = neighbors.reduce((best, index) => (normals[index]!.z > normals[best]!.z ? index : best), neighbors[0]!);
  const yaw = Math.atan2(normals[front]!.x, normals[front]!.z);
  normals = normals.map((normal) => rotateY(normal, -yaw));
  return normals;
}

interface BuiltGeometry {
  normals: Vec[];
  /** adj[face] is the five neighbouring faces, clockwise from outside. */
  adj: number[][];
  opposite: number[];
  stickers: MegaSticker[];
  pieces: MegaPiece[];
  edges: MegaPiece[];
  corners: MegaPiece[];
  outlines: Vec[][];
}

function buildGeometry(): BuiltGeometry {
  const geom = orientNormals(icosaNormals());
  const up = geom.reduce((best, normal, index) => (normal.y > geom[best]!.y ? index : best), 0);
  const around = clockwiseOrder(geom, up, neighborIndices(geom, up));
  const frontAt = around.reduce((best, index, place) => (geom[index]!.z > geom[around[best]!]!.z ? place : best), 0);
  const fromFront = Array.from({ length: 5 }, (_, k) => around[(frontAt + k) % 5]!);
  const geomOfName = new Map<MegaFace, number>();
  geomOfName.set("U", up);
  geomOfName.set("F", fromFront[0]!);
  geomOfName.set("L", fromFront[1]!);
  geomOfName.set("BL", fromFront[2]!);
  geomOfName.set("BR", fromFront[3]!);
  geomOfName.set("R", fromFront[4]!);
  geomOfName.set("D", oppositeIndex(geom, up));
  geomOfName.set("B", oppositeIndex(geom, geomOfName.get("F")!));
  geomOfName.set("DL", oppositeIndex(geom, geomOfName.get("R")!));
  geomOfName.set("DR", oppositeIndex(geom, geomOfName.get("L")!));
  geomOfName.set("FL", oppositeIndex(geom, geomOfName.get("BR")!));
  geomOfName.set("FR", oppositeIndex(geom, geomOfName.get("BL")!));
  const order = FACE_NAMES.map((name) => {
    const index = geomOfName.get(name);
    if (index === undefined) throw new Error(`Missing megaminx face ${name}`);
    return index;
  });
  if (new Set(order).size !== 12) throw new Error("Megaminx face names collided");
  const normals = order.map((index) => geom[index]!);
  const remap = new Map(order.map((geomIndex, nameIndex) => [geomIndex, nameIndex]));
  const adj = normals.map((_, face) => {
    const geomFace = order[face]!;
    return clockwiseOrder(geom, geomFace, neighborIndices(geom, geomFace)).map((index) => {
      const named = remap.get(index);
      if (named === undefined) throw new Error("Megaminx neighbour was not named");
      return named;
    });
  });
  const opposite = normals.map((_, face) => {
    const named = remap.get(oppositeIndex(geom, order[face]!));
    if (named === undefined) throw new Error("Megaminx opposite was not named");
    return named;
  });

  const radius = faceScale(normals, adj);
  const stickers: MegaSticker[] = [];
  const outlines: Vec[][] = [];
  const pieceOfEdge = new Map<string, number>();
  const pieceOfCorner = new Map<string, number>();
  const edges: MegaPiece[] = [];
  const corners: MegaPiece[] = [];
  const centers: MegaPiece[] = [];

  for (let face = 0; face < FACE_COUNT; face += 1) {
    const normal = normals[face]!;
    const neighbors = adj[face]!;
    const vertices = neighbors.map((_, i) => cornerDirection(normal, normals[neighbors[i]!]!, normals[neighbors[(i + 1) % 5]!]!));
    const center = scale(normal, radius);
    const faceVerts = vertices.map((direction) => onPlane(direction, normal, radius));
    outlines[face] = faceVerts.map((vertex) => lerp(center, vertex, 0.97));
    const centerPoly = inset(faceVerts.map((vertex) => lerp(center, vertex, 0.36)), 0.08);
    pushSticker(stickers, face, 0, "center", normal, centerPoly, face);
    centers.push({ kind: "center", id: face, stickers: [face * STICKERS_PER_FACE], faces: [face] });

    for (let i = 0; i < 5; i += 1) {
      const left = faceVerts[(i + 4) % 5]!;
      const right = faceVerts[i]!;
      const mid = lerp(left, right, 0.5);
      const outerL = lerp(center, lerp(mid, left, 0.62), 0.94);
      const outerR = lerp(center, lerp(mid, right, 0.62), 0.94);
      const innerL = lerp(center, left, 0.4);
      const innerR = lerp(center, right, 0.4);
      const edgePoly = inset([innerL, innerR, outerR, outerL], 0.1);
      const neighbor = neighbors[i]!;
      const key = face < neighbor ? `${face}-${neighbor}` : `${neighbor}-${face}`;
      let piece = pieceOfEdge.get(key);
      if (piece === undefined) {
        piece = edges.length;
        pieceOfEdge.set(key, piece);
        edges.push({ kind: "edge", id: piece, stickers: [], faces: face < neighbor ? [face, neighbor] : [neighbor, face] });
      }
      const local = 1 + i;
      pushSticker(stickers, face, local, "edge", normal, edgePoly, piece);
      edges[piece]!.stickers.push(face * STICKERS_PER_FACE + local);

      const next = faceVerts[(i + 1) % 5]!;
      const tip = lerp(center, right, 0.95);
      const wingL = lerp(center, lerp(right, left, 0.42), 0.8);
      const wingR = lerp(center, lerp(right, next, 0.42), 0.8);
      const inner = lerp(center, right, 0.46);
      const cornerPoly = inset([inner, wingL, tip, wingR], 0.08);
      const faces = [face, neighbors[i]!, neighbors[(i + 1) % 5]!].sort((a, b) => a - b);
      const cornerKey = faces.join("-");
      let corner = pieceOfCorner.get(cornerKey);
      if (corner === undefined) {
        corner = corners.length;
        pieceOfCorner.set(cornerKey, corner);
        corners.push({ kind: "corner", id: corner, stickers: [], faces: clockwiseFaces(normals, faces) });
      }
      const cornerLocal = 6 + i;
      pushSticker(stickers, face, cornerLocal, "corner", normal, cornerPoly, corner);
      corners[corner]!.stickers.push(face * STICKERS_PER_FACE + cornerLocal);
    }
  }

  if (edges.length !== 30 || corners.length !== 20 || stickers.length !== MEGA_STICKERS) {
    throw new Error(`Megaminx geometry counted ${edges.length} edges, ${corners.length} corners, ${stickers.length} stickers`);
  }
  for (const edge of edges) {
    if (edge.stickers.length !== 2) throw new Error("Megaminx edge is missing a sticker");
    edge.stickers.sort((a, b) => a - b);
  }
  for (const corner of corners) {
    if (corner.stickers.length !== 3) throw new Error("Megaminx corner is missing a sticker");
    corner.stickers = corner.faces.map((face) => corner.stickers.find((index) => Math.floor(index / STICKERS_PER_FACE) === face)!);
  }
  return { normals, adj, opposite, stickers, pieces: [...centers, ...edges, ...corners], edges, corners, outlines };
}

function clockwiseFaces(normals: Vec[], faces: number[]): number[] {
  const center = normalize(faces.reduce((sum, face) => add(sum, normals[face]!), { x: 0, y: 0, z: 0 }));
  const tangent = perpendicular(center);
  const bitangent = cross(center, tangent);
  const angle = (face: number) => Math.atan2(dot(normals[face]!, bitangent), dot(normals[face]!, tangent));
  return [...faces].sort((a, b) => angle(a) - angle(b));
}

function cornerDirection(normal: Vec, a: Vec, b: Vec): Vec {
  return normalize(add(normal, add(a, b)));
}

function onPlane(direction: Vec, normal: Vec, dist: number): Vec {
  return scale(direction, dist / dot(direction, normal));
}

function faceScale(normals: Vec[], adj: number[][]): number {
  const normal = normals[0]!;
  const neighbors = adj[0]!;
  const direction = cornerDirection(normal, normals[neighbors[0]!]!, normals[neighbors[1]!]!);
  const raw = 1 / dot(direction, normal);
  const target = 1.62;
  return target / (raw * Math.hypot(direction.x, direction.y, direction.z));
}

function inset(points: Vec[], amount: number): Vec[] {
  const center = centroid(points);
  return points.map((point) => lerp(center, point, 1 - amount));
}

function centroid(points: Vec[]): Vec {
  const sum = points.reduce((acc, point) => add(acc, point), { x: 0, y: 0, z: 0 });
  return scale(sum, 1 / points.length);
}

function pushSticker(stickers: MegaSticker[], face: number, local: number, kind: MegaSticker["kind"], normal: Vec, polygon: Vec[], piece: number) {
  const lifted = polygon.map((point) => add(point, scale(normal, 0.012)));
  stickers.push({
    index: face * STICKERS_PER_FACE + local,
    face,
    local,
    kind,
    normal,
    polygon: lifted,
    centroid: centroid(lifted),
    piece,
  });
}

const GEO = buildGeometry();

export const MEGA_NORMALS: readonly Vec[] = GEO.normals;
export const MEGA_ADJ: readonly (readonly number[])[] = GEO.adj;
export const MEGA_OPPOSITE: readonly number[] = GEO.opposite;
export const MEGA_STICKER_MESH: readonly MegaSticker[] = GEO.stickers;
export const MEGA_EDGES: readonly MegaPiece[] = GEO.edges;
export const MEGA_CORNERS: readonly MegaPiece[] = GEO.corners;
export const MEGA_PIECES: readonly MegaPiece[] = GEO.pieces;
export const MEGA_FACE_OUTLINE: readonly (readonly Vec[])[] = GEO.outlines;

export function megaFaceIndex(face: MegaFace): number {
  return FACE_NAMES.indexOf(face);
}

export function solvedMegaString(): string {
  return FACE_NAMES.map((_, face) => MEGA_COLORS[face]!.letter.repeat(STICKERS_PER_FACE)).join("");
}

export function blankMegaString(): string {
  return FACE_NAMES.map((_, face) => {
    const letter = MEGA_COLORS[face]!.letter;
    return letter + ".".repeat(STICKERS_PER_FACE - 1);
  }).join("");
}

const FACE_TOKEN = /^(BR|BL|DR|DL|FL|FR|[ULFRBD])/;

export interface ParsedMega {
  face: number;
  /** Clockwise steps when looking at the face: 1, 2, 3 or 4. */
  steps: 1 | 2 | 3 | 4;
}

export function parseMegaMove(move: string): ParsedMega {
  const match = FACE_TOKEN.exec(move);
  if (!match) throw new Error(`Unknown megaminx move “${move}”`);
  const face = FACE_NAMES.indexOf(match[1] as MegaFace);
  const suffix = move.slice(match[1]!.length);
  const steps = suffix === "" || suffix === "+" ? 1
    : suffix === "'" || suffix === "-" ? 4
      : suffix === "++" || suffix === "2" ? 2
        : suffix === "--" || suffix === "2'" ? 3
          : 0;
  if (!steps) throw new Error(`Unknown megaminx move “${move}”`);
  return { face, steps: steps as ParsedMega["steps"] };
}

export function formatMegaMove(move: ParsedMega): string {
  const name = FACE_NAMES[move.face]!;
  if (move.steps === 1) return name;
  if (move.steps === 2) return `${name}++`;
  if (move.steps === 3) return `${name}--`;
  return `${name}'`;
}

export function invertMegaMove(move: string): string {
  const parsed = parseMegaMove(move);
  return formatMegaMove({ face: parsed.face, steps: ((5 - parsed.steps) % 5 || 5) as ParsedMega["steps"] });
}

export function megaMoveSpeech(move: string): string {
  const parsed = parseMegaMove(move);
  const face = FACE_SPOKEN[FACE_NAMES[parsed.face]!]!;
  const turns = parsed.steps === 1 ? "72 degrees clockwise" : parsed.steps === 2 ? "144 degrees clockwise" : parsed.steps === 3 ? "144 degrees the other way" : "72 degrees the other way";
  return `${face}, ${turns}, as you look at that face.`;
}

const FACE_SPOKEN: Record<MegaFace, string> = {
  U: "Up",
  L: "Left",
  F: "Front",
  R: "Right",
  BR: "Back right",
  BL: "Back left",
  DR: "Down right",
  B: "Back",
  DL: "Down left",
  FL: "Front left",
  FR: "Front right",
  D: "Down",
};

function stickerKey(point: Vec, normal: Vec): string {
  const round = (value: number) => Math.round(value * 1e5);
  return `${round(point.x)},${round(point.y)},${round(point.z)}|${round(normal.x)},${round(normal.y)},${round(normal.z)}`;
}

/** perm[dest] = source sticker. Built for one clockwise click of each face. */
function buildQuarterPerms(): Uint8Array[] {
  const byKey = new Map<string, number>();
  for (const sticker of MEGA_STICKER_MESH) byKey.set(stickerKey(sticker.centroid, sticker.normal), sticker.index);
  const onFace = new Set<number>();
  return MEGA_NORMALS.map((normal, face) => {
    onFace.clear();
    for (const piece of MEGA_PIECES) {
      if (!piece.faces.includes(face) && !(piece.kind === "center" && piece.id === face)) continue;
      for (const index of piece.stickers) onFace.add(index);
    }
    for (const sticker of MEGA_STICKER_MESH) {
      if (sticker.face === face) onFace.add(sticker.index);
    }
    const perm = new Uint8Array(MEGA_STICKERS);
    for (let i = 0; i < MEGA_STICKERS; i += 1) perm[i] = i;
    const angle = (72 * Math.PI) / 180;
    for (const sticker of MEGA_STICKER_MESH) {
      if (!onFace.has(sticker.index)) continue;
      const destPoint = rodrigues(sticker.centroid, normal, angle);
      const destNormal = normalize(rodrigues(sticker.normal, normal, angle));
      const dest = byKey.get(stickerKey(destPoint, destNormal));
      if (dest === undefined) throw new Error(`Megaminx ${FACE_NAMES[face]} turn lost a sticker`);
      perm[dest] = sticker.index;
    }
    return perm;
  });
}

const QUARTER = buildQuarterPerms();

function powPerm(base: Uint8Array, steps: number): Uint8Array {
  const current = new Uint8Array(base.length);
  const next = new Uint8Array(base.length);
  for (let i = 0; i < base.length; i += 1) current[i] = i;
  for (let step = 0; step < steps; step += 1) {
    for (let i = 0; i < base.length; i += 1) next[i] = base[current[i]!]!;
    current.set(next);
  }
  return current;
}

const MOVE_PERMS: Uint8Array[] = QUARTER.flatMap((perm) => [1, 2, 3, 4].map((steps) => powPerm(perm, steps)));

export function megaMoveIndex(move: ParsedMega): number {
  return move.face * 4 + (move.steps - 1);
}

export const MEGA_MOVE_COUNT = 48;

export function applyMegaPerm(state: Uint8Array, perm: Uint8Array, into = new Uint8Array(MEGA_STICKERS)): Uint8Array {
  for (let i = 0; i < MEGA_STICKERS; i += 1) into[i] = state[perm[i]!]!;
  return into;
}

export function megaFromString(text: string): Uint8Array {
  if (text.length !== MEGA_STICKERS) throw new Error("A megaminx colouring needs 132 stickers.");
  const out = new Uint8Array(MEGA_STICKERS);
  for (let i = 0; i < MEGA_STICKERS; i += 1) {
    const value = LETTER_INDEX.get(text[i] ?? "");
    if (value === undefined) throw new Error("A megaminx sticker has a colour this puzzle does not use.");
    out[i] = value;
  }
  return out;
}

export function megaToString(state: Uint8Array): string {
  let out = "";
  for (let i = 0; i < state.length; i += 1) out += MEGA_COLORS[state[i]!]!.letter;
  return out;
}

export function applyMegaMoves(state: Uint8Array, moves: readonly string[]): Uint8Array {
  let current = state;
  const scratch = new Uint8Array(MEGA_STICKERS);
  for (const move of moves) {
    applyMegaPerm(current, MOVE_PERMS[megaMoveIndex(parseMegaMove(move))]!, scratch);
    current = scratch.slice();
  }
  return current;
}

export function applyMegaString(text: string, moves: readonly string[]): string {
  return megaToString(applyMegaMoves(megaFromString(text.replaceAll(".", "w")), moves));
}

export function parseMegaAlg(alg: string): string[] {
  return alg.trim().split(/\s+/).filter(Boolean).map((token) => formatMegaMove(parseMegaMove(token)));
}

export interface PieceView {
  edgePiece: Uint8Array;
  edgeOri: Uint8Array;
  cornerPiece: Uint8Array;
  cornerOri: Uint8Array;
}

export function readPieces(state: Uint8Array): PieceView {
  const edgePiece = new Uint8Array(30);
  const edgeOri = new Uint8Array(30);
  const cornerPiece = new Uint8Array(20);
  const cornerOri = new Uint8Array(20);
  for (let slot = 0; slot < 30; slot += 1) {
    const stickers = MEGA_EDGES[slot]!.stickers;
    const colors = stickers.map((index) => state[index]!);
    const found = MEGA_EDGES.findIndex((edge) => {
      const home = edge.faces.map((face) => face);
      return (colors[0] === home[0] && colors[1] === home[1]) || (colors[0] === home[1] && colors[1] === home[0]);
    });
    edgePiece[slot] = found < 0 ? 255 : found;
    edgeOri[slot] = found < 0 ? 0 : colors[0] === MEGA_EDGES[found]!.faces[0] ? 0 : 1;
  }
  for (let slot = 0; slot < 20; slot += 1) {
    const stickers = MEGA_CORNERS[slot]!.stickers;
    const colors = stickers.map((index) => state[index]!);
    const found = MEGA_CORNERS.findIndex((corner) => corner.faces.every((face) => colors.includes(face)));
    cornerPiece[slot] = found < 0 ? 255 : found;
    if (found < 0) continue;
    const home = MEGA_CORNERS[found]!.faces;
    cornerOri[slot] = ([0, 1, 2] as const).find((ori) => colors.every((color, index) => color === home[(index + ori) % 3])) ?? 255;
  }
  return { edgePiece, edgeOri, cornerPiece, cornerOri };
}

interface MoveTables {
  edgeSlot: Uint8Array;
  edgeTwist: Uint8Array;
  cornerSlot: Uint8Array;
  cornerTwist: Uint8Array;
}

function buildMoveTables(): MoveTables[] {
  const solved = megaFromString(solvedMegaString());
  return MOVE_PERMS.map((perm) => {
    const turned = applyMegaPerm(solved, perm);
    const view = readPieces(turned);
    const edgeSlot = new Uint8Array(30);
    const edgeTwist = new Uint8Array(30);
    const cornerSlot = new Uint8Array(20);
    const cornerTwist = new Uint8Array(20);
    for (let slot = 0; slot < 30; slot += 1) {
      const piece = view.edgePiece[slot]!;
      edgeSlot[piece] = slot;
      edgeTwist[piece] = view.edgeOri[slot]!;
    }
    for (let slot = 0; slot < 20; slot += 1) {
      const piece = view.cornerPiece[slot]!;
      cornerSlot[piece] = slot;
      cornerTwist[piece] = view.cornerOri[slot]!;
    }
    return { edgeSlot, edgeTwist, cornerSlot, cornerTwist };
  });
}

export const MEGA_MOVE_TABLES: readonly MoveTables[] = buildMoveTables();

export function applyPieceMove(view: PieceView, move: number, into?: PieceView): PieceView {
  const table = MEGA_MOVE_TABLES[move]!;
  const edgePiece = into?.edgePiece ?? new Uint8Array(30);
  const edgeOri = into?.edgeOri ?? new Uint8Array(30);
  const cornerPiece = into?.cornerPiece ?? new Uint8Array(20);
  const cornerOri = into?.cornerOri ?? new Uint8Array(20);
  for (let piece = 0; piece < 30; piece += 1) {
    const slot = locateEdge(view, piece);
    const dest = table.edgeSlot[slot]!;
    edgePiece[dest] = piece;
    edgeOri[dest] = (view.edgeOri[slot]! + table.edgeTwist[slot]!) & 1;
  }
  for (let piece = 0; piece < 20; piece += 1) {
    const slot = locateCorner(view, piece);
    const dest = table.cornerSlot[slot]!;
    cornerPiece[dest] = piece;
    cornerOri[dest] = (view.cornerOri[slot]! + table.cornerTwist[slot]!) % 3;
  }
  if (into) {
    into.edgePiece = edgePiece;
    into.edgeOri = edgeOri;
    into.cornerPiece = cornerPiece;
    into.cornerOri = cornerOri;
    return into;
  }
  return { edgePiece, edgeOri, cornerPiece, cornerOri };
}

function locateEdge(view: PieceView, piece: number): number {
  for (let slot = 0; slot < 30; slot += 1) if (view.edgePiece[slot] === piece) return slot;
  throw new Error("Megaminx edge is missing");
}

function locateCorner(view: PieceView, piece: number): number {
  for (let slot = 0; slot < 20; slot += 1) if (view.cornerPiece[slot] === piece) return slot;
  throw new Error("Megaminx corner is missing");
}

export function solvedPieces(): PieceView {
  return readPieces(megaFromString(solvedMegaString()));
}

export function clonePieces(view: PieceView): PieceView {
  return {
    edgePiece: view.edgePiece.slice(),
    edgeOri: view.edgeOri.slice(),
    cornerPiece: view.cornerPiece.slice(),
    cornerOri: view.cornerOri.slice(),
  };
}

export function pieceViewToFacelets(view: PieceView): string {
  const colors = new Uint8Array(MEGA_STICKERS);
  for (let face = 0; face < 12; face += 1) colors[face * STICKERS_PER_FACE] = face;
  for (let slot = 0; slot < 30; slot += 1) {
    const piece = view.edgePiece[slot]!;
    const faces = MEGA_EDGES[piece]!.faces;
    const ordered = view.edgeOri[slot] ? [faces[1]!, faces[0]!] : [faces[0]!, faces[1]!];
    MEGA_EDGES[slot]!.stickers.forEach((index, place) => {
      colors[index] = ordered[place]!;
    });
  }
  for (let slot = 0; slot < 20; slot += 1) {
    const home = MEGA_CORNERS[view.cornerPiece[slot]!]!.faces;
    const ori = view.cornerOri[slot]!;
    MEGA_CORNERS[slot]!.stickers.forEach((index, place) => {
      colors[index] = home[(place + ori) % 3]!;
    });
  }
  return megaToString(colors);
}

export function randomMegaScramble(random: () => number, length = 40): string[] {
  const moves: string[] = [];
  let previous = -1;
  for (let i = 0; i < length; i += 1) {
    let face = Math.floor(random() * 12);
    if (face === previous) face = (face + 1) % 12;
    previous = face;
    const steps = (1 + Math.floor(random() * 4)) as ParsedMega["steps"];
    moves.push(formatMegaMove({ face, steps }));
  }
  return moves;
}

export function faceletsSolved(text: string): boolean {
  return text === solvedMegaString();
}

export function stickerOnFace(face: number, local: number): number {
  return face * STICKERS_PER_FACE + local;
}

export function isMegaCentre(index: number): boolean {
  return index % STICKERS_PER_FACE === 0;
}
