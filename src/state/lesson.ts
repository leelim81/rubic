import { applyMoves, copyBytes, faceletsToString, stringToFacelets } from "../cube/model";
import type { Solution, TeachingChunk } from "../solver/beginner";

export interface LessonSnapshot {
  start: string;
  moves: string[];
  chunkOfMove: number[];
  chunks: TeachingChunk[];
  cursor: number;
}

export interface Lesson {
  start: string;
  moves: string[];
  chunkOfMove: number[];
  chunks: TeachingChunk[];
  cursor: number;
  busy: boolean;
  history: LessonSnapshot[];
  notice: string | null;
}

export function emptyLesson(solved: string): Lesson {
  return {
    start: solved,
    moves: [],
    chunkOfMove: [],
    chunks: [],
    cursor: 0,
    busy: false,
    history: [],
    notice: null,
  };
}

export function currentFacelets(lesson: Lesson): string {
  const state = applyMoves(stringToFacelets(lesson.start), lesson.moves.slice(0, lesson.cursor));
  return faceletsToString(state);
}

export function snapshot(lesson: Lesson): LessonSnapshot {
  return {
    start: lesson.start,
    moves: lesson.moves,
    chunkOfMove: lesson.chunkOfMove,
    chunks: lesson.chunks,
    cursor: lesson.cursor,
  };
}

export function withSolution(lesson: Lesson, start: string, solution: Solution, notice: string | null = null): Lesson {
  return {
    ...lesson,
    start,
    moves: solution.moves,
    chunkOfMove: solution.chunkOfMove,
    chunks: solution.chunks,
    cursor: 0,
    busy: false,
    notice,
  };
}

export function beginAnimation(lesson: Lesson): Lesson {
  return { ...lesson, busy: true };
}

export function endAnimation(lesson: Lesson): Lesson {
  return { ...lesson, busy: false };
}

export function stepForward(lesson: Lesson): Lesson {
  if (lesson.busy || lesson.cursor >= lesson.moves.length) return lesson;
  return { ...lesson, cursor: lesson.cursor + 1, notice: null };
}

export function stepBack(lesson: Lesson): Lesson {
  if (lesson.busy) return lesson;
  if (lesson.cursor > 0) return { ...lesson, cursor: lesson.cursor - 1, notice: null };
  const previous = lesson.history[lesson.history.length - 1];
  if (!previous) return lesson;
  return {
    ...lesson,
    ...previous,
    history: lesson.history.slice(0, -1),
    busy: false,
    notice: null,
  };
}

export function deviate(lesson: Lesson, facelets: string, solution: Solution): Lesson {
  return {
    ...withSolution(lesson, facelets, solution, "That turn was not the next lesson move, so the lesson restarted from the cube as it is now."),
    history: [...lesson.history, snapshot(lesson)],
  };
}

export function upcoming(lesson: Lesson): { chunk: TeachingChunk; suffix: string[]; doneInChunk: number } | null {
  if (lesson.cursor >= lesson.moves.length) return null;
  const chunkIndex = lesson.chunkOfMove[lesson.cursor];
  const chunk = chunkIndex === undefined ? undefined : lesson.chunks[chunkIndex];
  if (!chunk) return null;
  let start = lesson.cursor;
  while (start > 0 && lesson.chunkOfMove[start - 1] === chunkIndex) start -= 1;
  const doneInChunk = lesson.cursor - start;
  return { chunk, suffix: chunk.moves.slice(doneInChunk), doneInChunk };
}

export function progressLabel(lesson: Lesson): { stage: string; move: string; remaining: string } {
  const total = lesson.moves.length;
  if (!total || lesson.cursor >= total) {
    return {
      stage: "Solved",
      move: total ? `All ${total} moves done` : "No moves needed",
      remaining: "0 moves left",
    };
  }
  const chunk = lesson.chunks[lesson.chunkOfMove[lesson.cursor] ?? 0];
  const stage = chunk && chunk.stageNumber > 0 ? `Stage ${chunk.stageNumber} of 7 · ${chunk.stageName}` : "Hold the cube";
  return {
    stage,
    move: `Move ${lesson.cursor + 1} of ${total}`,
    remaining: `${total - lesson.cursor} left, including this one`,
  };
}

export function applyUserMove(facelets: string, move: string): string {
  return faceletsToString(applyMoves(stringToFacelets(facelets), [move]));
}

export function sameBytes(left: string, right: string): boolean {
  return left === right && copyBytes(stringToFacelets(left)).length === 54;
}
