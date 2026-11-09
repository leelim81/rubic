import {
  type ColorName,
  type Face,
  EDGE_PLACES,
  CORNER_PLACES,
  applyMoves,
  copyBytes,
  centerColor,
  faceletsToString,
  findCorner,
  findEdge,
  matchesCenters,
  readCorners,
  readEdges,
  rotationToHome,
  searchMoves,
  stringToFacelets,
  type PieceSpot,
} from "../cube/model";
import { validateBytes } from "../cube/validate";
import { labelStages, stripWaste } from "./optimize";
import { fingerTricks } from "../teaching/fingers";

export type StageId = "hold" | "cross" | "corners" | "middle" | "yellowCross" | "yellowEdges" | "yellowCorners" | "orientCorners";

export interface TeachingChunk {
  id: string;
  stageId: StageId;
  stageNumber: number;
  stageName: string;
  title: string;
  goal: string;
  why: string;
  caseName: string;
  hold: string;
  moves: string[];
  focus: number[];
  advice: string;
  tip: string | null;
  fingertricks: string[];
}

export interface Solution {
  chunks: TeachingChunk[];
  moves: string[];
  /** Chunk index for each flattened move. */
  chunkOfMove: number[];
}

const STAGE_META: Record<Exclude<StageId, "hold">, { number: number; name: string }> = {
  cross: { number: 1, name: "White cross" },
  corners: { number: 2, name: "White corners" },
  middle: { number: 3, name: "Middle layer" },
  yellowCross: { number: 4, name: "Yellow cross" },
  yellowEdges: { number: 5, name: "Yellow edges" },
  yellowCorners: { number: 6, name: "Yellow corners" },
  orientCorners: { number: 7, name: "Orient corners" },
};

const RIGHT_LAYER = ["U", "R", "U'", "R'", "U'", "F'", "U", "F"];
const LEFT_LAYER = ["U'", "L'", "U", "L", "U", "F", "U'", "F'"];
const CROSS_ALG = ["F", "R", "U", "R'", "U'", "F'"];
const CROSS_ALG_INVERSE = ["F", "U", "R", "U'", "R'", "F'"];
const SUNE = ["R", "U", "R'", "U", "R", "U2", "R'"];
const ANTISUNE = ["R", "U2", "R'", "U'", "R", "U'", "R'"];
const TPERM = ["R", "U", "R'", "U'", "R'", "F", "R2", "U'", "R'", "U'", "R", "U", "R'", "F'"];
const CORNER_CYCLE = ["U", "R", "U'", "L'", "U", "R'", "U'", "L"];
const BOTTOM_TRIGGER = ["R'", "D'", "R", "D"];
const SEXY = ["R", "U", "R'", "U'"];

const FACE_OF_NORMAL: Record<string, Face> = {
  "0,1,0": "U",
  "0,-1,0": "D",
  "1,0,0": "R",
  "-1,0,0": "L",
  "0,0,1": "F",
  "0,0,-1": "B",
};

export function solveBeginner(facelets: string): Solution {
  const initial = stringToFacelets(facelets);
  const verdict = validateBytes(initial, { searchRotations: false });
  if (!verdict.ok) throw new Error(verdict.issues[0]?.message ?? "This colouring is not a solvable 3×3.");
  if (matchesCenters(initial)) return pack([]);
  const short = searchMoves(initial, matchesCenters, { maxDepth: 2 });
  const done = (id: StageId, cube: Uint8Array) => stageGoalMet(cube, id);
  if (short) return labelStages(initial, stripWaste(short, initial), done);
  const raw = solveBeginnerRaw(facelets);
  return labelStages(initial, stripWaste(raw.moves, initial), done);
}

/** The layer-by-layer plan before cancellation and cycle removal. */
export function solveBeginnerRaw(facelets: string): Solution {
  const initial = stringToFacelets(facelets);
  const verdict = validateBytes(initial, { searchRotations: false });
  if (!verdict.ok) {
    throw new Error(verdict.issues[0]?.message ?? "This colouring is not a solvable 3×3.");
  }
  if (matchesCenters(initial)) return pack([]);

  let state = copyBytes(initial);
  const chunks: TeachingChunk[] = [];
  const setup = rotationToHome(state);
  if (setup.length) {
    pushChunks(state, chunks, {
      stageId: "hold",
      title: "Match the lesson hold",
      goal: "Put yellow on top and green in front before any layer turns.",
      why: "Every later move assumes this hold. These turns roll the whole cube; they do not twist a single layer.",
      caseName: "Set the hold",
      advice: "Copy the picture: yellow centre on top, white centre on the bottom, green centre facing you. In this hold the right face is orange and the left face is red. The letter R means right, not red.",
      tip: "A cube rotation (x, y, or z) moves every layer together. It changes which colour is on top, and the next letters follow the new hold.",
      moves: setup,
      focus: [],
    });
    state = applyMoves(state, setup);
  }

  solveCross(state, chunks);
  state = replay(initial, chunks);
  assertStage(state, "The white cross should be finished before the corners.", bottomCrossSolved);

  solveCorners(state, chunks);
  state = replay(initial, chunks);
  assertStage(state, "The white corners should finish the first layer.", firstLayerSolved);

  solveMiddle(state, chunks);
  state = replay(initial, chunks);
  assertStage(state, "The second layer should leave the first two layers solved.", f2lSolved);

  solveYellowCross(state, chunks);
  state = replay(initial, chunks);
  assertStage(state, "The yellow cross should be formed without losing the first two layers.", (cube) => f2lSolved(cube) && yellowCrossSolved(cube));

  solveYellowEdges(state, chunks);
  state = replay(initial, chunks);
  assertStage(state, "The cross colours should match the side centres.", (cube) => f2lSolved(cube) && yellowEdgesSolved(cube));

  solveYellowCornerPlaces(state, chunks);
  state = replay(initial, chunks);
  assertStage(state, "The yellow corners should sit in the right slots.", (cube) => f2lSolved(cube) && yellowEdgesSolved(cube) && yellowCornersPlaced(cube));

  solveCornerOrientation(state, chunks);
  state = replay(initial, chunks);
  if (!matchesCenters(state)) {
    throw new Error("The beginner solution did not finish on a solved cube.");
  }
  return pack(chunks);
}

