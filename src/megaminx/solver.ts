import type { Solution, TeachingChunk } from "../solver/beginner";
import {
  MEGA_ADJ,
  MEGA_CORNERS,
  MEGA_EDGES,
  MEGA_MOVE_TABLES,
  MEGA_OPPOSITE,
  applyMegaString,
  formatMegaMove,
  megaFromString,
  parseMegaMove,
  readPieces,
  solvedMegaString,
} from "./model";
import { CORNER_ALGS } from "./layerAlgs";
import { solveByCycles } from "./cycleSolve";
import { validateMega } from "./validate";

/**
 * Face-by-face megaminx search. Finished faces are never turned again, so
 * each later stage searches a smaller set of moves. Small pruning tables and
 * an edge-orientation table (the same staging as Nei Chen's cube-solver)
 * place the first eleven faces. The last face is orientation, then
 * permutation, over algorithms searched for this puzzle. A 144° turn counts
 * as one move.
 */

const TRACE = typeof process !== "undefined" && process.env.MEGA_TRACE === "1";
const FACE_BITS = (1 << 12) - 1;
const SOLVED_MARK = 65534;
const UNSEEN = 65535;

interface PlaceTable {
  kind: "place";
  pcs: number[];
  loc: Int16Array[];
  inv: Int16Array[];
  radix: number[];
  dist: Uint8Array;
}

interface EOTable {
  kind: "eo";
  pcs: number[];
  g: Int8Array;
  c: Int8Array;
  bit: Int32Array;
  dist: Uint8Array;
}

type Guide = PlaceTable | EOTable;

interface Step {
  face: number;
  S: number;
  add: number[];
}

interface Macro {
  moves: number[];
  inverse: number[];
  toC: number[];
  cd: number[];
  toE: number[];
  ed: number[];
  edgesFixed: boolean;
}

const INV = new Uint8Array(48);
for (let move = 0; move < 48; move += 1) {
  const face = move >> 2;
  const steps = (move & 3) + 1;
  INV[move] = face * 4 + ((5 - steps) % 5) - 1;
}

const eDest = MEGA_MOVE_TABLES.map((table) => table.edgeSlot);
const eTwist = MEGA_MOVE_TABLES.map((table) => table.edgeTwist);
const cDest = MEGA_MOVE_TABLES.map((table) => table.cornerSlot);
const cTwist = MEGA_MOVE_TABLES.map((table) => table.cornerTwist);

const cornerMap = Array.from({ length: 48 }, (_, move) => {
  const map = new Uint8Array(60);
  for (let local = 0; local < 60; local += 1) {
    const slot = (local / 3) | 0;
    const dest = cDest[move]![slot]!;
    map[local] = dest * 3 + ((local % 3) + cTwist[move]![slot]!) % 3;
  }
  return map;
});
const edgeMap = Array.from({ length: 48 }, (_, move) => {
  const map = new Uint8Array(60);
  for (let local = 0; local < 60; local += 1) {
    const slot = local >> 1;
    const dest = eDest[move]![slot]!;
    map[local] = (dest << 1) | (((local & 1) + eTwist[move]![slot]!) & 1);
  }
  return map;
});

const cornerMask = MEGA_CORNERS.map((corner) => corner.faces.reduce((mask, face) => mask | (1 << face), 0));
const edgeMask = MEGA_EDGES.map((edge) => edge.faces.reduce((mask, face) => mask | (1 << face), 0));

function pieceMask(piece: number): number {
  return piece < 20 ? cornerMask[piece]! : edgeMask[piece - 20]!;
}

function solvedCode(piece: number): number {
  return piece < 20 ? piece * 3 : (piece - 20) * 2;
}

function movedCode(piece: number, code: number, move: number): number {
  return piece < 20 ? cornerMap[move]![code]! : edgeMap[move]![code]!;
}

function popcount(mask: number): number {
  let count = 0;
  let bits = mask;
  while (bits) {
    count += bits & 1;
    bits >>= 1;
  }
  return count;
}

function makePlan(top: number): Step[] {
  const bottom = MEGA_OPPOSITE[top]!;
  const order = [bottom, ...MEGA_ADJ[bottom]!, ...MEGA_ADJ[top]!];
  let removed = 0;
  const steps: Step[] = [];
  for (const face of order) {
    const allowed = removed | (1 << face);
    const add: number[] = [];
    for (let piece = 0; piece < 50; piece += 1) {
      const mask = pieceMask(piece);
      if ((mask & ~allowed) === 0 && (mask & (1 << face))) add.push(piece);
    }
    steps.push({ face, S: FACE_BITS & ~removed, add });
    removed |= 1 << face;
  }
  return steps;
}

