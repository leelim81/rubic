import { describe, expect, it } from "vitest";
import {
  BASIC_MOVES,
  applyMoves,
  centersAreHome,
  faceletsFromCubie,
  faceletsToString,
  invertAlg,
  matchesCenters,
  mulberry32,
  parseAlg,
  randomLegalState,
  randomScramble,
  readCubies,
  readEdges,
  solvedBytes,
  stringToFacelets,
} from "../src/cube/model";
import { validateBytes } from "../src/cube/validate";

const FACES = ["U", "R", "F", "D", "L", "B"] as const;

describe("moves", () => {
  it("treats four quarter turns as identity and inverts every move", () => {
    const solved = solvedBytes();
    for (const face of [...FACES, "x", "y", "z"] as const) {
      const turned = applyMoves(solved, [face, face, face, face]);
      expect(faceletsToString(turned)).toBe(faceletsToString(solved));
      const prime = applyMoves(solved, [face, `${face}'`]);
      expect(faceletsToString(prime)).toBe(faceletsToString(solved));
      const half = applyMoves(solved, [`${face}2`, `${face}2`]);
      expect(faceletsToString(half)).toBe(faceletsToString(solved));
    }
  });

  it("uses the standard edge cycles", () => {
    const solved = solvedBytes();
    const afterU = readEdges(applyMoves(solved, ["U"])).find((edge) => edge.place === "UL");
    expect(afterU?.colors.slice().sort()).toEqual(["green", "yellow"]);
    const afterR = readEdges(applyMoves(solved, ["R"])).find((edge) => edge.place === "BR");
    expect(afterR?.colors.slice().sort()).toEqual(["orange", "yellow"]);
    const afterF = readEdges(applyMoves(solved, ["F"])).find((edge) => edge.place === "FR");
    expect(afterF?.colors.slice().sort()).toEqual(["green", "yellow"]);
    const afterD = readEdges(applyMoves(solved, ["D"])).find((edge) => edge.place === "DR");
    expect(afterD?.colors.slice().sort()).toEqual(["green", "white"]);
    const afterL = readEdges(applyMoves(solved, ["L"])).find((edge) => edge.place === "FL");
    expect(afterL?.colors.slice().sort()).toEqual(["red", "yellow"]);
    const afterB = readEdges(applyMoves(solved, ["B"])).find((edge) => edge.place === "BL");
    expect(afterB?.colors.slice().sort()).toEqual(["blue", "yellow"]);
  });

  it("returns to solved when a scramble is inverted", () => {
    const solved = faceletsToString(solvedBytes());
    for (let seed = 1; seed <= 40; seed++) {
      const moves = randomScramble(mulberry32(seed), 25);
      const scrambled = applyMoves(solvedBytes(), moves);
      expect(matchesCenters(scrambled)).toBe(false);
      const back = applyMoves(scrambled, invertAlg(moves));
      expect(faceletsToString(back)).toBe(solved);
      expect(validateBytes(scrambled).ok).toBe(true);
    }
  });

  it("parses notation including the curly prime", () => {
    expect(parseAlg("R U R' U' F2 x’")).toEqual(["R", "U", "R'", "U'", "F2", "x'"]);
  });

  it("agrees with an independent cubie painting on every basic move", () => {
    let state = solvedBytes();
    const moves = ["R", "U", "F", "D", "L", "B", "R'", "U2", "F'", "x", "y", "z", "x'", "y2"];
    for (const move of moves) {
      state = applyMoves(state, [move]);
      const cubie = readCubies(state);
      const painted = faceletsFromCubie({
        edgePerm: cubie.edgePerm,
        edgeOri: cubie.edgeOri,
        cornerPerm: cubie.cornerPerm,
        cornerOri: cubie.cornerOri,
      });
      // Whole-cube rotations move centres, and the painter assumes the home hold.
      if (centersAreHome(state)) {
        expect(faceletsToString(painted)).toBe(faceletsToString(state));
      }
      expect(cubie.edgeOri.reduce((sum, value) => sum + value, 0) % 2).toBe(0);
      expect(cubie.cornerOri.reduce((sum, value) => sum + value, 0) % 3).toBe(0);
    }
    expect(BASIC_MOVES.length).toBe(27);
  });
});

describe("validation", () => {
  it("accepts random legal cubie states and rejects the classic impossibilities", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = randomLegalState(mulberry32(seed * 17));
      expect(validateBytes(state).ok).toBe(true);
    }
    const flipped = faceletsFromCubie({
      edgePerm: [...Array(12).keys()],
      edgeOri: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      cornerPerm: [...Array(8).keys()],
      cornerOri: [0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(validateBytes(flipped).ok).toBe(false);
    expect(validateBytes(flipped).issues.some((issue) => issue.code === "edge-flip")).toBe(true);

    const twisted = faceletsFromCubie({
      edgePerm: [...Array(12).keys()],
      edgeOri: Array(12).fill(0),
      cornerPerm: [...Array(8).keys()],
      cornerOri: [1, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(validateBytes(twisted).issues.some((issue) => issue.code === "corner-twist")).toBe(true);

    const swapped = faceletsFromCubie({
      edgePerm: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      edgeOri: Array(12).fill(0),
      cornerPerm: [...Array(8).keys()],
      cornerOri: Array(8).fill(0),
    });
    expect(validateBytes(swapped).issues.some((issue) => issue.code === "parity")).toBe(true);

    const counts = solvedBytes();
    counts[0] = counts[10]!;
    const countResult = validateBytes(counts);
    expect(countResult.ok).toBe(false);
    expect(countResult.issues.some((issue) => issue.code === "counts")).toBe(true);
    expect(countResult.issues.some((issue) => issue.message.includes("Front"))).toBe(false);
  });

  it("does not solve a mirrored centre scheme", () => {
    const mirrored = solvedBytes();
    // Swap red and orange centres only: indices of L centre and R centre.
    const r = 1 * 9 + 4;
    const l = 4 * 9 + 4;
    const tmp = mirrored[r]!;
    mirrored[r] = mirrored[l]!;
    mirrored[l] = tmp;
    const result = validateBytes(mirrored);
    expect(result.ok).toBe(false);
  });

  it("round-trips facelet strings", () => {
    const state = randomLegalState(mulberry32(3));
    expect(faceletsToString(stringToFacelets(faceletsToString(state)))).toBe(faceletsToString(state));
  });
});
