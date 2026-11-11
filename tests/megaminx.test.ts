import { describe, expect, it } from "vitest";
import {
  FACE_NAMES,
  MEGA_ADJ,
  MEGA_COLORS,
  MEGA_CORNERS,
  MEGA_EDGES,
  MEGA_OPPOSITE,
  applyMegaMoves,
  applyMegaString,
  applyPieceMove,
  clonePieces,
  faceletsSolved,
  formatMegaMove,
  invertMegaMove,
  megaFromString,
  megaToString,
  parseMegaMove,
  pieceViewToFacelets,
  randomMegaScramble,
  readPieces,
  solvedMegaString,
  solvedPieces,
} from "../src/megaminx/model";
import { solveMegaminx } from "../src/megaminx/solver";
import { validateMega } from "../src/megaminx/validate";

const SOLVED = solvedMegaString();

describe("megaminx geometry", () => {
  it("names twelve faces with five clockwise neighbours and the usual opposites", () => {
    expect(FACE_NAMES).toHaveLength(12);
    expect(SOLVED).toHaveLength(132);
    for (let face = 0; face < 12; face += 1) {
      expect(new Set(MEGA_ADJ[face]).size).toBe(5);
      expect(MEGA_ADJ[face]).not.toContain(face);
      expect(MEGA_OPPOSITE[MEGA_OPPOSITE[face]!]!).toBe(face);
      expect(MEGA_ADJ[face]).not.toContain(MEGA_OPPOSITE[face]);
    }
    expect(MEGA_OPPOSITE[FACE_NAMES.indexOf("U")]).toBe(FACE_NAMES.indexOf("D"));
    expect(MEGA_OPPOSITE[FACE_NAMES.indexOf("F")]).toBe(FACE_NAMES.indexOf("B"));
    expect(MEGA_OPPOSITE[FACE_NAMES.indexOf("R")]).toBe(FACE_NAMES.indexOf("DL"));
    expect(new Set(MEGA_COLORS.map((color) => color.letter)).size).toBe(12);
  });

  it("turns a face by fifths and sends the front edge clockwise", () => {
    expect(formatMegaMove(parseMegaMove("R++"))).toBe("R++");
    expect(formatMegaMove(parseMegaMove("BR--"))).toBe("BR--");
    expect(formatMegaMove(parseMegaMove("FL'"))).toBe("FL'");
    expect(invertMegaMove("U++")).toBe("U--");
    expect(invertMegaMove("D'")).toBe("D");
    expect(invertMegaMove("L--")).toBe("L++");
    const once = applyMegaString(SOLVED, ["U"]);
    expect(applyMegaString(once, ["U", "U", "U", "U"])).toBe(SOLVED);
    expect(applyMegaString(SOLVED, ["U", "U'", "F++", "F--"])).toBe(SOLVED);
    const front = FACE_NAMES.indexOf("F");
    const left = FACE_NAMES.indexOf("L");
    const uNeighbours = MEGA_ADJ[FACE_NAMES.indexOf("U")]!;
    expect(uNeighbours[(uNeighbours.indexOf(front) + 1) % 5]).toBe(left);
    const leftEdge = MEGA_EDGES.find((edge) => edge.faces.includes(left) && edge.faces.includes(FACE_NAMES.indexOf("U")))!;
    const leftSticker = leftEdge.stickers.find((index) => Math.floor(index / 11) === left)!;
    expect(once[leftSticker]).toBe("g");
  });
});

describe("megaminx pieces", () => {
  it("agrees with sticker colours on random scrambles", () => {
    let state = clonePieces(solvedPieces());
    let facelets = SOLVED;
    const random = mulberry(7);
    for (let n = 0; n < 30; n += 1) {
      const moves = randomMegaScramble(random, 1);
      facelets = applyMegaString(facelets, moves);
      state = applyPieceMove(state, moveIndex(moves[0]!));
      expect(pieceViewToFacelets(state)).toBe(facelets);
      const read = readPieces(megaFromString(facelets));
      expect(Array.from(read.edgePiece)).toEqual(Array.from(state.edgePiece));
      expect(Array.from(read.edgeOri)).toEqual(Array.from(state.edgeOri));
      expect(Array.from(read.cornerPiece)).toEqual(Array.from(state.cornerPiece));
      expect(Array.from(read.cornerOri)).toEqual(Array.from(state.cornerOri));
    }
    expect(faceletsSolved(facelets)).toBe(false);
    expect(MEGA_CORNERS).toHaveLength(20);
    expect(applyMegaMoves(megaFromString(facelets), []).length).toBe(132);
    expect(megaToString(megaFromString(SOLVED))).toBe(SOLVED);
  });
});

describe("megaminx solver", () => {
  it("rejects an odd edge flip and solves legal scrambles", () => {
    const flipped = SOLVED.split("");
    const edge = MEGA_EDGES[0]!;
    const first = flipped[edge.stickers[0]!]!;
    flipped[edge.stickers[0]!] = flipped[edge.stickers[1]!]!;
    flipped[edge.stickers[1]!] = first;
    expect(validateMega(flipped.join("")).ok).toBe(false);
    expect(validateMega(flipped.join("")).issues.some((issue) => issue.code === "edge-flip")).toBe(true);
    expect(validateMega(SOLVED).ok).toBe(true);
    expect(solveMegaminx(SOLVED).moves).toEqual([]);

    const one = applyMegaString(SOLVED, ["U"]);
    const undone = solveMegaminx(one);
    expect(applyMegaString(one, undone.moves)).toBe(SOLVED);
    expect(undone.moves).toEqual(["U'"]);
    const two = solveMegaminx(applyMegaString(SOLVED, ["R", "U++"]));
    expect(applyMegaString(applyMegaString(SOLVED, ["R", "U++"]), two.moves)).toBe(SOLVED);
    expect(two.moves.length).toBeLessThan(40);

    const random = mulberry(11);
    for (const length of [8, 16, 24]) {
      const scramble = randomMegaScramble(random, length);
      const facelets = applyMegaString(SOLVED, scramble);
      const started = Date.now();
      const solution = solveMegaminx(facelets);
      expect(applyMegaString(facelets, solution.moves)).toBe(SOLVED);
      expect(solution.moves.length).toBeGreaterThan(0);
      expect(solution.moves.length).toBeLessThan(600);
      expect(Date.now() - started).toBeLessThan(15_000);
    }
  }, 90_000);
});

function moveIndex(move: string): number {
  const parsed = parseMegaMove(move);
  return parsed.face * 4 + parsed.steps - 1;
}

function mulberry(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