function chunk(add: number[]): number[][] {
  const corners = add.filter((piece) => piece < 20);
  const edges = add.filter((piece) => piece >= 20);
  const groups: number[][] = [];
  for (const corner of corners) {
    const mask = pieceMask(corner);
    const group = [corner];
    for (let i = 0; i < edges.length && group.length < 3; i += 1) {
      const edgeMaskBits = pieceMask(edges[i]!);
      if ((edgeMaskBits & mask) === edgeMaskBits) {
        group.push(edges[i]!);
        edges.splice(i, 1);
        i -= 1;
      }
    }
    groups.push(group);
  }
  while (edges.length) groups.push(edges.splice(0, 2));
  return groups;
}

const tableCache = new Map<string, PlaceTable | EOTable>();

function regionCodes(corner: boolean, sMask: number): number[] {
  const masks = corner ? cornerMask : edgeMask;
  const out: number[] = [];
  for (let code = 0; code < 60; code += 1) {
    const slot = corner ? (code / 3) | 0 : code >> 1;
    if (masks[slot]! & sMask) out.push(code);
  }
  return out;
}

function buildTable(pieces: number[], sMask: number): PlaceTable {
  const key = `p${sMask}:${pieces.join(",")}`;
  const cached = tableCache.get(key);
  if (cached && cached.kind === "place") return cached;
  const loc: Int16Array[] = [];
  const inv: Int16Array[] = [];
  const radix: number[] = [];
  let size = 1;
  for (const piece of pieces) {
    const region = regionCodes(piece < 20, sMask);
    const lookup = new Int16Array(60).fill(-1);
    region.forEach((code, index) => {
      lookup[code] = index;
    });
    loc.push(lookup);
    inv.push(Int16Array.from(region));
    radix.push(region.length);
    size *= region.length;
  }
  if (size > 6_000_000) throw new Error("Megaminx stage table is too large.");
  const moves: number[] = [];
  for (let move = 0; move < 48; move += 1) if (sMask & (1 << (move >> 2))) moves.push(move);
  const dist = new Uint8Array(size).fill(255);
  const queue = new Int32Array(size);
  const startCodes = pieces.map(solvedCode);
  const start = encode(startCodes, loc, radix);
  dist[start] = 0;
  queue[0] = start;
  let head = 0;
  let tail = 1;
  const codes = new Int16Array(pieces.length);
  const next = new Int16Array(pieces.length);
  while (head < tail) {
    let packed = queue[head++]!;
    const depth = dist[packed]!;
    for (let j = 0; j < pieces.length; j += 1) {
      codes[j] = inv[j]![packed % radix[j]!]!;
      packed = (packed / radix[j]!) | 0;
    }
    for (const move of moves) {
      let outside = false;
      for (let j = 0; j < pieces.length; j += 1) {
        const landed = movedCode(pieces[j]!, codes[j]!, move);
        if (loc[j]![landed]! < 0) {
          outside = true;
          break;
        }
        next[j] = landed;
      }
      if (outside) continue;
      const packedNext = encode(next, loc, radix);
      if (dist[packedNext] !== 255) continue;
      dist[packedNext] = depth + 1;
      queue[tail++] = packedNext;
    }
  }
  const table: PlaceTable = { kind: "place", pcs: pieces, loc, inv, radix, dist };
  tableCache.set(key, table);
  return table;
}

function encode(codes: ArrayLike<number>, loc: Int16Array[], radix: number[]): number {
  let index = 0;
  for (let j = codes.length - 1; j >= 0; j -= 1) {
    const at = loc[j]![codes[j]!]!;
    index = index * radix[j]! + (at < 0 ? 0 : at);
  }
  return index;
}