function replay(initial: Uint8Array, chunks: TeachingChunk[]): Uint8Array {
  return applyMoves(initial, chunks.flatMap((chunk) => chunk.moves));
}

function assertStage(state: Uint8Array, message: string, ok: (state: Uint8Array) => boolean) {
  if (!ok(state)) throw new Error(message);
}

function solveCross(state: Uint8Array, chunks: TeachingChunk[]) {
  if (bottomCrossSolved(state)) return;
  let guard = 0;
  while (guard++ < 8) {
    const pending = readEdges(state).filter((edge) => edge.colors.includes("white") && !isPetal(edge) && !crossEdgeSolved(state, edge));
    if (!pending.length) break;
    const target = pending[0]!;
    const other = target.colors.find((color) => color !== "white")!;
    const before = target;
    const path = searchMoves(state, (candidate) => {
      const spot = findEdge(candidate, "white", other);
      if (!spot || whiteSide(spot) !== "U") return false;
      return petalsPreserved(state, candidate) && solvedCrossPreserved(state, candidate);
    }, { maxDepth: 5 });
    if (!path) throw new Error(`Could not park the white-${other} edge on the yellow face.`);
    pushChunks(state, chunks, {
      stageId: "cross",
      title: `Park the white–${other} edge`,
      goal: "Get this white sticker onto the yellow face, like a petal, without losing petals you already parked.",
      why: "The cross is built on the bottom. Petals on top let you line up the side colour and drop the edge with a half turn, and a top-layer turn will not disturb edges already in the cross.",
      caseName: petalCaseName(before),
      advice: petalAdvice(before, other),
      tip: guard === 1 ? "An edge has two stickers. Follow both colours, not only the white one, or the cross will not match the side centres." : null,
      moves: path,
      focus: before.faceletIndexes,
    });
    state = applyMoves(state, path);
  }

  const order: Face[] = ["F", "R", "B", "L"];
  for (const face of order) {
    if (slotSolved(state, face === "F" ? "DF" : face === "R" ? "DR" : face === "B" ? "DB" : "DL")) continue;
    const side = centerColor(state, face);
    const upper = face === "F" ? "UF" : face === "R" ? "UR" : face === "B" ? "UB" : "UL";
    const moves: string[] = [];
    let sim = copyBytes(state);
    for (let turn = 0; turn < 4; turn++) {
      const spot = findEdge(sim, "white", side);
      if (spot?.place === upper && whiteSide(spot) === "U") break;
      moves.push("U");
      sim = applyMoves(sim, ["U"]);
    }
    const parked = findEdge(sim, "white", side);
    if (parked?.place !== upper || whiteSide(parked) !== "U") {
      throw new Error(`The white–${side} edge was not a petal above ${face}.`);
    }
    moves.push(`${face}2`);
    const focus = findEdge(state, "white", side)?.faceletIndexes ?? [];
    pushChunks(state, chunks, {
      stageId: "cross",
      title: `Drop white–${side} into the cross`,
      goal: `Seat this edge between the white centre and the ${side} centre.`,
      why: "Once the side colour faces its centre, a half turn of that face swaps the petal down onto the white face. Edges already on the bottom stay put.",
      caseName: "Petal above its centre",
      advice: `White–${side} is on the yellow face. Turn the top until ${side} lines up with the ${side} centre, then turn that side face halfway.`,
      tip: null,
      moves,
      focus,
    });
    state = applyMoves(state, moves);
  }
}

function solveCorners(state: Uint8Array, chunks: TeachingChunk[]) {
  let guard = 0;
  while (!firstLayerSolved(state) && guard++ < 6) {
    const target = unsolvedWhiteCorner(state);
    if (!target) break;
    const moves = cornerInsertion(state, target.colors);
    if (!moves) {
      const spot = findCorner(state, target.colors);
      throw new Error(`Could not insert ${target.colors.join("-")} at ${spot?.place} ori=${spot?.ori} state=${faceletsToString(state)}`);
    }
    const names = target.colors.filter((color) => color !== "white").join("–");
    const groups = splitCornerMoves(moves);
    groups.forEach((group, index) => {
      const sexyCount = countSexy(group);
      pushChunks(state, chunks, {
        stageId: "corners",
        title: index === 0 ? `Insert the white–${names} corner` : `Right-hand trigger again`,
        goal: "Solve this white corner in its slot, with white on the bottom and the side colours beside their centres.",
        why: "The right-hand trigger (R U R' U') cycles the front-right corner. Repeated the right number of times, it drops the corner in and restores the cross.",
        caseName: sexyCount > 0 ? `Right-hand trigger × ${sexyCount}` : "Line up the corner",
        advice: cornerAdvice(state, target.colors, group, index, groups.length),
        tip: chunks.every((chunk) => chunk.stageId !== "corners") && index === 0
          ? "Reusable idea: R U R' U' is the right-hand trigger. You will see it again in the second layer. Finish every trigger even if a sticker looks done halfway through."
          : null,
        moves: group,
        focus: findCorner(state, target.colors)?.faceletIndexes ?? [],
      });
      state = applyMoves(state, group);
    });
  }
}

