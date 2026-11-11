import type { Solution, TeachingChunk } from "../solver/beginner";
import { MASTER_MESH, MASTER_EFFECTS, MASTER_MOVES, SOLVED_MASTER, applyMaster, applyMasterMoves, centerKey, invertMaster, masterAsPyraminx, nonCenterMatches, readMaster, tipFixMoves, validateMaster, wideMove } from "./master";
import { PYRA_FACES, PYRA_MOVES, SOLVED_PYRA, applyCore, coreKey, readCoreOf, validatePyraminx } from "./model";
import { listOptimalFaceMoves, pyraminxKeyDistance } from "./solve";

/**
 * Reduction, in the same spirit as the 5×5: pair the wings with the midges,
 * solve that Pyraminx with wide turns, then restore the face centres.
 * Two pairing orders are tried, and each reduction keeps the shortest of the
 * optimal Pyraminx solutions (plus a short search past that) and of several
 * pure centre algorithms. Tips are turned into place at the end.
 */
export function solveMaster(facelets: string): Solution {
  const verdict = validateMaster(facelets);
  if (!verdict.ok) throw new Error(verdict.message || "This colouring is not a solvable Master Pyraminx.");
  const easy = finishPairing(facelets, "short");
  const hard = finishPairing(facelets, "long");
  return pack(hard.length < easy.length ? hard : easy);
}