function buildEO(sMask: number, tMask: number): EOTable {
  const key = `eo${sMask}:${tMask}`;
  const cached = tableCache.get(key);
  if (cached && cached.kind === "eo") return cached;
  const tMoves: number[] = [];
  const sMoves: number[] = [];
  for (let move = 0; move < 48; move += 1) {
    const bit = 1 << (move >> 2);
    if (tMask & bit) tMoves.push(move);
    if (sMask & bit) sMoves.push(move);
  }
  const tPieces: number[] = [];
  for (let edge = 0; edge < 30; edge += 1) if (edgeMask[edge]! & tMask) tPieces.push(edge);
  const orbit = (start: number) => {
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length) {
      const code = queue.pop()!;
      for (const move of tMoves) {
        const next = edgeMap[move]![code]!;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return [...seen];
  };
  const g = new Int8Array(30);
  if (tPieces.length) {
    for (const code of orbit(tPieces[0]! * 2)) g[code >> 1] = code & 1;
  }
  const cOf = new Int8Array(30);
  for (const piece of tPieces) {
    const code = orbit(piece * 2)[0]!;
    cOf[piece] = ((code & 1) ^ g[code >> 1]!) & 1;
  }
  const slots: number[] = [];
  for (let slot = 0; slot < 30; slot += 1) if (edgeMask[slot]! & sMask) slots.push(slot);
  if (slots.length > 16) throw new Error("Megaminx orientation table is too large.");
  const bit = new Int32Array(30);
  slots.forEach((slot, index) => {
    bit[slot] = 1 << index;
  });
  const trans = sMoves.map((move) => slots.map((slot) => {
    const landed = edgeMap[move]![slot * 2]!;
    const dest = landed >> 1;
    return { to: bit[dest]!, flip: ((landed & 1) ^ g[slot]! ^ g[dest]!) & 1 };
  }));
  const size = 1 << slots.length;
  const dist = new Uint8Array(size).fill(255);
  const queue = new Int32Array(size);
  dist[0] = 0;
  queue[0] = 0;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const state = queue[head++]!;
    const depth = dist[state]!;
    for (const row of trans) {
      let next = 0;
      for (let j = 0; j < slots.length; j += 1) {
        if ((((state >> j) & 1) ^ row[j]!.flip) !== 0) next |= row[j]!.to;
      }
      if (dist[next] !== 255) continue;
      dist[next] = depth + 1;
      queue[tail++] = next;
    }
  }
  const pieces: number[] = [];
  const c = new Int8Array(30);
  for (let edge = 0; edge < 30; edge += 1) {
    if (!(edgeMask[edge]! & sMask)) continue;
    c[pieces.length] = cOf[edge]!;
    pieces.push(20 + edge);
  }
  const table: EOTable = { kind: "eo", pcs: pieces, g, c, bit, dist };
  tableCache.set(key, table);
  return table;
}

function ida(codes: Int16Array, goal: number[], guides: Guide[], sMask: number, maxDepth: number, limit?: { skip?: number; nodes?: number }): number[] | null {
  const target = goal.slice();
  for (const guide of guides) {
    for (const piece of guide.pcs) if (!target.includes(piece)) target.push(piece);
  }
  const width = target.length;
  const goalCount = goal.length;
  const allowed: number[] = [];
  for (let move = 0; move < 48; move += 1) if (sMask & (1 << (move >> 2))) allowed.push(move);
  const goalCodes = target.map(solvedCode);
  const stack = new Int16Array((maxDepth + 2) * width);
  for (let i = 0; i < width; i += 1) stack[i] = codes[target[i]!]!;
  const columns = guides.map((guide) => guide.pcs.map((piece) => target.indexOf(piece)));
  const path: number[] = [];
  const nodeLimit = limit?.nodes ?? 2_000_000;
  let nodes = 0;
  let skipped = limit?.skip ?? 0;
  const heuristic = (offset: number) => {
    let best = 0;
    for (let t = 0; t < guides.length; t += 1) {
      const guide = guides[t]!;
      const cols = columns[t]!;
      let distance = 0;
      if (guide.kind === "eo") {
        let packed = 0;
        for (let j = 0; j < cols.length; j += 1) {
          const code = stack[offset + cols[j]!]!;
          const slot = code >> 1;
          if (((code & 1) ^ guide.g[slot]! ^ guide.c[j]!) & 1) packed |= guide.bit[slot]!;
        }
        distance = guide.dist[packed] ?? 255;
      } else {
        let packed = 0;
        for (let j = cols.length - 1; j >= 0; j -= 1) {
          const at = guide.loc[j]![stack[offset + cols[j]!]!]!;
          if (at < 0) return 255;
          packed = packed * guide.radix[j]! + at;
        }
        distance = guide.dist[packed] ?? 255;
      }
      if (distance > best) best = distance;
    }
    return best;
  };
  const solvedAt = (offset: number) => {
    for (let j = 0; j < goalCount; j += 1) if (stack[offset + j] !== goalCodes[j]) return false;
    return true;
  };
  const dfs = (depth: number, cost: number, bound: number, lastFace: number): boolean => {
    const offset = depth * width;
    const remaining = heuristic(offset);
    if (remaining === 255) return false;
    if (cost + remaining > bound) return false;
    if (remaining === 0 && solvedAt(offset)) {
      if (skipped > 0) {
        skipped -= 1;
        return false;
      }
      return true;
    }
    if (cost === bound || nodes > nodeLimit) return false;
    const next = offset + width;
    for (const move of allowed) {
      const face = move >> 2;
      if (face === lastFace) continue;
      if (lastFace >= 0 && MEGA_OPPOSITE[lastFace] === face && face < lastFace) continue;
      for (let j = 0; j < width; j += 1) stack[next + j] = movedCode(target[j]!, stack[offset + j]!, move);
      nodes += 1;
      path[depth] = move;
      if (dfs(depth + 1, cost + 1, bound, face)) return true;
    }
    return false;
  };
  const start = heuristic(0);
  if (start === 255) return null;
  for (let bound = start; bound <= maxDepth; bound += 1) {
    if (nodes > nodeLimit) return null;
    if (dfs(0, 0, bound, -1)) {
      const solution = path.slice(0, bound);
      for (const move of solution) {
        for (let piece = 0; piece < 50; piece += 1) codes[piece] = movedCode(piece, codes[piece]!, move);
      }
      return solution;
    }
  }
  return null;
}