function solveMiddle(state: Uint8Array, chunks: TeachingChunk[]) {
  let guard = 0;
  while (!middleSolved(state) && guard++ < 16) {
    const place = (["FR", "FL", "BR", "BL"] as const).find((slot) => !slotSolved(state, slot));
    if (!place) break;
    const spec = EDGE_PLACES.find((edge) => edge.place === place)!;
    const colors = spec.normals.map((normal) => centerColor(state, FACE_OF_NORMAL[`${normal.x},${normal.y},${normal.z}`]!));
    const spot = findEdge(state, colors[0]!, colors[1]!);
    if (!spot) throw new Error(`The ${colors.join("–")} edge is missing.`);
    if (isMiddlePlace(spot.place) && spot.place !== place) {
      const moves = ejectMiddle(state, colors);
      if (!moves) throw new Error(`Could not bring the ${colors.join("–")} edge out of the middle layer.`);
      pushChunks(state, chunks, {
        stageId: "middle",
        title: `Free the ${colors.join("–")} edge`,
        goal: "Bring this second-layer edge up to the yellow face. It is sitting in the wrong middle slot.",
        why: "The second-layer trigger replaces one middle edge with the edge above it. Doing it on the trapped edge pops that edge out and leaves the first layer in place.",
        caseName: "Edge stuck in the middle",
        advice: `The ${colors.join("–")} edge belongs between those two centres, but it is stuck at ${placeName(spot.place)}. One second-layer trigger lifts it to the top.`,
        tip: null,
        moves,
        focus: spot.faceletIndexes,
      });
      state = applyMoves(state, moves);
      continue;
    }
    if (spot.place === place) {
      const moves = ejectMiddle(state, colors);
      if (!moves) throw new Error(`Could not flip the ${colors.join("–")} edge out of its slot.`);
      pushChunks(state, chunks, {
        stageId: "middle",
        title: `Flip the ${colors.join("–")} edge out`,
        goal: "This edge is in the right slot but flipped. Take it out, then insert it the right way up.",
        why: "A single middle edge cannot be flipped in place. The trigger takes it to the top so the next insert can orient it.",
        caseName: "Flipped in its slot",
        advice: `White's neighbour ${colors.join("–")} is between the right centres but turned the wrong way. Lift it out with the second-layer trigger.`,
        tip: null,
        moves,
        focus: spot.faceletIndexes,
      });
      state = applyMoves(state, moves);
      continue;
    }
    const inserted = insertMiddleFromTop(state, colors);
    if (!inserted) throw new Error(`Could not insert the ${colors.join("–")} edge from ${spot.place}.`);
    pushChunks(state, chunks, {
      stageId: "middle",
      title: `Insert the ${colors.join("–")} edge`,
      goal: "Pair this edge with the two side centres it belongs between.",
      why: "Both second-layer triggers are a 4-move trigger with a setup. The colour on top tells you whether the edge belongs on the right or the left.",
      caseName: inserted.caseName,
      advice: inserted.advice,
      tip: chunks.every((chunk) => chunk.stageId !== "middle")
        ? "Reusable idea: match the sideways sticker with the centre facing you. If the colour on top matches the right centre, use the right-hand insert. If it matches the left, use the left-hand insert."
        : null,
      moves: inserted.moves,
      focus: spot.faceletIndexes,
    });
    state = applyMoves(state, inserted.moves);
  }
  if (!f2lSolved(state)) throw new Error(`Middle unfinished ${faceletsToString(state)}`);
}

function solveYellowCross(state: Uint8Array, chunks: TeachingChunk[]) {
  let guard = 0;
  while (!yellowCrossSolved(state) && guard++ < 4) {
    const pattern = yellowPattern(state);
    const attempt = bestCrossAttempt(state);
    if (!attempt) throw new Error(`Yellow cross stuck pattern=${pattern} count=${yellowUpCount(state)} state=${faceletsToString(state)}`);
    pushChunks(state, chunks, {
      stageId: "yellowCross",
      title: pattern === "dot" ? "Yellow cross from the dot" : pattern === "L" ? "Yellow cross from the L" : "Yellow cross from the line",
      goal: "Turn the yellow edge stickers onto the yellow face. Ignore the corners and the side colours for now.",
      why: "F, then the right-hand trigger, then F' flips the yellow edges that are in the line or the L. A dot needs the trigger twice, an L once from the back-left, a line once when it runs left to right.",
      caseName: pattern === "dot" ? "Dot" : pattern === "L" ? "L shape" : "Line",
      advice: crossAdvice(pattern, attempt.setupNote),
      tip: chunks.every((chunk) => chunk.stageId !== "yellowCross")
        ? "Reusable idea: the yellow-cross trigger is F R U R' U' F'. It is the right-hand trigger wrapped in F and F'."
        : null,
      moves: attempt.moves,
      focus: yellowEdgeIndexes(state),
    });
    state = applyMoves(state, attempt.moves);
  }
}

function solveYellowEdges(state: Uint8Array, chunks: TeachingChunk[]) {
  const align = aligningU(state);
  if (align.length) {
    pushChunks(state, chunks, {
      stageId: "yellowEdges",
      title: "Align the yellow cross",
      goal: "Turn the top until every cross edge matches the side centre beside it.",
      why: "The four edges are already in a loop that matches the centres. Only the whole top layer is offset.",
      caseName: "Cross already a loop",
      advice: "All four side colours of the cross can match at once. Turn only the top layer.",
      tip: null,
      moves: align,
      focus: yellowEdgeIndexes(state),
    });
    state = applyMoves(state, align);
  }
  if (yellowEdgesSolved(state)) return;
  const sequence = sunePermutation(state);
  if (!sequence) throw new Error(`Sune missed edges ${faceletsToString(state)}`);
  const groups = splitEvery(sequence.moves, 7);
  groups.forEach((group, index) => {
    pushChunks(state, chunks, {
      stageId: "yellowEdges",
      title: index === 0 ? "Cycle three yellow edges" : "Sune again for the last swap",
      goal: "Move the cross edges until each side colour sits beside its centre. Corners can stay twisted.",
      why: "Sune (R U R' U R U2 R') cycles three yellow edges and leaves the first two layers alone. One sune fixes an adjacent swap after the right hold. Opposite edges need sune twice.",
      caseName: sequence.caseName,
      advice: sequence.advice,
      tip: index === 0 ? "Reusable idea: sune is R U R' U R U2 R'. Here it is only being used to move edges. Corner twist is cleaned up in the last stage." : null,
      moves: group,
      focus: yellowEdgeIndexes(state),
    });
    state = applyMoves(state, group);
  });
}

