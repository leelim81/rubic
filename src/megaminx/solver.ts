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
  pieceViewToFacelets,
  readPieces,
  solvedMegaString,
} from "./model";
import { solveByCycles } from "./cycleSolve";
import { validateMega } from "./validate";

/**
 * Megaminx search. Corner blocks (a corner and the new edges it brings in)
 * are placed by a beam, ranked with pattern databases so earlier blocks stay
 * solved. Pieces the beam does not finish are inserted with the 3-cycle
 * solver. A 144° turn counts as one move, and consecutive turns of one face
 * are merged.
 */

const TRACE = typeof process !== "undefined" && process.env.MEGA_TRACE === "1";
const NODE_CAP = 4_000_000;
const PHASE_MS = 700;
const MAX_BOUND = 14;

interface Block {
  edges: number[];
  corners: number[];
}

interface Pdb {
  edges: number[];
  corners: number[];
  dist: Uint8Array;
  how: Uint8Array;
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

function movesTouching(dests: Uint8Array[], twists: Uint8Array[], slots: number): number[][] {
  return Array.from({ length: slots }, (_, slot) => {
    const list: number[] = [];
    for (let move = 0; move < 48; move += 1) {
      if (dests[move]![slot] !== slot || twists[move]![slot] !== 0) list.push(move);
    }
    return list;
  });
}

const edgeMoves = movesTouching(eDest, eTwist, 30);
const cornerMoves = movesTouching(cDest, cTwist, 20);
const edgeLocalMap = Array.from({ length: 48 }, (_, move) => {
  const map = new Uint8Array(60);
  for (let local = 0; local < 60; local += 1) {
    const slot = local >> 1;
    const dest = eDest[move]![slot]!;
    map[local] = (dest << 1) | ((local & 1) + eTwist[move]![slot]!) & 1;
  }
  return map;
});
const cornerLocalMap = Array.from({ length: 48 }, (_, move) => {
  const map = new Uint8Array(60);
  for (let local = 0; local < 60; local += 1) {
    const slot = (local / 3) | 0;
    const dest = cDest[move]![slot]!;
    map[local] = dest * 3 + ((local % 3) + cTwist[move]![slot]!) % 3;
  }
  return map;
});

const ep = new Uint8Array(30);
const eo = new Uint8Array(30);
const cp = new Uint8Array(20);
const co = new Uint8Array(20);
const ep2 = new Uint8Array(30);
const eo2 = new Uint8Array(30);
const cp2 = new Uint8Array(20);
const co2 = new Uint8Array(20);
const eAt = new Int16Array(30);
const eOr = new Uint8Array(30);
const cAt = new Int16Array(20);
const cOr = new Uint8Array(20);

const pdbCache = new Map<string, Pdb>();

function apply(move: number) {
  const es = eDest[move]!;
  const et = eTwist[move]!;
  for (let slot = 0; slot < 30; slot += 1) {
    const dest = es[slot]!;
    ep2[dest] = ep[slot]!;
    eo2[dest] = (eo[slot]! + et[slot]!) & 1;
  }
  ep.set(ep2);
  eo.set(eo2);
  for (let slot = 0; slot < 30; slot += 1) {
    const piece = ep[slot]!;
    eAt[piece] = slot;
    eOr[piece] = eo[slot]!;
  }
  const cs = cDest[move]!;
  const ct = cTwist[move]!;
  for (let slot = 0; slot < 20; slot += 1) {
    const dest = cs[slot]!;
    cp2[dest] = cp[slot]!;
    co2[dest] = (co[slot]! + ct[slot]!) % 3;
  }
  cp.set(cp2);
  co.set(co2);
  for (let slot = 0; slot < 20; slot += 1) {
    const piece = cp[slot]!;
    cAt[piece] = slot;
    cOr[piece] = co[slot]!;
  }
}

function reindex() {
  for (let slot = 0; slot < 30; slot += 1) {
    const piece = ep[slot]!;
    eAt[piece] = slot;
    eOr[piece] = eo[slot]!;
  }
  for (let slot = 0; slot < 20; slot += 1) {
    const piece = cp[slot]!;
    cAt[piece] = slot;
    cOr[piece] = co[slot]!;
  }
}

function snapshot(): Uint8Array {
  const all = new Uint8Array(100);
  all.set(ep, 0);
  all.set(eo, 30);
  all.set(cp, 60);
  all.set(co, 80);
  return all;
}

function restore(all: Uint8Array) {
  ep.set(all.subarray(0, 30));
  eo.set(all.subarray(30, 60));
  cp.set(all.subarray(60, 80));
  co.set(all.subarray(80, 100));
  reindex();
}

function loadView(text: string) {
  const view = readPieces(megaFromString(text));
  ep.set(view.edgePiece);
  eo.set(view.edgeOri);
  cp.set(view.cornerPiece);
  co.set(view.cornerOri);
  reindex();
}

function keyOf(pdb: Pdb): number {
  let key = 0;
  for (const id of pdb.edges) key = key * 60 + (eAt[id]! * 2 + eOr[id]!);
  for (const id of pdb.corners) key = key * 60 + (cAt[id]! * 3 + cOr[id]!);
  return key;
}

function buildPattern(edges: number[], corners: number[]): Pdb {
  const nE = edges.length;
  const nC = corners.length;
  const n = nE + nC;
  if (n < 1 || n > 4) throw new Error("Megaminx pattern tables cover one to four pieces.");
  const size = 60 ** n;
  const dist = new Uint8Array(size);
  dist.fill(255);
  const how = new Uint8Array(size);
  let start = 0;
  for (let i = 0; i < nE; i += 1) start = start * 60 + edges[i]! * 2;
  for (let i = 0; i < nC; i += 1) start = start * 60 + corners[i]! * 3;
  dist[start] = 0;
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 1;
  queue[0] = start;
  const locals = new Int32Array(n);
  const seenE = new Int32Array(30);
  const seenC = new Int32Array(20);
  let stamp = 1;
  const moveStamp = new Int32Array(48);
  const moveBuf = new Int32Array(48);
  let moveMark = 1;
  while (head < tail) {
    let packed = queue[head++]!;
    const base = dist[packed]!;
    for (let i = n - 1; i >= 0; i -= 1) {
      locals[i] = packed % 60;
      packed = (packed / 60) | 0;
    }
    moveMark += 1;
    let moveCount = 0;
    for (let i = 0; i < nE; i += 1) {
      for (const move of edgeMoves[locals[i]! >> 1]!) {
        if (moveStamp[move] === moveMark) continue;
        moveStamp[move] = moveMark;
        moveBuf[moveCount] = move;
        moveCount += 1;
      }
    }
    for (let i = 0; i < nC; i += 1) {
      for (const move of cornerMoves[(locals[nE + i]! / 3) | 0]!) {
        if (moveStamp[move] === moveMark) continue;
        moveStamp[move] = moveMark;
        moveBuf[moveCount] = move;
        moveCount += 1;
      }
    }
    for (let index = 0; index < moveCount; index += 1) {
      const move = moveBuf[index]!;
      const edgeMap = edgeLocalMap[move]!;
      const cornerMap = cornerLocalMap[move]!;
      stamp += 1;
      let collision = false;
      let next = 0;
      for (let i = 0; i < nE; i += 1) {
        const landed = edgeMap[locals[i]!]!;
        const slot = landed >> 1;
        if (seenE[slot] === stamp) {
          collision = true;
          break;
        }
        seenE[slot] = stamp;
        next = next * 60 + landed;
      }
      if (collision) continue;
      for (let i = 0; i < nC; i += 1) {
        const landed = cornerMap[locals[nE + i]!]!;
        const slot = (landed / 3) | 0;
        if (seenC[slot] === stamp) {
          collision = true;
          break;
        }
        seenC[slot] = stamp;
        next = next * 60 + landed;
      }
      if (collision || dist[next] !== 255) continue;
      dist[next] = base + 1;
      how[next] = INV[move]!;
      queue[tail++] = next;
    }
  }
  return { edges, corners, dist, how };
}

function getPattern(edges: number[], corners: number[]): Pdb {
  const id = `e:${edges.join(",")} c:${corners.join(",")}`;
  const cached = pdbCache.get(id);
  if (cached) return cached;
  const started = Date.now();
  const built = buildPattern(edges, corners);
  if (TRACE) console.log(JSON.stringify({ pdb: id, ms: Date.now() - started, reachable: reachable(built) }));
  pdbCache.set(id, built);
  return built;
}

function reachable(pdb: Pdb): number {
  let count = 0;
  for (let i = 0; i < pdb.dist.length; i += 1) if (pdb.dist[i] !== 255) count += 1;
  return count;
}

function heuristic(pdbs: readonly Pdb[]): number {
  let best = 0;
  for (const pdb of pdbs) {
    const distance = pdb.dist[keyOf(pdb)]!;
    if (distance === 255) return 255;
    if (distance > best) best = distance;
  }
  return best;
}

function scoreOf(pdbs: readonly Pdb[]): number {
  let sum = 0;
  for (const pdb of pdbs) {
    const distance = pdb.dist[keyOf(pdb)]!;
    if (distance === 255) return 9999;
    sum += distance;
  }
  return sum;
}

function followPdb(pdb: Pdb): number[] {
  const path: number[] = [];
  for (let guard = 0; guard < 24; guard += 1) {
    const key = keyOf(pdb);
    const distance = pdb.dist[key]!;
    if (distance === 0) return path;
    if (distance === 255) break;
    const move = pdb.how[key]!;
    apply(move);
    path.push(move);
  }
  throw new Error("Megaminx pattern table did not walk back to solved.");
}

let nodes = 0;
let deadline = 0;

/** -1 found (path and cube left in place), -2 give up (cube restored), else next bound. */
function ida(pdbs: Pdb[]): number[] | null {
  if (pdbs.length === 1) return followPdb(pdbs[0]!);
  let bound = heuristic(pdbs);
  if (bound === 0) return [];
  if (bound === 255) return null;
  const path: number[] = [];
  nodes = 0;
  deadline = Date.now() + PHASE_MS;
  while (bound <= MAX_BOUND) {
    const next = descend(0, bound, -1, path, pdbs);
    if (next === -1) return path.slice();
    if (next < 0 || next > MAX_BOUND) return null;
    bound = next;
  }
  return null;
}

function descend(depth: number, bound: number, lastFace: number, path: number[], pdbs: Pdb[]): number {
  nodes += 1;
  if (nodes > NODE_CAP || ((nodes & 4095) === 0 && Date.now() > deadline)) return -2;
  const remaining = heuristic(pdbs);
  if (remaining === 255) return -2;
  if (remaining === 0) return -1;
  const estimate = depth + remaining;
  if (estimate > bound) return estimate;
  let nextBound = 999;
  for (let face = 0; face < 12; face += 1) {
    if (face === lastFace) continue;
    if (lastFace >= 0 && MEGA_OPPOSITE[lastFace] === face && lastFace > face) continue;
    for (let step = 0; step < 4; step += 1) {
      const move = (face << 2) + step;
      apply(move);
      path.push(move);
      const result = descend(depth + 1, bound, face, path, pdbs);
      if (result === -1) return -1;
      path.pop();
      apply(INV[move]!);
      if (result < 0) return result;
      if (result < nextBound) nextBound = result;
    }
  }
  return nextBound;
}

function edgesOfCorner(corner: number): number[] {
  const faces = MEGA_CORNERS[corner]!.faces;
  const ids: number[] = [];
  for (let id = 0; id < MEGA_EDGES.length; id += 1) {
    const [a, b] = MEGA_EDGES[id]!.faces;
    if (faces.includes(a!) && faces.includes(b!)) ids.push(id);
  }
  if (ids.length !== 3) throw new Error("Megaminx corner is missing an edge.");
  return ids;
}

function cornersAround(face: number): number[] {
  const adjacent = MEGA_ADJ[face]!;
  const ids: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const a = adjacent[i]!;
    const b = adjacent[(i + 1) % 5]!;
    const id = MEGA_CORNERS.findIndex((corner) => corner.faces.includes(face) && corner.faces.includes(a) && corner.faces.includes(b));
    if (id < 0) throw new Error("Megaminx face is missing a corner.");
    ids.push(id);
  }
  return ids;
}