function solveFromTop(text: string, top: number, progress?: (message: string) => void): number[] {
  tableCache.clear();
  const view = readPieces(megaFromString(text));
  const codes = new Int16Array(50);
  for (let piece = 0; piece < 20; piece += 1) {
    const slot = view.cornerPiece.indexOf(piece);
    codes[piece] = slot < 0 ? solvedCode(piece) : slot * 3 + view.cornerOri[slot]!;
  }
  for (let edge = 0; edge < 30; edge += 1) {
    const slot = view.edgePiece.indexOf(edge);
    codes[20 + edge] = slot < 0 ? solvedCode(20 + edge) : slot * 2 + view.edgeOri[slot]!;
  }
  const plan = makePlan(top);
  const moves: number[] = [];
  let placedCorners = false;
  progress?.("Placing edges");
  for (let index = 0; index < plan.length; index += 1) {
    const step = plan[index]!;
    if (!step.add.length) continue;
    if (!placedCorners && step.add.some((piece) => piece < 20)) {
      placedCorners = true;
      progress?.("Placing corners");
    }
    const started = Date.now();
    const next = plan[index + 1];
    const twoGen = !!next && popcount(next.S) === 2;
    if (popcount(step.S) === 2) {
      const corners = step.add.filter((piece) => piece < 20);
      const edges = step.add.filter((piece) => piece >= 20);
      const specs = [corners.concat(edges.slice(0, 2)), corners.slice(0, 1).concat(edges), corners.slice(1).concat(edges.slice(2))].filter((spec) => spec.length);
      const found = ida(codes, step.add, specs.map((spec) => buildTable(spec, step.S)), step.S, 36, { nodes: 2_000_000 });
      if (!found) throw new Error(step.add.some((piece) => piece >= 20) ? "Could not place the edges." : "Could not place the corners.");
      moves.push(...found);
      if (TRACE) console.log(JSON.stringify({ face: step.face, add: step.add.length, moves: moves.length, ms: Date.now() - started, S: 2 }));
      continue;
    }
    const groups = chunk(step.add.slice());
    const base = Int16Array.from(codes);
    const baseMoves = moves.length;
    let solved = false;
    const attempts = twoGen ? 32 : 1;
    for (let attempt = 0; attempt < attempts && !solved; attempt += 1) {
      codes.set(base);
      moves.length = baseMoves;
      const done: number[] = [];
      const doneTables: PlaceTable[] = [];
      let ok = true;
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        const group = groups[groupIndex]!;
        const table = buildTable(group, step.S);
        const guides: Guide[] = doneTables.concat(table);
        const last = groupIndex === groups.length - 1;
        if (last && twoGen && next) guides.push(buildEO(step.S, next.S));
        const found = ida(codes, done.concat(group), guides, step.S, last && twoGen ? 36 : 22, {
          skip: twoGen && groupIndex === groups.length - 2 ? attempt : 0,
          nodes: last && twoGen && groups.length > 1 && attempt < 24 ? 300_000 << (attempt >> 3) : 2_000_000,
        });
        if (!found) {
          ok = false;
          break;
        }
        moves.push(...found);
        done.push(...group);
        doneTables.push(table);
      }
      solved = ok;
    }
    if (!solved) {
      if (TRACE) console.log(JSON.stringify({ fail: step.face, S: popcount(step.S), add: step.add.length }));
      throw new Error(step.add.some((piece) => piece >= 20) ? "Could not place the edges." : "Could not place the corners.");
    }
    if (TRACE) console.log(JSON.stringify({ face: step.face, add: step.add.length, moves: moves.length, ms: Date.now() - started, S: popcount(step.S) }));
  }
  progress?.("Placing corners");
  const layer = layerOf(top);
  if (!layer.nonLayer.every((piece) => codes[piece] === solvedCode(piece))) {
    throw new Error("Could not place the edges.");
  }
  const tail = solveLastLayer(codes, layer);
  moves.push(...tail);
  if (TRACE) console.log(JSON.stringify({ lastLayer: tail.length, total: moves.length }));
  for (let piece = 0; piece < 50; piece += 1) {
    if (codes[piece] !== solvedCode(piece)) throw new Error(piece < 20 ? "Could not place the corners." : "Could not place the edges.");
  }
  return compress(moves);
}