function solveYellowCornerPlaces(state: Uint8Array, chunks: TeachingChunk[]) {
  let guard = 0;
  while (!yellowCornersPlaced(state) && guard++ < 4) {
    const before = placedCornerCount(state);
    let chosen: string[] | null = null;
    let caseName = "Cycle three corners";
    for (const setup of ["", "y", "y2", "y'"]) {
      for (let reps = 1; reps <= 2; reps++) {
        const moves = [...words(setup), ...repeat(CORNER_CYCLE, reps)];
        const next = applyMoves(state, moves);
        if (!yellowEdgesSolved(next) || !f2lSolved(next)) continue;
        const after = placedCornerCount(next);
        if (after > before || yellowCornersPlaced(next)) {
          chosen = moves;
          caseName = reps === 1 ? "Corner cycle" : "Corner cycle twice";
          break;
        }
      }
      if (chosen) break;
    }
    if (!chosen) throw new Error("The corner cycle did not place the yellow corners.");
    pushChunks(state, chunks, {
      stageId: "yellowCorners",
      title: "Cycle the yellow corners",
      goal: "Put each corner between the three centres it belongs to. Leave the twist for the last stage.",
      why: "U R U' L' U R' U' L cycles three corners and keeps the front-right corner in its slot. If one corner is already correct, hold it at the front-right. If none is correct, the cycle creates one.",
      caseName,
      advice: cornerPlaceAdvice(state),
      tip: chunks.every((chunk) => chunk.stageId !== "yellowCorners")
        ? "Two corners correct and the other two swapped cannot happen on a normal cube. If you ever see that on a physical cube, a piece was reassembled the wrong way."
        : null,
      moves: chosen,
      focus: readCorners(state).filter((corner) => corner.place.startsWith("U")).flatMap((corner) => corner.faceletIndexes),
    });
    state = applyMoves(state, chosen);
  }
}

function solveCornerOrientation(state: Uint8Array, chunks: TeachingChunk[]) {
  if (matchesCenters(state)) return;
  const moves: string[] = [];
  let sim = copyBytes(state);
  let groups = 0;
  while (!uCornersOriented(sim) && groups < 12) {
    let spins = 0;
    while (cornerYellowUp(sim, "URF") && spins < 4) {
      moves.push("U");
      sim = applyMoves(sim, ["U"]);
      spins++;
    }
    if (uCornersOriented(sim)) break;
    moves.push(...BOTTOM_TRIGGER);
    sim = applyMoves(sim, BOTTOM_TRIGGER);
    groups++;
  }
  if (!uCornersOriented(sim)) throw new Error("The bottom trigger did not orient the yellow corners.");
  const align = aligningU(sim);
  moves.push(...align);
  sim = applyMoves(sim, align);
  if (!matchesCenters(sim)) throw new Error("The last layer did not line up after the corner twists.");

  const parts = splitTrigger(moves, BOTTOM_TRIGGER);
  parts.forEach((group, index) => {
    pushChunks(state, chunks, {
      stageId: "orientCorners",
      title: index === parts.length - 1 && group.every((move) => move[0] === "U") ? "Line up the last layer" : "Twist one yellow corner",
      goal: "Turn the yellow stickers of the corners onto the top. The first two layers look scrambled until the last corner is done.",
      why: "R' D' R D twists the front-right top corner by using the bottom layer. Between corners you turn only the top, so the side effects cancel on the final corner.",
      caseName: group.join(" ") === align.join(" ") && align.length ? "Final alignment" : "Bottom trigger",
      advice:
        group.every((move) => move[0] === "U")
          ? "Every yellow sticker is up. Turn only the top until the side colours match. The cube is then solved."
          : "Keep the same front colour facing you. Do not regrip the whole cube between corners. Complete each R' D' R D even if yellow faces up in the middle of it. Two repeats when yellow faces you, four when yellow faces the right — the lesson counts them for this cube.",
      tip: index === 0
        ? "This is the one stage that is supposed to look like you broke the cube. Keep the same face in front and it comes back."
        : null,
      moves: group,
      focus: readCorners(state).find((corner) => corner.place === "URF")?.faceletIndexes ?? [],
    });
    state = applyMoves(state, group);
  });
}

function cornerInsertion(state: Uint8Array, colors: ColorName[]): string[] | null {
  if (whiteCornerSolved(state, colors)) return [];
  const baseline = solvedCornerKeys(state).size;
  const good = (moves: string[]) => {
    if (!moves.length) return false;
    const next = applyMoves(state, moves);
    return bottomCrossSolved(next) && whiteCornerSolved(next, colors) && solvedCornerKeys(next).size > baseline;
  };
  for (const y1 of [0, 1, 2, 3]) {
    for (const u1 of [0, 1, 2, 3]) {
      for (let c1 = 0; c1 <= 6; c1++) {
        const first = [...yPow(y1), ...uPow(u1), ...repeat(SEXY, c1)];
        if (good(first)) return first;
        for (const y2 of [0, 1, 2, 3]) {
          for (const u2 of [0, 1, 2, 3]) {
            for (let c2 = 1; c2 <= 6; c2++) {
              const moves = [...first, ...yPow(y2), ...uPow(u2), ...repeat(SEXY, c2)];
              if (good(moves)) return moves;
            }
          }
        }
      }
    }
  }
  return null;
}

