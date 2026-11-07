import { describe, expect, it } from "vitest";
import { faceletsToString, solvedBytes } from "../src/cube/model";
import {
  beginAnimation,
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
    expect(lesson.cursor).toBe(1);
    expect(currentFacelets(lesson)).toBe(currentFacelets(stepForward(withSolution(emptyLesson(solved), solved, sample()))));
  });
});