interface Layer {
  corners: number[];
  edges: number[];
  cornerAt: Int16Array;
  edgeAt: Int16Array;
  nonLayer: number[];
}

function layerOf(top: number): Layer {
  const adjacent = MEGA_ADJ[top]!;
  const corners: number[] = [];
  const edges: number[] = [];
  for (let k = 0; k < 5; k += 1) {
    const left = adjacent[k]!;
    const right = adjacent[(k + 1) % 5]!;
    const corner = MEGA_CORNERS.findIndex((piece) => piece.faces.includes(top) && piece.faces.includes(left) && piece.faces.includes(right));
    const edge = MEGA_EDGES.findIndex((piece) => piece.faces.includes(top) && piece.faces.includes(left));
    if (corner < 0 || edge < 0) throw new Error("Megaminx last layer is missing a piece.");
    corners.push(corner);
    edges.push(edge);
  }
  const cornerAt = new Int16Array(20).fill(-1);
  const edgeAt = new Int16Array(30).fill(-1);
  corners.forEach((piece, index) => {
    cornerAt[piece] = index;
  });
  edges.forEach((piece, index) => {
    edgeAt[piece] = index;
  });
  const nonLayer: number[] = [];
  for (let piece = 0; piece < 50; piece += 1) {
    const onLayer = piece < 20 ? cornerAt[piece]! >= 0 : edgeAt[piece - 20]! >= 0;
    if (!onLayer) nonLayer.push(piece);
  }
  return { corners, edges, cornerAt, edgeAt, nonLayer };
}

function freshCodes(): Int16Array {
  const codes = new Int16Array(50);
  for (let piece = 0; piece < 20; piece += 1) codes[piece] = piece * 3;
  for (let edge = 0; edge < 30; edge += 1) codes[20 + edge] = edge * 2;
  return codes;
}

function applyCodes(codes: Int16Array, moves: number[]) {
  for (const move of moves) {
    for (let piece = 0; piece < 50; piece += 1) codes[piece] = movedCode(piece, codes[piece]!, move);
  }
}

function parseAlg(text: string): number[] {
  return text.split(/\s+/).filter(Boolean).map((token) => {
    const parsed = parseMegaMove(token);
    return parsed.face * 4 + parsed.steps - 1;
  });
}

function factIndex(perm: number[]): number {
  let index = 0;
  const left = [0, 1, 2, 3, 4];
  for (let i = 0; i < 5; i += 1) {
    const at = left.indexOf(perm[i]!);
    index = index * (5 - i) + at;
    left.splice(at, 1);
  }
  return index;
}

function factFrom(index: number): number[] {
  const left = [0, 1, 2, 3, 4];
  const perm: number[] = [];
  const fact = [24, 6, 2, 1, 1];
  for (let i = 0; i < 5; i += 1) {
    const at = (index / fact[i]!) | 0;
    index %= fact[i]!;
    perm.push(left.splice(at, 1)[0]!);
  }
  return perm;
}