function ejectMiddle(state: Uint8Array, colors: ColorName[]): string[] | null {
  for (const y of [0, 1, 2, 3]) {
    for (const u of [0, 1, 2, 3]) {
      for (const alg of [RIGHT_LAYER, LEFT_LAYER]) {
        const moves = [...yPow(y), ...uPow(u), ...alg];
        const next = applyMoves(state, moves);
        if (!preservedSolvedMiddles(state, next)) continue;
        const spot = findEdge(next, colors[0]!, colors[1]!);
        if (spot && isUpperPlace(spot.place)) return moves;
      }
    }
  }
  return null;
}

function preservedSolvedMiddles(before: Uint8Array, after: Uint8Array): boolean {
  if (!firstLayerSolved(after)) return false;
  const afterKeys = solvedMiddlePairs(after);
  for (const key of solvedMiddlePairs(before)) {
    if (!afterKeys.has(key)) return false;
  }
  return true;
}

function solvedMiddlePairs(state: Uint8Array): Set<string> {
  const keys = new Set<string>();
  for (const place of ["FR", "FL", "BR", "BL"]) {
    if (!slotSolved(state, place)) continue;
    const edge = readEdges(state).find((item) => item.place === place);
    if (edge) keys.add(edge.colors.slice().sort().join("-"));
  }
  return keys;
}

function insertMiddleFromTop(state: Uint8Array, colors: ColorName[]): { moves: string[]; caseName: string; advice: string } | null {
  for (const y of [0, 1, 2, 3]) {
    for (const u of [0, 1, 2, 3]) {
      for (const [alg, handed] of [[RIGHT_LAYER, "right"], [LEFT_LAYER, "left"]] as const) {
        const moves = [...yPow(y), ...uPow(u), ...alg];
        const next = applyMoves(state, moves);
        if (!preservedSolvedMiddles(state, next) || !edgeIsHome(next, colors)) continue;
        if (f2lSolved(next) || middleProgress(next) > middleProgress(state)) {
          const setup = applyMoves(state, [...yPow(y), ...uPow(u)]);
          const spot = findEdge(setup, colors[0]!, colors[1]!);
          const front = spot ? spot.colors[1] : colors[0];
          const top = spot ? spot.colors[0] : colors[1];
          return {
            moves,
            caseName: handed === "right" ? "Right-hand insert" : "Left-hand insert",
            advice: `${top} is on top and ${front} faces you after the setup. That is the ${handed}-hand insert: the colour on top belongs on the ${handed}.`,
          };
        }
        // Accept if this specific edge is solved and the first layer survived, even if another middle edge is still out.
        if (firstLayerSolved(next) && edgeIsHome(next, colors) && middleProgress(next) > middleProgress(state)) {
          return {
            moves,
            caseName: handed === "right" ? "Right-hand insert" : "Left-hand insert",
            advice: `The ${colors.join("–")} edge belongs beside the centre that matches the colour now on top. Use the ${handed}-hand insert.`,
          };
        }
      }
    }
  }
  return null;
}

function bestCrossAttempt(state: Uint8Array): { moves: string[]; setupNote: string } | null {
  const start = yellowUpCount(state);
  let best: { moves: string[]; score: number; setupNote: string } | null = null;
  const options = [
    { alg: CROSS_ALG, label: "F R U R' U' F' (the right-hand trigger wrapped in F and F')" },
    { alg: CROSS_ALG_INVERSE, label: "F U R U' R' F' (the same trigger run backwards, still wrapped in F and F')" },
  ];
  for (const option of options) {
    for (const setup of ["", "U", "U'", "U2", "y", "y'", "y2"]) {
      const moves = [...words(setup), ...option.alg];
      const next = applyMoves(state, moves);
      if (!f2lSolved(next)) continue;
      const score = yellowUpCount(next);
      if (score > start && (!best || score > best.score || (score === best.score && moves.length < best.moves.length))) {
        best = {
          moves,
          score,
          setupNote: `${setup ? `Set up with ${setup}, then ` : ""}${option.label}.`,
        };
      }
    }
  }
  return best;
}

function sunePermutation(state: Uint8Array): { moves: string[]; caseName: string; advice: string } | null {
  const matched = matchedCrossCount(state);
  const setups = ["", "U", "U'", "U2", "y", "y'", "y2"];
  const solvedBy = (moves: string[]) => {
    const next = applyMoves(state, moves);
    return f2lSolved(next) && yellowCrossSolved(next) && yellowEdgesSolved(next);
  };
  for (const alg of [SUNE, ANTISUNE]) {
    for (const setup of setups) {
      for (const between of ["", "U", "U'", "U2"]) {
        const once = [...words(setup), ...alg];
        const twice = [...once, ...words(between), ...alg];
        for (const [moves, times] of [[once, 1], [twice, 2]] as const) {
          if (solvedBy(moves)) {
            const name = alg === SUNE ? "sune" : "antisune";
            return {
              moves,
              caseName: matched >= 2 && oppositeMatched(state) ? "Opposite edges match" : "Adjacent edges match",
              advice: times === 1
                ? `Two cross edges can already sit beside their centres. ${name === "sune" ? "Sune cycles the other three." : "Antisune cycles the other three the other way."}`
                : "The edges need two 3-cycles. The first sets up an adjacent pair; the second finishes them.",
            };
          }
        }
      }
    }
  }
  // A 4-cycle (or a single swap) is an odd edge permutation. Sune is a 3-cycle, so it cannot
  // finish that case. T permutation swaps two edges — and two corners, which later stages fix.
  for (const setup of setups) {
    for (const between of setups) {
      for (const tail of setups) {
        const withSune = [...words(setup), ...TPERM, ...words(between), ...SUNE, ...words(tail)];
        if (solvedBy(withSune)) {
          return {
            moves: withSune,
            caseName: "Edges in a 4-cycle",
            advice: "These four edges are in a 4-cycle. Sune only cycles three, so it cannot finish this alone. T permutation swaps two of them (it also swaps two corners; that is fixed in the next stage). A sune then cycles the three that remain.",
          };
        }
        const bare = [...words(setup), ...TPERM, ...words(between)];
        if (solvedBy(bare)) {
          return {
            moves: bare,
            caseName: "Two edges to swap",
            advice: "Two edges need to trade places. T permutation swaps that pair. Corners move as well; place them in the next stage.",
          };
        }
      }
    }
  }
  return null;
}