/** Each corner, with the edges it introduces, starting from one face and its opposite. */
function blocksFor(face: number): Block[] {
  const ordered = [...cornersAround(face), ...cornersAround(MEGA_OPPOSITE[face]!)];
  const listed = new Set(ordered);
  for (let id = 0; id < 20; id += 1) if (!listed.has(id)) ordered.push(id);
  const seenEdges = new Set<number>();
  const blocks: Block[] = [];
  for (const corner of ordered) {
    const edges = edgesOfCorner(corner).filter((id) => !seenEdges.has(id));
    for (const id of edges) seenEdges.add(id);
    blocks.push({ edges, corners: [corner] });
  }
  if (seenEdges.size !== 30 || new Set(ordered).size !== 20) throw new Error("Megaminx blocks did not cover every piece.");
  return blocks;
}

function coverBlock(block: Block): Pdb[] {
  const count = block.edges.length + block.corners.length;
  if (!count) return [];
  if (count <= 3) return [getPattern(block.edges, block.corners)];
  return [getPattern(block.edges, []), getPattern([], block.corners)];
}

function patternKey(pdbs: readonly Pdb[]): string {
  let key = "";
  for (const pdb of pdbs) key += `${keyOf(pdb)},`;
  return key;
}

function rank(active: readonly Pdb[], preserved: readonly Pdb[]): number {
  const placed = scoreOf(active);
  const kept = scoreOf(preserved);
  if (placed >= 9999 || kept >= 9999) return 9999;
  return placed * 5 + kept;
}