const EVEN: number[][] = [];
const FACT_TO_EVEN = new Int16Array(120).fill(-1);
(function evenPerms(acc: number[], used: number[]) {
  if (acc.length === 5) {
    const seen = [0, 0, 0, 0, 0];
    let parity = 0;
    for (let i = 0; i < 5; i += 1) {
      if (seen[i]) continue;
      let cursor = i;
      let length = 0;
      while (!seen[cursor]) {
        seen[cursor] = 1;
        cursor = acc[cursor]!;
        length += 1;
      }
      parity += length - 1;
    }
    if ((parity & 1) === 0) {
      FACT_TO_EVEN[factIndex(acc)] = EVEN.length;
      EVEN.push(acc.slice());
    }
    return;
  }
  for (let i = 0; i < 5; i += 1) {
    if (used[i]) continue;
    used[i] = 1;
    acc.push(i);
    evenPerms(acc, used);
    acc.pop();
    used[i] = 0;
  }
})([], []);

function packOri(values: number[], base: number): number {
  let packed = 0;
  for (let i = 0; i < 4; i += 1) packed = packed * base + values[i]!;
  return packed;
}

function unpackOri(packed: number, base: number, mod: number): number[] {
  const values = [0, 0, 0, 0, 0];
  let sum = 0;
  for (let i = 3; i >= 0; i -= 1) {
    values[i] = packed % base;
    packed = (packed / base) | 0;
    sum += values[i]!;
  }
  values[4] = (mod - (sum % mod)) % mod;
  return values;
}

interface Prepared {
  edgeMacros: Macro[];
  cornerMacros: Macro[];
  look1: Uint16Array;
  corners: Uint16Array;
}

let prepared: Prepared | null = null;

function macroOf(layer: Layer, moves: number[]): Macro | null {
  const codes = freshCodes();
  applyCodes(codes, moves);
  for (const piece of layer.nonLayer) if (codes[piece] !== solvedCode(piece)) return null;
  const toC = [0, 0, 0, 0, 0];
  const cd = [0, 0, 0, 0, 0];
  const toE = [0, 0, 0, 0, 0];
  const ed = [0, 0, 0, 0, 0];
  let edgesFixed = true;
  for (let slot = 0; slot < 5; slot += 1) {
    const code = codes[layer.corners[slot]!]!;
    const home = layer.cornerAt[(code / 3) | 0]!;
    toC[slot] = home;
    cd[slot] = code % 3;
    const edgeCode = codes[20 + layer.edges[slot]!]!;
    const edgeHome = layer.edgeAt[edgeCode >> 1]!;
    toE[slot] = edgeHome;
    ed[slot] = edgeCode & 1;
    if (edgeHome !== slot || ed[slot] !== 0) edgesFixed = false;
  }
  const identity = toC.every((dest, index) => dest === index) && cd.every((twist) => twist === 0) && edgesFixed;
  if (identity) return null;
  return { moves, inverse: [...moves].reverse().map((move) => INV[move]!), toC, cd, toE, ed, edgesFixed };
}

function effectKey(macro: Macro): string {
  return `${macro.toC.join("")}${macro.cd.join("")}${macro.toE.join("")}${macro.ed.join("")}`;
}

function prepareLayer(layer: Layer): Prepared {
  if (prepared) return prepared;
  const byKey = new Map<string, Macro>();
  const consider = (moves: number[]) => {
    const macro = macroOf(layer, compress(moves));
    if (!macro) return;
    const key = effectKey(macro);
    const known = byKey.get(key);
    if (!known || macro.moves.length < known.moves.length) byKey.set(key, macro);
  };
  const seeds = ["U", "U'", "U++", "U--", "L' U++ R U-- L U++ R' U--", "R U R' U R U-- R' U", "F R U R' U' F'", "F U R U' R' F'"];
  for (const seed of seeds) {
    const base = parseAlg(seed);
    for (const sequence of [base, [...base].reverse().map((move) => INV[move]!)]) {
      for (let turn = 0; turn < 5; turn += 1) {
        const setup = turn ? [turn - 1] : [];
        consider([...setup, ...sequence, ...[...setup].reverse().map((move) => INV[move]!)]);
      }
    }
  }
  for (const text of CORNER_ALGS) consider(parseAlg(text));
  const macros = [...byKey.values()];
  const solvedPerm = [0, 1, 2, 3, 4];
  const solvedOri = [0, 0, 0, 0, 0];
  for (const macro of macros) {
    const codes = freshCodes();
    applyCodes(codes, macro.moves);
    const read = readLayerState(codes, layer);
    const absC = applyPerm(solvedPerm, solvedOri, macro.toC, macro.cd, 3);
    const absE = applyPerm(solvedPerm, solvedOri, macro.toE, macro.ed, 2);
    if (absC.perm.join() !== read.cp.join() || absC.ori.join() !== read.co.join() || absE.perm.join() !== read.ep.join() || absE.ori.join() !== read.eo.join()) {
      throw new Error("A last-layer algorithm does not match the cube.");
    }
  }
  const edgeMacros = macros.filter((macro) => !macro.edgesFixed);
  const cornerMacros = macros.filter((macro) => macro.edgesFixed);
  const look1 = buildLook1(edgeMacros);
  const corners = buildCorners(cornerMacros);
  prepared = { edgeMacros, cornerMacros, look1, corners };
  if (TRACE) console.log(JSON.stringify({ edgeMacros: edgeMacros.length, cornerMacros: cornerMacros.length }));
  return prepared;
}

