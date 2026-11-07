import { describe, expect, it } from "vitest";
import { applyMoves, faceletsToString, solvedBytes, stringToFacelets } from "../src/cube/model";
import {
  beginAnimation,
  commitTurn,
  currentFacelets,
  decideTurn,
  deviate,
  emptyLesson,
  endAnimation,
  stepBack,
  stepForward,
  upcoming,
  withSolution,
} from "../src/state/lesson";
import type { Solution } from "../src/solver/beginner";

const solved = faceletsToString(solvedBytes());

function sample(): Solution {
  return {
    moves: ["R", "U", "R'"],
    chunkOfMove: [0, 0, 0],
    chunks: [
      {
        id: "c",
        stageId: "cross",
        stageNumber: 1,
        stageName: "White cross",
        title: "Sample",
        goal: "Goal",
        why: "Why this move follows the colours on the cube.",
        caseName: "Sample",
        hold: "Hold yellow on top.",
        moves: ["R", "U", "R'"],
        focus: [],
        advice: "Advice for this exact cube.",
        tip: null,
        fingertricks: ["a", "b", "c"],
      },
    ],
  };
}

describe("lesson controls", () => {
  it("ignores next and back while an animation is running", () => {
    let lesson = withSolution(emptyLesson(solved), solved, sample());
    lesson = beginAnimation(lesson);
    const ignored = stepForward(stepForward(lesson));
    expect(ignored.cursor).toBe(0);
    expect(stepBack(ignored).cursor).toBe(0);
    lesson = endAnimation(lesson);
    lesson = stepForward(lesson);
    expect(lesson.cursor).toBe(1);
    expect(currentFacelets(lesson)).not.toBe(solved);
    lesson = stepBack(lesson);
    expect(currentFacelets(lesson)).toBe(solved);
  });

  it("keeps the demonstration suffix tied to the current cube", () => {
    let lesson = withSolution(emptyLesson(solved), solved, sample());
    expect(upcoming(lesson)?.suffix).toEqual(["R", "U", "R'"]);
    lesson = stepForward(lesson);
    expect(upcoming(lesson)?.suffix).toEqual(["U", "R'"]);
    expect(upcoming(lesson)?.doneInChunk).toBe(1);
  });

  it("restores the previous plan when a wrong turn is undone", () => {
    const lesson = withSolution(emptyLesson(solved), solved, sample());
    const branched = deviate(lesson, solved, { ...sample(), moves: ["U"], chunkOfMove: [0], chunks: [{ ...sample().chunks[0]!, moves: ["U"] }] });
    expect(branched.moves).toEqual(["U"]);
    expect(stepBack(branched).moves).toEqual(["R", "U", "R'"]);
  });

  it("steps back when the manual turn is the inverse, and refuses a different one", () => {
    let lesson = withSolution(emptyLesson(solved), solved, sample());
    expect(decideTurn(lesson, "R")).toBe("forward");
    lesson = stepForward(endAnimation(lesson));
    expect(currentFacelets(lesson)).not.toBe(solved);
    expect(decideTurn(lesson, "R'")).toBe("back");
    lesson = stepBack(lesson);
    expect(lesson.cursor).toBe(0);
    expect(currentFacelets(lesson)).toBe(solved);
    expect(lesson.moves).toEqual(["R", "U", "R'"]);
    lesson = stepForward(lesson);
    expect(decideTurn(lesson, "F")).toBe("reject");
    expect(decideTurn(lesson, "F")).toBe("reject");
    expect(decideTurn(lesson, "F")).toBe("reject");
    expect(lesson.cursor).toBe(1);
    expect(currentFacelets(lesson)).toBe(currentFacelets(stepForward(withSolution(emptyLesson(solved), solved, sample()))));
  });

  it("completes a half turn with two matching quarters and undoes it the same way", () => {
    const start = faceletsToString(applyMoves(stringToFacelets(solved), ["R2"]));
    let lesson = halfLesson(start, ["R2"]);
    expect(currentFacelets(lesson)).toBe(start);
    expect(decideTurn(lesson, "U")).toBe("reject");
    lesson = commitTurn(lesson, "U").lesson;
    expect(currentFacelets(lesson)).toBe(start);
    expect(lesson.cursor).toBe(0);
    lesson = commitTurn(lesson, "R").lesson;
    expect(lesson.pending).toEqual({ move: "R", intent: "do" });
    expect(currentFacelets(lesson)).toBe(faceletsToString(applyMoves(stringToFacelets(start), ["R"])));
    const midway = currentFacelets(lesson);
    lesson = commitTurn(lesson, "F").lesson;
    expect(currentFacelets(lesson)).toBe(midway);
    expect(lesson.pending?.move).toBe("R");
    lesson = commitTurn(lesson, "R'").lesson;
    expect(lesson.pending).toBeNull();
    expect(currentFacelets(lesson)).toBe(start);
    lesson = commitTurn(commitTurn(lesson, "R'").lesson, "R'").lesson;
    expect(lesson.cursor).toBe(1);
    expect(lesson.pending).toBeNull();
    expect(currentFacelets(lesson)).toBe(solved);
    lesson = commitTurn(commitTurn(lesson, "R").lesson, "R").lesson;
    expect(lesson.cursor).toBe(0);
    expect(currentFacelets(lesson)).toBe(start);
  });
});

function halfLesson(start: string, moves: string[]) {
  const solution = sample();
  solution.moves = moves;
  solution.chunkOfMove = moves.map(() => 0);
  solution.chunks[0]!.moves = moves;
  return withSolution(emptyLesson(solved), start, solution);
}
