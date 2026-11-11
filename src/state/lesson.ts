import { applyFiveString } from "../cube/five";
import { applyMoves, faceletsToString, stringToFacelets } from "../cube/model";
import { applyMegaString } from "../megaminx/model";
import { applyMaster, applyMasterMoves } from "../pyraminx/master";
import { applyPyra, applyPyraMoves } from "../pyraminx/model";
import type { Solution, TeachingChunk } from "../solver/beginner";

export interface LessonSnapshot {
  start: string;
  moves: string[];
  chunkOfMove: number[];
  chunks: TeachingChunk[];
  cursor: number;
  arrivedBy: string | null;
  pending: PendingQuarter | null;
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
  /** First quarter of a half turn that is still waiting for the same quarter again. */
  pending: PendingQuarter | null;
}

export interface PendingQuarter {
  move: string;
  intent: "do" | "undo";
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
    pending: null,
  };
}

export function currentFacelets(lesson: Lesson): string {
  const moves = lesson.moves.slice(0, lesson.cursor);
  if (lesson.pending) moves.push(lesson.pending.move);
  if (lesson.start.length === 64) return applyMasterMoves(lesson.start, moves);
  if (lesson.start.length === 36) return applyPyraMoves(lesson.start, moves);
  if (lesson.start.length === 150) return applyFiveString(lesson.start, moves);
  if (lesson.start.length === 132) return applyMegaString(lesson.start, moves);
  return faceletsToString(applyMoves(stringToFacelets(lesson.start), moves));
}