function applyPerm(perm: number[], ori: number[], to: number[], twist: number[], mod: number) {
  const nextPerm = [0, 0, 0, 0, 0];
  const nextOri = [0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i += 1) {
    nextPerm[to[i]!] = perm[i]!;
    nextOri[to[i]!] = (ori[i]! + twist[i]!) % mod;
  }
  return { perm: nextPerm, ori: nextOri };
}

function readLayerState(codes: Int16Array, layer: Layer) {
  const cp = [0, 0, 0, 0, 0];
  const co = [0, 0, 0, 0, 0];
  const ep = [0, 0, 0, 0, 0];
  const eo = [0, 0, 0, 0, 0];
  for (let slot = 0; slot < 5; slot += 1) {
    const code = codes[layer.corners[slot]!]!;
    const at = layer.cornerAt[(code / 3) | 0]!;
    cp[at] = slot;
    co[at] = code % 3;
    const edgeCode = codes[20 + layer.edges[slot]!]!;
    const edgeAt = layer.edgeAt[edgeCode >> 1]!;
    ep[edgeAt] = slot;
    eo[edgeAt] = edgeCode & 1;
  }
  return { cp, co, ep, eo };
}

function look1Index(ep: number[], eo: number[], co: number[]): number {
  const even = FACT_TO_EVEN[factIndex(ep)]!;
  if (even < 0) return -1;
  return (even * 16 + packOri(eo, 2)) * 81 + packOri(co, 3);
}

function cornerStateIndex(cp: number[], co: number[]): number {
  return factIndex(cp) * 81 + packOri(co, 3);
}

function buildLook1(macros: Macro[]): Uint16Array {
  const size = 60 * 16 * 81;
  const which = new Uint16Array(size).fill(UNSEEN);
  const dist = new Uint8Array(size).fill(255);
  const start = look1Index([0, 1, 2, 3, 4], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]);
  which[start] = SOLVED_MARK;
  dist[start] = 0;
  const buckets: number[][] = [[start]];
  for (let depth = 0; depth < buckets.length; depth += 1) {
    const layer = buckets[depth];
    if (!layer) continue;
    for (const index of layer) {
      if (dist[index] !== depth) continue;
      const co = unpackOri(index % 81, 3, 3);
      let rest = (index / 81) | 0;
      const eo = unpackOri(rest % 16, 2, 2);
      const ep = EVEN[(rest / 16) | 0]!;
      for (let m = 0; m < macros.length; m += 1) {
        const macro = macros[m]!;
        const corners = applyPerm([0, 1, 2, 3, 4], co, macro.toC, macro.cd, 3);
        const edges = applyPerm(ep, eo, macro.toE, macro.ed, 2);
        const next = look1Index(edges.perm, edges.ori, corners.ori);
        if (next < 0) continue;
        const weight = depth + macro.moves.length;
        if (weight > 254 || dist[next]! <= weight) continue;
        dist[next] = weight;
        which[next] = m;
        (buckets[weight] ??= []).push(next);
      }
    }
  }
  let covered = 0;
  for (let i = 0; i < size; i += 1) if (which[i] !== UNSEEN) covered += 1;
  if (covered !== size) throw new Error("The megaminx last-layer table is incomplete.");
  return which;
}