/**
 * Beam search. Active pieces are weighted above pieces that must stay solved,
 * so the search finishes the new block and then restores the earlier ones.
 */
function beam(active: Pdb[], preserved: Pdb[], width: number, maxDepth: number): number[] | null {
  const tracked = preserved.length ? [...preserved, ...active] : active;
  const start = snapshot();
  if (rank(active, preserved) === 0) return [];
  let layer: { snap: Uint8Array; score: number; moves: number[] }[] = [{ snap: start, score: rank(active, preserved), moves: [] }];
  const seen = new Set<string>();
  seen.add(patternKey(tracked));
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next: { snap: Uint8Array; score: number; moves: number[] }[] = [];
    for (const node of layer) {
      restore(node.snap);
      const lastFace = node.moves.length ? node.moves[node.moves.length - 1]! >> 2 : -1;
      for (let face = 0; face < 12; face += 1) {
        if (face === lastFace) continue;
        if (lastFace >= 0 && MEGA_OPPOSITE[lastFace] === face && lastFace > face) continue;
        for (let step = 0; step < 4; step += 1) {
          const move = (face << 2) + step;
          apply(move);
          const score = rank(active, preserved);
          if (score === 0) return [...node.moves, move];
          const key = patternKey(tracked);
          if (!seen.has(key)) {
            seen.add(key);
            next.push({ snap: snapshot(), score, moves: [...node.moves, move] });
          }
          apply(INV[move]!);
        }
      }
    }
    if (!next.length) break;
    next.sort((a, b) => a.score - b.score);
    layer = next.length > width ? next.slice(0, width) : next;
  }
  restore(start);
  return null;
}

