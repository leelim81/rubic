import Cube from "cubejs";
import { describe, expect, it } from "vitest";
import { applyMoves, faceletsToString, solvedBytes } from "../src/cube/model";

const COLOR_TO_FACE: Record<string, string> = { y: "U", o: "R", g: "F", w: "D", r: "L", b: "B" };

function ours(moves: string[]): string {
  return [...faceletsToString(applyMoves(solvedBytes(), moves))].map((letter) => COLOR_TO_FACE[letter] ?? "?").join("");
}

describe("cubejs convention", () => {
  it("matches our face turns", () => {
    Cube.initSolver();
    const faces = ["U", "D", "F", "B", "R", "L"];
    const suffixes = ["", "'", "2"];
    for (const face of faces) {
      for (const suffix of suffixes) {
        const move = `${face}${suffix}`;
        const cube = new Cube();
        cube.move(move);
        expect(cube.asString(), move).toBe(ours([move]));
      }
    }
    const sequence = ["R", "U", "R'", "U'"];
    const cube = new Cube();
    cube.move(sequence.join(" "));
    expect(cube.asString()).toBe(ours(sequence));
    const scrambled = new Cube();
    scrambled.move("R U F");
    const answer = scrambled.solve();
    console.log("solve", answer);
  });
});
