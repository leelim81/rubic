import { describe, expect, it } from "vitest";
import { faceletsToString, solvedBytes } from "../src/cube/model";
import {
  beginAnimation,
  currentFacelets,
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
});