function finishPairing(facelets: string, prefer: "short" | "long"): string[] {
  const pairing = pairWings(facelets, prefer);
  const pairedState = applyMasterMoves(facelets, pairing);
  const where = layout(pairedState);
  if ([0, 1, 2, 3, 4, 5].some((edge) => !paired(where, edge))) throw new Error("Wings were not paired.");
  const moves = simplify([...pairing, ...bestReduction(pairedState)]);
  if (applyMasterMoves(facelets, moves) !== SOLVED_MASTER) {
    throw new Error("The solver did not finish on a solved Master Pyraminx.");
  }
  return moves;
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

function pairWings(state: string, prefer: "short" | "long"): string[] {
  const moves: string[] = [];
  let current = state;
  for (let guard = 0; guard < 12; guard += 1) {
    const where = layout(current);
    const open = [0, 1, 2, 3, 4, 5].filter((index) => !paired(where, index));
    if (!open.length) return moves;
    const mask = pairedMask(where);
    let found: string[] | null = null;
    for (const edge of open) {
      const candidate = searchPair(where.midge[edge]!, where.wings[edge]![0]!, where.wings[edge]![1]!, mask);
      if (!candidate) continue;
      const better = found === null || (prefer === "short" ? candidate.length < found.length : candidate.length > found.length);
      if (better) found = candidate;
    }
    if (!found) {
      for (let i = 0; i < open.length && !found; i += 1) {
        for (let j = i + 1; j < open.length && !found; j += 1) {
          found = searchTwo(where, open[i]!, open[j]!, mask);
        }
      }
    }
    if (!found) {
      const edge = open[0]!;
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

let centreTable: Map<string, string[][]> | null = null;

function centreOptions(key: string): string[][] {
  const table = centreTable ?? (centreTable = buildCentreTable());
  const options = table.get(key);
  if (!options?.length) throw new Error("The face centres are not a solvable Master Pyraminx pattern.");
  return options.map((moves) => moves.slice().reverse().map(invertMaster));
}

function buildCentreTable(): Map<string, string[][]> {
  const best = new Map<string, string[][]>([[centerKey(SOLVED_MASTER), [[]]]]);
  const remember = (moves: string[]) => {
    const next = applyMasterMoves(SOLVED_MASTER, moves);
    if (!nonCenterMatches(next, SOLVED_MASTER)) return;
    const key = centerKey(next);
    const list = best.get(key) ?? [];
    if (list.some((existing) => existing.length === moves.length && existing.join(" ") === moves.join(" "))) return;
    list.push(moves);
    list.sort((left, right) => left.length - right.length);
    best.set(key, list.slice(0, 8));
  };
  for (const generator of pureCentreGenerators()) remember(simplify(generator));
  closeCentreProducts(best);
  if (best.size !== 12) throw new Error(`The centre table covers ${best.size} patterns.`);
  for (const [key, options] of best) {
    const moves = options[0];
    if (!moves) throw new Error(`Centre algorithm for ${key} is missing.`);
    const next = applyMasterMoves(SOLVED_MASTER, moves);
    if (centerKey(next) !== key || !nonCenterMatches(next, SOLVED_MASTER)) {
      throw new Error(`Centre algorithm for ${key} is not pure.`);
    }
  }
  return best;
}

function centreIndex(face: string): number {
  const sticker = MASTER_MESH.find((item) => item.piece === `center-${face}`);
  if (!sticker) throw new Error(`Missing centre ${face}`);
  return sticker.index;
}

function closeCentreProducts(best: Map<string, string[][]>): void {
  const remember = (moves: string[]) => {
    const next = applyMasterMoves(SOLVED_MASTER, moves);
    if (!nonCenterMatches(next, SOLVED_MASTER)) return false;
    const key = centerKey(next);
    const list = best.get(key) ?? [];
    const shortest = list[0]?.length ?? Infinity;
    if (moves.length > shortest) return false;
    if (list.some((existing) => existing.join(" ") === moves.join(" "))) return false;
    list.push(moves);
    list.sort((left, right) => left.length - right.length);
    best.set(key, list.filter((existing) => existing.length <= (list[0]?.length ?? 0)).slice(0, 8));
    return moves.length < shortest;
  };
  for (let guard = 0; guard < 4; guard += 1) {
    let changed = false;
    const snapshot = [...best.values()].map((options) => options[0] ?? []);
    for (const pathA of snapshot) {
      for (const pathB of snapshot) {
        if (remember(simplify([...pathA, ...pathB]))) changed = true;
      }
    }
    if (!changed) break;
  }
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
      for (const turn of [false, true]) {
        for (const otherTurn of [false, true]) {
          for (const inner of [false, true]) {
            const slice = [
              `${vertex}w${turn ? "'" : ""}`,
              `${other}w${otherTurn ? "'" : ""}`,
              `${other}${inner ? "'" : ""}`,
              `${vertex}w${turn ? "" : "'"}`,
              `${other}w${otherTurn ? "'" : ""}`,
              `${other}${inner ? "'" : ""}`,
            ];
            consider(slice);
            consider([...slice, ...slice]);
            const swapped = [
              `${vertex}w${turn ? "'" : ""}`,
              `${other}${inner ? "'" : ""}`,
              `${other}w${otherTurn ? "'" : ""}`,
              `${vertex}w${turn ? "" : "'"}`,
              `${other}${inner ? "'" : ""}`,
              `${other}w${otherTurn ? "'" : ""}`,
            ];
            consider(swapped);
            consider([...swapped, ...swapped]);
          }
        }
      }
    }
  }
  return [...found.values()];
}

function moveLayer(move: string): "tip" | "wide" | "normal" {
  if (move.includes("w")) return "wide";
  if (move[0] === move[0]?.toLowerCase()) return "tip";
  return "normal";
}

function simplify(moves: readonly string[]): string[] {
  const out = [...moves];
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < out.length - 1; index += 1) {
      const left = out[index]!;
      const right = out[index + 1]!;
      if (left[0]?.toUpperCase() !== right[0]?.toUpperCase() || moveLayer(left) !== moveLayer(right)) continue;
      const twist = (left.endsWith("'") ? 2 : 1) + (right.endsWith("'") ? 2 : 1);
      const sum = twist % 3;
      const letter = moveLayer(left) === "tip" ? left[0]!.toLowerCase() : left[0]!.toUpperCase();
      const wide = moveLayer(left) === "wide" ? "w" : "";
      const merged = sum === 0 ? null : `${letter}${wide}${sum === 2 ? "'" : ""}`;
      out.splice(index, 2, ...(merged ? [merged] : []));
      changed = true;
      break;
    }
  }
  return out;
}

const CENTRE_SOURCE: Record<string, number[]> = {};
const TIP_DELTA: Record<string, number[]> = {};
let wideModelReady = false;