function solveBlock(active: Pdb[], preserved: Pdb[], thorough = true): { moves: number[]; via: string } | null {
  if (heuristic([...preserved, ...active]) === 0) return { moves: [], via: "done" };
  if (active.length === 1 && !preserved.length) return { moves: followPdb(active[0]!), via: "table" };
  if (active.length === 1) {
    const start = snapshot();
    const guided = followPdb(active[0]!);
    if (scoreOf(preserved) === 0) return { moves: guided, via: "guide" };
    restore(start);
  }
  const narrow = beam(active, preserved, preserved.length ? 320 : 80, preserved.length ? 13 : 10);
  if (narrow) return { moves: narrow, via: "beam" };
  if (!thorough) return null;
  const repaired = insertAndRepair(active, preserved);
  if (repaired) return { moves: repaired, via: "repair" };
  const iterative = ida([...preserved, ...active]);
  if (iterative) return { moves: iterative, via: "ida" };
  return null;
}

function astar(active: Pdb[], preserved: Pdb[], cap: number, weight: number, budgetMs: number): number[] | null {
  const tracked = preserved.length ? [...preserved, ...active] : active;
  const heapF: number[] = [];
  const heapG: number[] = [];
  const heapMoves: number[][] = [];
  const swap = (i: number, j: number) => {
    const f = heapF[i]!;
    const g = heapG[i]!;
    const moves = heapMoves[i]!;
    heapF[i] = heapF[j]!;
    heapG[i] = heapG[j]!;
    heapMoves[i] = heapMoves[j]!;
    heapF[j] = f;
    heapG[j] = g;
    heapMoves[j] = moves;
  };
  const siftUp = (index: number) => {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapF[parent]! <= heapF[i]!) break;
      swap(i, parent);
      i = parent;
    }
  };
  const siftDown = (index: number) => {
    let i = index;
    for (;;) {
      let best = i;
      const left = i * 2 + 1;
      const right = left + 1;
      if (left < heapF.length && heapF[left]! < heapF[best]!) best = left;
      if (right < heapF.length && heapF[right]! < heapF[best]!) best = right;
      if (best === i) break;
      swap(i, best);
      i = best;
    }
  };
  const push = (f: number, g: number, moves: number[]) => {
    heapF.push(f);
    heapG.push(g);
    heapMoves.push(moves);
    siftUp(heapF.length - 1);
  };
  const origin = snapshot();
  const replay = (moves: number[]) => {
    restore(origin);
    for (const move of moves) apply(move);
  };
  const fastKey = () => {
    let h1 = 2166136261;
    let h2 = 16777619;
    for (const pdb of tracked) {
      const key = keyOf(pdb);
      h1 = Math.imul(h1 ^ key, 16777619);
      h2 = Math.imul(h2 ^ (key + 0x9e3779b9), 2246822519);
    }
    return `${h1 >>> 0}:${h2 >>> 0}`;
  };
  if (heuristic(tracked) === 0) return [];
  push(heuristic(tracked) * weight, 0, []);
  const closed = new Set<string>();
  const bestG = new Map<string, number>();
  const deadline = Date.now() + budgetMs;
  while (heapF.length && closed.size < cap) {
    if ((closed.size & 255) === 0 && Date.now() > deadline) break;
    const last = heapF.length - 1;
    const g = heapG[0]!;
    const moves = heapMoves[0]!;
    heapF[0] = heapF[last]!;
    heapG[0] = heapG[last]!;
    heapMoves[0] = heapMoves[last]!;
    heapF.pop();
    heapG.pop();
    heapMoves.pop();
    if (heapF.length) siftDown(0);
    replay(moves);
    const here = fastKey();
    if (closed.has(here)) continue;
    closed.add(here);
    if (heuristic(tracked) === 0) return moves;
    const lastFace = moves.length ? moves[moves.length - 1]! >> 2 : -1;
    for (let face = 0; face < 12; face += 1) {
      if (face === lastFace) continue;
      if (lastFace >= 0 && MEGA_OPPOSITE[lastFace] === face && lastFace > face) continue;
      for (let step = 0; step < 4; step += 1) {
        const move = (face << 2) + step;
        apply(move);
        const nextH = heuristic(tracked);
        if (nextH === 0) return [...moves, move];
        const key = fastKey();
        const nextG = g + 1;
        const known = bestG.get(key);
        if (nextH < 255 && !closed.has(key) && (known === undefined || nextG < known)) {
          bestG.set(key, nextG);
          push(nextG + nextH * weight, nextG, [...moves, move]);
        }
        apply(INV[move]!);
      }
    }
  }
  restore(origin);
  return null;
}