export function snapshot(lesson: Lesson): LessonSnapshot {
  return {
    start: lesson.start,
    moves: lesson.moves,
    chunkOfMove: lesson.chunkOfMove,
    chunks: lesson.chunks,
    cursor: lesson.cursor,
    arrivedBy: lesson.arrivedBy,
    pending: lesson.pending,
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
    pending: null,
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
  return branchFrom(lesson, facelets, solution, null, "That turn was not the next move, so the solution restarted from the cube as it is now.");
}

/** A turn made while no lesson move is waiting. The opposite turn restores the previous lesson. */
export function branchFrom(lesson: Lesson, facelets: string, solution: Solution, byMove: string | null, notice: string): Lesson {
  return {
    ...withSolution(lesson, facelets, solution, notice),
    history: [...lesson.history, snapshot(lesson)],
    arrivedBy: byMove,
  };
}

export type TurnChoice = "forward" | "back" | "reject" | "branch" | "start-half" | "finish-half" | "start-undo" | "finish-undo" | "cancel-pending";

/**
 * How a manual turn relates to the lesson.
 * A quarter that matches the next move advances. A face half turn (R2 and the rest) is two
 * quarters in the same direction, either R then R or R' then R'. The opposite of the first
 * quarter cancels it. A different face is refused, so the counter and the cube stay together.
 */
export function decideTurn(lesson: Lesson, move: string): TurnChoice {
  const pending = lesson.pending;
  if (pending && move === pending.move) return pending.intent === "do" ? "finish-half" : "finish-undo";
  if (pending && move === invertMove(pending.move)) return "cancel-pending";
  if (pending) return "reject";
  const next = lesson.moves[lesson.cursor];
  if (next && move === next) return "forward";
  if (isFaceHalf(next) && isQuarterOf(move, next)) return "start-half";
  const previous = lesson.cursor > 0 ? lesson.moves[lesson.cursor - 1] : undefined;
  if (previous && move === invertMove(previous)) return "back";
  if (isFaceHalf(previous) && isQuarterOf(move, previous)) return "start-undo";
  if (lesson.arrivedBy && lesson.cursor === 0 && move === invertMove(lesson.arrivedBy)) return "back";
  if (next) return "reject";
  return "branch";
}

export function isFaceHalf(move: string | undefined): move is string {
  return !!move && /^[UDFBLR]2$/.test(move);
}

export function isQuarterOf(move: string, half: string): boolean {
  return isFaceHalf(half) && (move === half[0] || move === `${half[0]}'`);
}

export function invertMove(move: string): string {
  if (move.endsWith("++")) return `${move.slice(0, -2)}--`;
  if (move.endsWith("--")) return `${move.slice(0, -2)}++`;
  if (move.endsWith("+")) return `${move.slice(0, -1)}-`;
  if (move.endsWith("-")) return `${move.slice(0, -1)}+`;
  if (!move || move.endsWith("2")) return move;
  if (move.endsWith("'")) return move.slice(0, -1);
  return `${move}'`;
}

/** State change for a manual turn. `animate` is the move to show, or null when the cube must stay. */
export function commitTurn(lesson: Lesson, move: string): { lesson: Lesson; animate: string | null } {
  const choice = decideTurn(lesson, move);
  const ready = { ...lesson, busy: false, notice: null as string | null };
  switch (choice) {
    case "reject": {
      const next = lesson.moves[lesson.cursor];
      const half = isFaceHalf(next) ? ` Do ${next?.[0]} twice, or ${next?.[0]}' twice.` : "";
      const mid = lesson.pending ? ` Finish ${lesson.pending.move}, or take that quarter back.` : "";
      return {
        lesson: { ...lesson, notice: `${move} is not the next move, so the cube stays as it is.${next ? ` Next is ${next}.` : ""}${half}${mid}` },
        animate: null,
      };
    }
    case "start-half":
      return { lesson: { ...ready, pending: { move, intent: "do" } }, animate: move };
    case "start-undo":
      return { lesson: { ...ready, pending: { move, intent: "undo" } }, animate: move };
    case "cancel-pending":
      return { lesson: { ...ready, pending: null }, animate: invertMove(lesson.pending?.move ?? move) };
    case "finish-half":
      return { lesson: stepForward({ ...ready, pending: null }), animate: move };
    case "finish-undo":
      return { lesson: stepBack({ ...ready, pending: null }), animate: move };
    case "forward":
      return { lesson: stepForward(ready), animate: lesson.moves[lesson.cursor] ?? null };
    case "back":
      if (lesson.cursor === 0) return { lesson: stepBack(ready), animate: lesson.arrivedBy ? invertMove(lesson.arrivedBy) : null };
      return { lesson: stepBack(ready), animate: invertMove(lesson.moves[lesson.cursor - 1] ?? "") || null };
    case "branch":
      return { lesson, animate: move };
  }
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

export function cloneLesson(lesson: Lesson): Lesson {
  return {
    ...lesson,
    moves: [...lesson.moves],
    chunkOfMove: [...lesson.chunkOfMove],
    chunks: lesson.chunks.map((chunk) => ({ ...chunk, moves: [...chunk.moves], focus: [...(chunk.focus ?? [])], fingertricks: [...(chunk.fingertricks ?? [])] })),
    history: lesson.history.map((item) => ({
      ...item,
      moves: [...item.moves],
      chunkOfMove: [...item.chunkOfMove],
      pending: item.pending ? { ...item.pending } : null,
    })),
    pending: lesson.pending ? { ...lesson.pending } : null,
    busy: false,
  };
}

/** The next forward animation from the current cursor, including the second quarter of a half turn. */
export function advanceLesson(lesson: Lesson): { move: string; lesson: Lesson } | null {
  const ready = { ...lesson, busy: false, notice: null as string | null };
  if (ready.pending?.intent === "undo") return null;
  if (ready.pending?.intent === "do") {
    const result = commitTurn(ready, ready.pending.move);
    if (!result.animate) return null;
    return { move: result.animate, lesson: { ...result.lesson, busy: false } };
  }
  if (ready.cursor >= ready.moves.length) return null;
  const move = ready.moves[ready.cursor];
  if (!move) return null;
  return { move, lesson: { ...stepForward(ready), busy: false } };
}

export function progressLabel(lesson: Lesson): { stage: string; step: string } {
  const total = lesson.moves.length;
  if (!total) return { stage: "Solved", step: "No moves needed" };
  if (lesson.cursor >= total && !lesson.pending) return { stage: "Solved", step: "Solved" };
  const chunkIndex = lesson.chunkOfMove[lesson.cursor] ?? 0;
  const chunk = lesson.chunks[chunkIndex];
  const stageName = chunk?.stageName || "Solve";
  let first = chunkIndex;
  while (first > 0 && lesson.chunks[first - 1]?.stageId === chunk?.stageId) first -= 1;
  let last = chunkIndex;
  while (last + 1 < lesson.chunks.length && lesson.chunks[last + 1]?.stageId === chunk?.stageId) last += 1;
  let stageStart = 0;
  for (let index = 0; index < first; index += 1) stageStart += lesson.chunks[index]?.moves.length ?? 0;
  let stageLength = 0;
  for (let index = first; index <= last; index += 1) stageLength += lesson.chunks[index]?.moves.length ?? 0;
  const within = lesson.cursor - stageStart + 1;
  return { stage: stageName, step: `${stageName} · ${within}/${stageLength}` };
}

/** The line shown while a solution still has moves left. */
export function solvingHeadline(method: "beginner" | "expert", stageStep: string, index: number, total: number): string {
  const name = method === "beginner" ? "Beginner" : "Expert";
  const move = `Move ${index} of ${total}`;
  if (method === "beginner") return `${name} · ${stageStep} · ${move}`;
  return `${name} · ${move}`;
}

export function applyUserMove(facelets: string, move: string): string {
  if (facelets.length === 64) return applyMaster(facelets, move);
  if (facelets.length === 36) return applyPyra(facelets, move);
  if (facelets.length === 150) return applyFiveString(facelets, [move]);
  if (facelets.length === 132) return applyMegaString(facelets, [move]);
  return faceletsToString(applyMoves(stringToFacelets(facelets), [move]));
}

export function sameBytes(left: string, right: string): boolean {
  return left === right && (left.length === 54 || left.length === 132 || left.length === 150 || left.length === 36 || left.length === 64);
}