function pushChunks(state: Uint8Array, chunks: TeachingChunk[], draft: Omit<TeachingChunk, "id" | "stageNumber" | "stageName" | "hold" | "fingertricks" | "focus"> & { focus: number[] }) {
  const meta = draft.stageId === "hold" ? { number: 0, name: "Hold" } : STAGE_META[draft.stageId];
  const parts = draft.moves.length > 8 ? splitEvery(draft.moves, draft.stageId === "orientCorners" ? 4 : 4) : [draft.moves];
  let cursor = copyBytes(state);
  parts.forEach((moves, index) => {
    chunks.push({
      id: `${chunks.length}-${draft.stageId}-${index}`,
      stageId: draft.stageId,
      stageNumber: meta.number,
      stageName: meta.name,
      title: parts.length > 1 ? `${draft.title} (${index + 1}/${parts.length})` : draft.title,
      goal: draft.goal,
      why: draft.why,
      caseName: draft.caseName,
      hold: holdText(cursor),
      moves,
      focus: index === 0 ? draft.focus : draft.focus,
      advice: draft.advice,
      tip: index === 0 ? draft.tip : null,
      fingertricks: fingerTricks(moves),
    });
    cursor = applyMoves(cursor, moves);
  });
}

export function holdText(state: Uint8Array): string {
  return `Hold ${centerColor(state, "U")} on top, ${centerColor(state, "D")} on the bottom, and ${centerColor(state, "F")} facing you. Right is ${centerColor(state, "R")}. Moves follow this hold, not the camera.`;
}

function pack(chunks: TeachingChunk[]): Solution {
  const moves = chunks.flatMap((chunk) => chunk.moves);
  const chunkOfMove: number[] = [];
  chunks.forEach((chunk, index) => {
    for (let i = 0; i < chunk.moves.length; i++) chunkOfMove.push(index);
  });
  return { chunks, moves, chunkOfMove };
}

function words(value: string): string[] {
  return value ? value.split(/\s+/) : [];
}

function yPow(count: number): string[] {
  if (count % 4 === 1) return ["y"];
  if (count % 4 === 2) return ["y2"];
  if (count % 4 === 3) return ["y'"];
  return [];
}

function uPow(count: number): string[] {
  if (count % 4 === 1) return ["U"];
  if (count % 4 === 2) return ["U2"];
  if (count % 4 === 3) return ["U'"];
  return [];
}

function repeat(moves: string[], count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(...moves);
  return out;
}

function splitEvery(moves: string[], size: number): string[][] {
  if (!moves.length) return [];
  const groups: string[][] = [];
  for (let i = 0; i < moves.length; i += size) groups.push(moves.slice(i, i + size));
  return groups;
}

function splitCornerMoves(moves: string[]): string[][] {
  const groups: string[][] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) groups.push(buffer);
    buffer = [];
  };
  for (let i = 0; i < moves.length; i++) {
    buffer.push(moves[i]!);
    const tail = buffer.slice(-4);
    if (sameMoves(tail, SEXY) && buffer.length >= 4) flush();
    else if (buffer.length >= 8) flush();
  }
  flush();
  return groups.length ? groups : [moves];
}

function splitTrigger(moves: string[], trigger: string[]): string[][] {
  if (moves.length <= 8) return [moves];
  const groups: string[][] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) groups.push(buffer);
    buffer = [];
  };
  for (const move of moves) {
    buffer.push(move);
    if (sameMoves(buffer.slice(-trigger.length), trigger)) flush();
    else if (buffer.length >= 8) flush();
  }
  flush();
  return groups;
}

function sameMoves(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((move, index) => move === b[index]);
}

function countSexy(moves: string[]): number {
  let count = 0;
  for (let i = 0; i + 3 < moves.length; i++) {
    if (sameMoves(moves.slice(i, i + 4), SEXY)) count++;
  }
  return count;
}

function whiteSide(edge: PieceSpot): "U" | "D" | "side" {
  const spec = EDGE_PLACES.find((item) => item.place === edge.place);
  const index = edge.colors.indexOf("white");
  if (!spec || index < 0) return "side";
  const normal = spec.normals[index]!;
  if (normal.y === 1) return "U";
  if (normal.y === -1) return "D";
  return "side";
}

function isPetal(edge: PieceSpot): boolean {
  return edge.colors.includes("white") && whiteSide(edge) === "U";
}

function crossEdgeSolved(state: Uint8Array, edge: PieceSpot): boolean {
  return edge.colors.includes("white") && slotSolved(state, edge.place) && ["DF", "DR", "DL", "DB"].includes(edge.place);
}