function ensureWideModel(): void {
  if (wideModelReady) return;
  const marks = ["0", "1", "2", "3"];
  for (const move of PYRA_MOVES) {
    const chars = SOLVED_MASTER.split("");
    PYRA_FACES.forEach((face, index) => {
      chars[centreIndex(face)] = marks[index]!;
    });
    const moved = applyMaster(chars.join(""), wideMove(move));
    CENTRE_SOURCE[move] = PYRA_FACES.map((face) => Number(moved[centreIndex(face)]));
    const tips = [0, 0, 0, 0];
    tipFixMoves(applyMaster(SOLVED_MASTER, wideMove(move))).forEach((fix) => {
      const vertex = "ULRB".indexOf(fix[0]!.toUpperCase());
      tips[vertex] = fix.endsWith("'") ? 2 : 1;
    });
    TIP_DELTA[move] = tips;
  }
  wideModelReady = true;
}

function tipNumber(state: string): number {
  const ori = [0, 0, 0, 0];
  tipFixMoves(state).forEach((fix) => {
    const vertex = "ULRB".indexOf(fix[0]!.toUpperCase());
    ori[vertex] = fix.endsWith("'") ? 2 : 1;
  });
  return ori[0]! + ori[1]! * 3 + ori[2]! * 9 + ori[3]! * 27;
}

function addTips(tip: number, delta: number[]): number {
  let next = 0;
  let place = 1;
  let rest = tip;
  for (let index = 0; index < 4; index += 1) {
    next += ((rest % 3 + delta[index]!) % 3) * place;
    rest = Math.floor(rest / 3);
    place *= 3;
  }
  return next;
}

function pushCentre(key: string, sources: number[]): string {
  return sources.map((source) => key[source]!).join("");
}

function bestReduction(state: string): string[] {
  const verdict = validatePyraminx(masterAsPyraminx(state));
  if (!verdict.ok || !verdict.canonical) throw new Error("The paired Master Pyraminx is not a Pyraminx.");
  const startCore = readCoreOf(verdict.canonical);
  if (!startCore) throw new Error("The paired Master Pyraminx is not a Pyraminx.");
  ensureWideModel();
  const scoreOf = (wide: string[]) => {
    const after = applyMasterMoves(state, wide);
    if (!pyraminxCoreSolved(masterAsPyraminx(after))) return null;
    let moves: string[] | null = null;
    let raw = Infinity;
    for (const option of centreOptions(centerKey(after))) {
      const tipMoves = tipFixMoves(applyMasterMoves(after, option));
      const candidate = simplify([...wide, ...option, ...tipMoves]);
      if (moves === null || candidate.length < moves.length) {
        moves = candidate;
        raw = wide.length + option.length + tipMoves.length;
      }
    }
    return moves === null ? null : { moves, raw };
  };
  let best: { moves: string[]; raw: number } | null = null;
  const better = (scored: { moves: string[]; raw: number }) => best === null || scored.moves.length < best.moves.length;
  for (const face of listOptimalFaceMoves(masterAsPyraminx(state), 64)) {
    const scored = scoreOf(face.map(wideMove));
    if (scored && better(scored)) best = scored;
  }
  if (!best) throw new Error("The Pyraminx reduction did not finish.");
  const startDist = pyraminxKeyDistance(coreKey(startCore));
  const slack = 2;
  const cap = 12_000;
  const queue: { core: typeof startCore; centre: string; tips: number; wide: string[] }[] = [{
    core: startCore,
    centre: centerKey(state),
    tips: tipNumber(state),
    wide: [],
  }];
  const seen = new Set<string>();
  let head = 0;
  let expanded = 0;
  while (head < queue.length && expanded < cap) {
    const item = queue[head]!;
    head += 1;
    const key = coreKey(item.core);
    const seenKey = `${key}|${item.centre}|${item.tips}`;
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);
    const dist = pyraminxKeyDistance(key);
    if (dist === 255 || item.wide.length > startDist + slack) continue;
    if (dist === 0) {
      const scored = scoreOf(item.wide);
      if (scored && better(scored)) best = scored;
      continue;
    }
    if (item.wide.length + dist > startDist + slack || item.wide.length + dist >= best.raw) continue;
    expanded += 1;
    const previous = item.wide[item.wide.length - 1]?.[0] ?? "";
    for (const move of PYRA_MOVES) {
      if (move[0] === previous) continue;
      if (queue.length > cap * 8) break;
      queue.push({
        core: applyCore(item.core, move),
        centre: pushCentre(item.centre, CENTRE_SOURCE[move]!),
        tips: addTips(item.tips, TIP_DELTA[move]!),
        wide: [...item.wide, wideMove(move)],
      });
    }
  }
  return best.moves;
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