function buildCorners(macros: Macro[]): Uint16Array {
  const size = 120 * 81;
  const which = new Uint16Array(size).fill(UNSEEN);
  const dist = new Uint8Array(size).fill(255);
  const start = cornerStateIndex([0, 1, 2, 3, 4], [0, 0, 0, 0, 0]);
  which[start] = SOLVED_MARK;
  dist[start] = 0;
  const buckets: number[][] = [[start]];
  for (let depth = 0; depth < buckets.length; depth += 1) {
    const layer = buckets[depth];
    if (!layer) continue;
    for (const index of layer) {
      if (dist[index] !== depth) continue;
      const perm = factFrom((index / 81) | 0);
      const ori = unpackOri(index % 81, 3, 3);
      for (let m = 0; m < macros.length; m += 1) {
        const macro = macros[m]!;
        const nextState = applyPerm(perm, ori, macro.toC, macro.cd, 3);
        const next = cornerStateIndex(nextState.perm, nextState.ori);
        const weight = depth + macro.moves.length;
        if (weight > 254 || dist[next]! <= weight) continue;
        dist[next] = weight;
        which[next] = m;
        (buckets[weight] ??= []).push(next);
      }
    }
  }
  let twistFree = 0;
  for (let perm = 0; perm < 120; perm += 1) if (which[perm * 81] !== UNSEEN) twistFree += 1;
  if (twistFree < 60) throw new Error("The megaminx corner table is incomplete.");
  return which;
}

function solveLastLayer(codes: Int16Array, layer: Layer): number[] {
  const tables = prepareLayer(layer);
  const moves: number[] = [];
  const pull = (which: Uint16Array, indexOf: () => number, macros: Macro[]) => {
    for (let guard = 0; guard < 40; guard += 1) {
      const index = indexOf();
      if (index < 0) throw new Error("Could not place the corners.");
      const macro = which[index]!;
      if (macro === SOLVED_MARK) return;
      if (macro === UNSEEN) throw new Error("Could not place the corners.");
      const inverse = macros[macro]!.inverse;
      applyCodes(codes, inverse);
      moves.push(...inverse);
    }
    throw new Error("Could not place the corners.");
  };
  pull(tables.look1, () => {
    const state = readLayerState(codes, layer);
    return look1Index(state.ep, state.eo, state.co);
  }, tables.edgeMacros);
  pull(tables.corners, () => {
    const state = readLayerState(codes, layer);
    return cornerStateIndex(state.cp, state.co);
  }, tables.cornerMacros);
  return moves;
}

function compress(sequence: number[]): number[] {
  const stack: { face: number; steps: number }[] = [];
  for (const move of sequence) {
    const face = move >> 2;
    const steps = (move & 3) + 1;
    const last = stack[stack.length - 1];
    if (last && last.face === face) {
      last.steps = (last.steps + steps) % 5;
      if (last.steps === 0) stack.pop();
    } else stack.push({ face, steps });
  }
  return stack.filter((item) => item.steps).map((item) => item.face * 4 + item.steps - 1);
}

function formatMove(move: number): string {
  return formatMegaMove({ face: move >> 2, steps: ((move & 3) + 1) as 1 | 2 | 3 | 4 });
}

export function solveMegaminx(text: string, progress?: (message: string) => void): Solution {
  const verdict = validateMega(text);
  if (!verdict.ok) throw new Error(verdict.issues[0]?.message ?? "This colouring is not a solvable megaminx.");
  if (text === solvedMegaString()) return packSolution([]);
  progress?.("Searching");
  let indexes: number[];
  try {
    indexes = solveFromTop(text, 0, progress);
  } catch (error) {
    if (TRACE) console.log(JSON.stringify({ fallback: error instanceof Error ? error.message : String(error) }));
    indexes = solveByCycles(text).moves.map((move) => {
      const parsed = parseMegaMove(move);
      return parsed.face * 4 + parsed.steps - 1;
    });
  }
  const moves = indexes.map(formatMove);
  if (applyMegaString(text, moves) !== solvedMegaString()) {
    throw new Error("The megaminx solver stopped before the puzzle was solved.");
  }
  return packSolution(moves);
}

function packSolution(list: string[]): Solution {
  if (!list.length) return { moves: [], chunkOfMove: [], chunks: [] };
  const chunk: TeachingChunk = {
    id: "solve",
    stageId: "hold",
    stageNumber: 0,
    stageName: "Solve",
    title: "Solve",
    goal: "",
    why: "",
    caseName: "megaminx",
    hold: "",
    moves: list,
    focus: [],
    advice: "",
    tip: null,
    fingertricks: list.map(() => ""),
  };
  return { moves: list, chunkOfMove: list.map(() => 0), chunks: [chunk] };
}
