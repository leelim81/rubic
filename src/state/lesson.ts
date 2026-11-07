import { applyMoves, copyBytes, faceletsToString, stringToFacelets } from "../cube/model";
import type { Solution, TeachingChunk } from "../solver/beginner";

export interface LessonSnapshot {
  start: string;
  moves: string[];
  chunkOfMove: number[];
  chunks: TeachingChunk[];
  cursor: number;
  arrivedBy: string | null;
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
  /** The manual turn that created this lesson from an older one, if any. Its inverse restores that lesson. */
  arrivedBy: string | null;
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
    arrivedBy: null,
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
    arrivedBy: lesson.arrivedBy,
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
    arrivedBy: null,
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
  return branchFrom(lesson, facelets, solution, null, "That turn was not the next lesson move, so the lesson restarted from the cube as it is now.");
}

/** A turn made while no lesson move is waiting. The opposite turn restores the previous lesson. */
export function branchFrom(lesson: Lesson, facelets: string, solution: Solution, byMove: string | null, notice: string): Lesson {
  return {
    ...withSolution(lesson, facelets, solution, notice),
    history: [...lesson.history, snapshot(lesson)],
    arrivedBy: byMove,
  };
}

export type TurnChoice = "forward" | "back" | "reject" | "branch";

/**
 * How a manual turn relates to the lesson.
 * The next scripted move advances. The inverse of the move just done goes back on the same lesson.
 * Any other turn during a lesson is refused, so the counter and the cube stay together.
 * A turn with no scripted move waiting starts a new lesson that its inverse can undo.
 */
export function decideTurn(lesson: Lesson, move: string): TurnChoice {
  const next = lesson.moves[lesson.cursor];
  if (next && move === next) return "forward";
  const previous = lesson.cursor > 0 ? lesson.moves[lesson.cursor - 1] : undefined;
  if (previous && move === invertMove(previous)) return "back";
  if (lesson.arrivedBy && lesson.cursor === 0 && move === invertMove(lesson.arrivedBy)) return "back";
  if (next) return "reject";
  return "branch";
}

export function invertMove(move: string): string {
  if (!move || move.endsWith("2")) return move;
  if (move.endsWith("'")) return move[0]!;
  return `${move}'`;
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

export function progressLabel(lesson: Lesson): { stage: string; step: string } {
  const total = lesson.moves.length;
  if (!total || lesson.cursor >= total) {
    return {
      stage: "Solved",
      step: total ? "This lesson is finished" : "No moves needed",
    };
  }
  const chunk = lesson.chunks[lesson.chunkOfMove[lesson.cursor] ?? 0];
  const stage = chunk && chunk.stageNumber > 0 ? `Stage ${chunk.stageNumber} of 7 · ${chunk.stageName}` : "Hold the cube";
  const stageIndexes = lesson.chunkOfMove
    .map((chunkIndex, moveIndex) => ({ chunkIndex, moveIndex }))
    .filter((item) => lesson.chunks[item.chunkIndex]?.stageId === chunk?.stageId);
  const firstMoves = stageIndexes.filter((item, index, all) => index === 0 || item.chunkIndex !== all[index - 1]?.chunkIndex);
  const stepIndex = Math.max(0, firstMoves.findIndex((item) => item.chunkIndex === lesson.chunkOfMove[lesson.cursor]));
  const chunkIndex = lesson.chunkOfMove[lesson.cursor] ?? 0;
  const moveInChunk = lesson.chunkOfMove.slice(0, lesson.cursor + 1).filter((item) => item === chunkIndex).length;
  return {
    stage,
    step: `Step ${stepIndex + 1} of ${Math.max(1, firstMoves.length)}, move ${moveInChunk}`,
  };
}

export function applyUserMove(facelets: string, move: string): string {
  return faceletsToString(applyMoves(stringToFacelets(facelets), [move]));
}

export function sameBytes(left: string, right: string): boolean {
  return left === right && copyBytes(stringToFacelets(left)).length === 54;
}