/** Place the active pattern, then put back any solved blocks that path disturbed. */
function insertAndRepair(active: Pdb[], preserved: Pdb[]): number[] | null {
  if (active.length !== 1 || !preserved.length) return null;
  const start = snapshot();
  let guided: number[];
  try {
    guided = followPdb(active[0]!);
  } catch {
    restore(start);
    return null;
  }
  if (scoreOf(preserved) === 0) return guided;
  const moves = [...guided];
  const held = preserved.filter((pdb) => pdb.dist[keyOf(pdb)] === 0);
  const pending = preserved.filter((pdb) => pdb.dist[keyOf(pdb)]! > 0);
  held.push(active[0]!);
  for (const pdb of pending) {
    const fix = beam([pdb], held, 220, 10) ?? astar([pdb], held, 15_000, 2, 350);
    if (!fix) {
      restore(start);
      return null;
    }
    moves.push(...fix);
    held.push(pdb);
  }
  return moves;
}

function solveBlocks(blocks: Block[], progress?: (message: string) => void): number[] {
  const preserved: Pdb[] = [];
  const moves: number[] = [];
  let cornersStarted = false;
  const blockDeadline = Date.now() + 8000;
  for (let index = 0; index < blocks.length; index += 1) {
    if (Date.now() > blockDeadline) break;
    const block = blocks[index]!;
    if (!cornersStarted && index >= 5) {
      cornersStarted = true;
      progress?.("Placing corners");
    }
    const started = Date.now();
    const active = coverBlock(block);
    const phase = active.length ? solveBlock(active, preserved, true) : { moves: [] as number[], via: "done" };
    if (!phase) continue;
    moves.push(...phase.moves);
    preserved.push(...active);
    if (TRACE) console.log(JSON.stringify({ index, edges: block.edges, corners: block.corners, via: phase.via, moves: phase.moves.length, ms: Date.now() - started, total: moves.length }));
  }
  if (!edgesSolved() || cornerScore() < 20) {
    progress?.("Placing corners");
    if (TRACE) console.log(JSON.stringify({ prefix: moves.length, unsolvedEdges: 30 - edgeScore(), unsolvedCorners: 20 - cornerScore() }));
    const extra = cyclesFromHere();
    for (const move of extra) apply(move);
    moves.push(...extra);
  }
  return compress(moves);
}