function slotSolved(state: Uint8Array, place: string): boolean {
  const edge = EDGE_PLACES.find((item) => item.place === place);
  const corner = CORNER_PLACES.find((item) => item.place === place);
  if (edge) {
    const spot = readEdges(state).find((item) => item.place === place);
    if (!spot) return false;
    return edge.normals.every((normal, index) => spot.colors[index] === centerColor(state, FACE_OF_NORMAL[`${normal.x},${normal.y},${normal.z}`]!));
  }
  if (corner) {
    const spot = readCorners(state).find((item) => item.place === place);
    if (!spot) return false;
    return corner.normals.every((normal, index) => spot.colors[index] === centerColor(state, FACE_OF_NORMAL[`${normal.x},${normal.y},${normal.z}`]!));
  }
  return false;
}

function bottomCrossSolved(state: Uint8Array): boolean {
  return ["DF", "DR", "DL", "DB"].every((place) => slotSolved(state, place));
}

function firstLayerSolved(state: Uint8Array): boolean {
  return bottomCrossSolved(state) && ["DFR", "DLF", "DBL", "DRB"].every((place) => slotSolved(state, place));
}

function middleSolved(state: Uint8Array): boolean {
  return ["FR", "FL", "BR", "BL"].every((place) => slotSolved(state, place));
}

function f2lSolved(state: Uint8Array): boolean {
  return firstLayerSolved(state) && middleSolved(state);
}

function yellowCrossSolved(state: Uint8Array): boolean {
  const top = centerColor(state, "U");
  return readEdges(state)
    .filter((edge) => ["UF", "UR", "UB", "UL"].includes(edge.place))
    .every((edge) => edge.colors[0] === top);
}

function yellowEdgesSolved(state: Uint8Array): boolean {
  return yellowCrossSolved(state) && ["UF", "UR", "UB", "UL"].every((place) => slotSolved(state, place));
}

function yellowCornersPlaced(state: Uint8Array): boolean {
  return ["URF", "UFL", "ULB", "UBR"].every((place) => {
    const spot = readCorners(state).find((corner) => corner.place === place);
    const spec = CORNER_PLACES.find((corner) => corner.place === place)!;
    if (!spot) return false;
    const expected = spec.normals.map((normal) => centerColor(state, FACE_OF_NORMAL[`${normal.x},${normal.y},${normal.z}`]!));
    return sameSet(spot.colors, expected);
  });
}

function uCornersOriented(state: Uint8Array): boolean {
  const top = centerColor(state, "U");
  return ["URF", "UFL", "ULB", "UBR"].every((place) => cornerColorOn(state, place, 0) === top);
}

function cornerYellowUp(state: Uint8Array, place: string): boolean {
  return cornerColorOn(state, place, 0) === centerColor(state, "U");
}

function cornerColorOn(state: Uint8Array, place: string, index: number): ColorName | null {
  return readCorners(state).find((corner) => corner.place === place)?.colors[index] ?? null;
}

function yellowUpCount(state: Uint8Array): number {
  const top = centerColor(state, "U");
  return readEdges(state).filter((edge) => ["UF", "UR", "UB", "UL"].includes(edge.place) && edge.colors[0] === top).length;
}

function yellowPattern(state: Uint8Array): "dot" | "line" | "L" | "cross" {
  const flags = ["UF", "UR", "UB", "UL"].map((place) => {
    const edge = readEdges(state).find((item) => item.place === place);
    return edge?.colors[0] === centerColor(state, "U");
  });
  const count = flags.filter(Boolean).length;
  if (count === 4) return "cross";
  if (count === 0) return "dot";
  if ((flags[0] && flags[2]) || (flags[1] && flags[3])) return "line";
  return "L";
}

function matchedCrossCount(state: Uint8Array): number {
  return ["UF", "UR", "UB", "UL"].filter((place) => slotSolved(state, place)).length;
}

function oppositeMatched(state: Uint8Array): boolean {
  const flags = ["UF", "UR", "UB", "UL"].map((place) => slotSolved(state, place));
  return Boolean((flags[0] && flags[2] && !flags[1] && !flags[3]) || (flags[1] && flags[3] && !flags[0] && !flags[2]));
}

function aligningU(state: Uint8Array): string[] {
  for (const count of [0, 1, 2, 3]) {
    const moves = uPow(count);
    if (yellowEdgesSolved(applyMoves(state, moves)) && (yellowCornersPlaced(state) ? yellowCornersPlaced(applyMoves(state, moves)) : true)) {
      if (yellowEdgesSolved(applyMoves(state, moves))) return moves;
    }
  }
  for (const count of [0, 1, 2, 3]) {
    const moves = uPow(count);
    if (matchesCenters(applyMoves(state, moves))) return moves;
  }
  return [];
}

function placedCornerCount(state: Uint8Array): number {
  return ["URF", "UFL", "ULB", "UBR"].filter((place) => {
    const spot = readCorners(state).find((corner) => corner.place === place);
    const spec = CORNER_PLACES.find((corner) => corner.place === place)!;
    if (!spot) return false;
    const expected = spec.normals.map((normal) => centerColor(state, FACE_OF_NORMAL[`${normal.x},${normal.y},${normal.z}`]!));
    return sameSet(spot.colors, expected);
  }).length;
}

function petalsPreserved(before: Uint8Array, after: Uint8Array): boolean {
  for (const edge of readEdges(before)) {
    if (!isPetal(edge)) continue;
    const other = edge.colors.find((color) => color !== "white")!;
    const spot = findEdge(after, "white", other);
    if (!spot || whiteSide(spot) !== "U") return false;
  }
  return true;
}

function solvedCrossPreserved(before: Uint8Array, after: Uint8Array): boolean {
  for (const place of ["DF", "DR", "DL", "DB"]) {
    if (slotSolved(before, place) && !slotSolved(after, place)) return false;
  }
  return true;
}

function unsolvedWhiteCorner(state: Uint8Array): PieceSpot | null {
  return (
    readCorners(state).find((corner) => corner.colors.includes("white") && !slotSolved(state, corner.place)) ??
    readCorners(state).find((corner) => corner.colors.includes("white") && !whiteCornerSolved(state, corner.colors)) ??
    null
  );
}