function cyclesFromHere(): number[] {
  const text = pieceViewToFacelets({
    edgePiece: Uint8Array.from(ep),
    edgeOri: Uint8Array.from(eo),
    cornerPiece: Uint8Array.from(cp),
    cornerOri: Uint8Array.from(co),
  });
  return solveByCycles(text).moves.map((move) => {
    const parsed = parseMegaMove(move);
    return parsed.face * 4 + parsed.steps - 1;
  });
}


function edgeScore(): number {
  let score = 0;
  for (let id = 0; id < 30; id += 1) if (eAt[id] === id && eOr[id] === 0) score += 1;
  return score;
}


function edgesSolved(): boolean {
  for (let id = 0; id < 30; id += 1) if (eAt[id] !== id || eOr[id] !== 0) return false;
  return true;
}


function cornerScore(): number {
  let score = 0;
  for (let id = 0; id < 20; id += 1) if (cAt[id] === id && cOr[id] === 0) score += 1;
  return score;
}


function compress(seq: number[]): number[] {
  const stack: { face: number; steps: number }[] = [];
  for (const move of seq) {
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

function solvedNow(): boolean {
  for (let id = 0; id < 30; id += 1) if (eAt[id] !== id || eOr[id] !== 0) return false;
  for (let id = 0; id < 20; id += 1) if (cAt[id] !== id || cOr[id] !== 0) return false;
  return true;
}

function candidate(blocks: Block[], progress?: (message: string) => void): number[] {
  progress?.("Placing edges");
  const moves = solveBlocks(blocks, progress);
  if (!solvedNow()) throw new Error("The megaminx solver stopped before the puzzle was solved.");
  return moves;
}

export function solveMegaminx(text: string, progress?: (message: string) => void): Solution {
  const verdict = validateMega(text);
  if (!verdict.ok) throw new Error(verdict.issues[0]?.message ?? "This colouring is not a solvable megaminx.");
  if (text === solvedMegaString()) return packSolution([]);
  progress?.("Searching");
  loadView(text);
  const moves = candidate(blocksFor(0), progress);
  const formatted = moves.map(formatMove);
  if (applyMegaString(text, formatted) !== solvedMegaString()) {
    throw new Error("The megaminx solver stopped before the puzzle was solved.");
  }
  return packSolution(formatted);
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