function whiteCornerSolved(state: Uint8Array, colors: ColorName[]): boolean {
  const spot = findCorner(state, colors);
  if (!spot) return false;
  return slotSolved(state, spot.place) && spot.place.startsWith("D") && spot.colors[0] === "white";
}

function solvedCornerKeys(state: Uint8Array): Set<string> {
  const keys = new Set<string>();
  for (const place of ["DFR", "DLF", "DBL", "DRB"]) {
    if (!slotSolved(state, place)) continue;
    const spot = readCorners(state).find((corner) => corner.place === place);
    if (spot) keys.add(spot.colors.slice().sort().join("-"));
  }
  return keys;
}

function isMiddlePlace(place: string): boolean {
  return ["FR", "FL", "BR", "BL"].includes(place);
}

function isUpperPlace(place: string): boolean {
  return ["UF", "UR", "UB", "UL"].includes(place);
}

function edgeIsHome(state: Uint8Array, colors: ColorName[]): boolean {
  const spot = findEdge(state, colors[0]!, colors[1]!);
  return !!spot && slotSolved(state, spot.place) && isMiddlePlace(spot.place);
}

function middleProgress(state: Uint8Array): number {
  return ["FR", "FL", "BR", "BL"].filter((place) => slotSolved(state, place)).length;
}

function yellowEdgeIndexes(state: Uint8Array): number[] {
  return readEdges(state)
    .filter((edge) => edge.colors.includes(centerColor(state, "U")))
    .flatMap((edge) => edge.faceletIndexes);
}

function sameSet(a: readonly ColorName[], b: readonly ColorName[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((color, index) => color === right[index]);
}

function petalCaseName(edge: PieceSpot): string {
  const where = whiteSide(edge);
  if (where === "D") return "White faces the bottom";
  if (where === "side" && ["DF", "DR", "DL", "DB"].includes(edge.place)) return "Flipped in the bottom layer";
  if (isMiddlePlace(edge.place)) return "White edge in the middle";
  if (isUpperPlace(edge.place)) return "White faces the side on top";
  return "White edge";
}

function petalAdvice(edge: PieceSpot, other: ColorName): string {
  return `On this cube the white–${other} edge is at ${placeName(edge.place)}, and white ${whiteSide(edge) === "D" ? "faces the bottom" : whiteSide(edge) === "U" ? "already faces up" : "faces the side"}. The turns park that white sticker on the yellow face.`;
}

function cornerAdvice(state: Uint8Array, colors: ColorName[], group: string[], index: number, total: number): string {
  const spot = findCorner(state, colors);
  const names = colors.filter((color) => color !== "white").join(" and ");
  const where = spot ? placeName(spot.place) : "its slot";
  const white = spot ? (spot.colors[0] === "white" ? "White is on the first face of that slot." : "White is not on the bottom yet.") : "";
  return `The white corner with ${names} starts at ${where}. ${white} ${index + 1 === total ? "This finishes the insertion." : `Part ${index + 1} of ${total}.`} Moves: ${group.join(" ")}.`;
}

function cornerPlaceAdvice(state: Uint8Array): string {
  const count = placedCornerCount(state);
  if (count === 0) return "None of the yellow corners is between the right centres yet. One corner cycle will create a correct corner; hold that one at the front-right and cycle again if needed.";
  if (count === 1) return "One yellow corner is already in the right slot. Turn the whole cube so that corner is at the front-right, then cycle the other three.";
  return "The corners still need to move. The cycle keeps the front-right corner and rotates the other three. Twist does not matter yet.";
}

function crossAdvice(pattern: string, setupNote: string): string {
  if (pattern === "dot") return `No yellow edge sticker is on top. ${setupNote} You will still see an L or a line afterwards; the next step repeats the same trigger.`;
  if (pattern === "L") return `Two yellow edge stickers meet in an L. Hold that L at the back-left, which is what the setup does. ${setupNote}`;
  if (pattern === "line") return `Two opposite yellow edges face up, making a line. Hold the line left-to-right. ${setupNote}`;
  return setupNote;
}

function placeName(place: string): string {
  const names: Record<string, string> = {
    UF: "the front of the top layer",
    UR: "the right of the top layer",
    UB: "the back of the top layer",
    UL: "the left of the top layer",
    DF: "the front of the bottom layer",
    DR: "the right of the bottom layer",
    DB: "the back of the bottom layer",
    DL: "the left of the bottom layer",
    FR: "the front-right middle",
    FL: "the front-left middle",
    BR: "the back-right middle",
    BL: "the back-left middle",
    URF: "the front-right of the top",
    UFL: "the front-left of the top",
    ULB: "the back-left of the top",
    UBR: "the back-right of the top",
    DFR: "the front-right of the bottom",
    DLF: "the front-left of the bottom",
    DBL: "the back-left of the bottom",
    DRB: "the back-right of the bottom",
  };
  return names[place] ?? place;
}

export function stageGoalMet(state: Uint8Array, stage: StageId): boolean {
  switch (stage) {
    case "hold":
      return centerColor(state, "U") === "yellow" && centerColor(state, "F") === "green";
    case "cross":
      return bottomCrossSolved(state);
    case "corners":
      return firstLayerSolved(state);
    case "middle":
      return f2lSolved(state);
    case "yellowCross":
      return f2lSolved(state) && yellowCrossSolved(state);
    case "yellowEdges":
      return f2lSolved(state) && yellowEdgesSolved(state);
    case "yellowCorners":
      return f2lSolved(state) && yellowEdgesSolved(state) && yellowCornersPlaced(state);
    case "orientCorners":
      return matchesCenters(state);
  }
}

export { faceletsToString };
