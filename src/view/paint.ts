import { FOUR_SLOTS, fourOffset } from "../cube/four";
import { FIVE_SLOTS, fiveOffset, solvedFiveString } from "../cube/five";
import { FIVE_LIFT, FIVE_PITCH, FOUR_LIFT, FOUR_PITCH, THREE_LIFT } from "./metrics";
import { type Face, type Vec, faceOffset, faceletsToString, solvedBytes, SLOTS } from "../cube/model";

/** Unfilled sticker. Centres stay coloured so the hold is obvious. */
export const BLANK = ".";

/** The order a person turns a physical cube while copying colours. */
export const PAINT_FACES: Face[] = ["F", "R", "B", "L", "U", "D"];

const YAW = 0.42;
const LIFT = 0.4;

export interface FaceGuide {
  title: string;
  /** How to turn the real cube so this face comes toward you. */
  turn: string;
}

export const PAINT_GUIDE: Record<Face, FaceGuide> = {
  F: { title: "Front", turn: "Hold the cube with the green centre facing you and the yellow centre on top." },
  R: { title: "Right", turn: "Turn the cube so the orange centre faces you. Keep the yellow centre on top." },
  B: { title: "Back", turn: "Turn the cube so the blue centre faces you. Keep the yellow centre on top." },
  L: { title: "Left", turn: "Turn the cube so the red centre faces you. Keep the yellow centre on top." },
  U: { title: "Up", turn: "Tilt the cube toward you so the yellow centre faces you. The green centre sits on the bottom edge." },
  D: { title: "Down", turn: "Tilt the cube toward you so the white centre faces you. The green centre sits on the top edge." },
};

/** Camera angles that show one face, tilted about 24° so the neighbouring faces stay visible. */
export function facePose(face: Face): { theta: number; phi: number } {
  const horizon = Math.PI / 2;
  switch (face) {
    case "F":
      return { theta: YAW, phi: horizon - LIFT };
    case "R":
      return { theta: Math.PI / 2 - YAW, phi: horizon - LIFT };
    case "B":
      return { theta: Math.PI - YAW, phi: horizon - LIFT };
    case "L":
      return { theta: -Math.PI / 2 + YAW, phi: horizon - LIFT };
    case "U":
      return { theta: YAW, phi: 0.5 };
    case "D":
      return { theta: YAW, phi: 2.45 };
  }
}

export type PaintOrder = 3 | 4 | 5;

function paintWidth(order: PaintOrder): number {
  return order === 5 ? 5 : order === 4 ? 4 : 3;
}

function paintOffset(face: Face, order: PaintOrder): number {
  return order === 5 ? fiveOffset(face) : order === 4 ? fourOffset(face) : faceOffset(face);
}

export function faceletIndex(face: Face, row: number, col: number, order: PaintOrder = 3): number {
  return paintOffset(face, order) + row * paintWidth(order) + col;
}

export function isCentre(index: number, order: PaintOrder = 3): boolean {
  if (order === 4) return false;
  return order === 5 ? index % 25 === 12 : index % 9 === 4;
}

export function paintableOnFace(order: PaintOrder = 3): number {
  return order === 5 ? 24 : order === 4 ? 16 : 8;
}

/** Solved centres, and a blank everywhere else. A 4×4 has no fixed centre, so every sticker starts blank. */
export function blankPaint(order: PaintOrder = 3): string {
  if (order === 4) return BLANK.repeat(96);
  const solved = order === 5 ? solvedFiveString() : faceletsToString(solvedBytes());
  return [...solved].map((letter, index) => (isCentre(index, order) ? letter : BLANK)).join("");
}

export function blankCount(cells: string): number {
  return [...cells].filter((letter) => letter === BLANK).length;
}

/** First paint face that still has an unfilled sticker. */
export function firstBlankFace(cells: string): Face | null {
  const order = paintOrder(cells);
  const width = paintWidth(order);
  for (const face of PAINT_FACES) {
    for (let row = 0; row < width; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const index = faceletIndex(face, row, col, order);
        if (!isCentre(index, order) && cells[index] === BLANK) return face;
      }
    }
  }
  return null;
}

/** How many paintable stickers on this face have a colour. */
export function filledOnFace(cells: string, face: Face): number {
  const order = paintOrder(cells);
  const width = paintWidth(order);
  let filled = 0;
  for (let row = 0; row < width; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const index = faceletIndex(face, row, col, order);
      if (!isCentre(index, order) && cells[index] !== BLANK) filled += 1;
    }
  }
  return filled;
}

export function blankMessage(count: number): string {
  return count === 1 ? "1 sticker still blank" : `${count} stickers still blank`;
}

/** Blank stickers send you to the first unfinished face. Any other failure starts again at the front. */
export function faceAfterFailedDone(cells: string): Face {
  if (blankCount(cells) > 0) return firstBlankFace(cells) ?? "F";
  return "F";
}

export function faceOfIndex(index: number, order: PaintOrder = 3): Face {
  const stride = order === 5 ? 25 : order === 4 ? 16 : 9;
  return (["U", "R", "F", "D", "L", "B"] as const)[Math.floor(index / stride)] ?? "F";
}

function paintOrder(cells: string): PaintOrder {
  return cells.length === 150 ? 5 : cells.length === 96 ? 4 : 3;
}

/** World position of the sticker plane used by the renderer. */
export function stickerPoint(face: Face, row: number, col: number, order: PaintOrder = 3): Vec {
  if (order === 4) {
    const slot = FOUR_SLOTS.find((item) => item.face === face && item.row === row && item.col === col);
    if (!slot) throw new Error(`No sticker at ${face} ${row},${col}`);
    return {
      x: slot.grid.x * FOUR_PITCH + slot.normal.x * FOUR_LIFT,
      y: slot.grid.y * FOUR_PITCH + slot.normal.y * FOUR_LIFT,
      z: slot.grid.z * FOUR_PITCH + slot.normal.z * FOUR_LIFT,
    };
  }
  if (order === 5) {
    const slot = FIVE_SLOTS.find((item) => item.face === face && item.row === row && item.col === col);
    if (!slot) throw new Error(`No sticker at ${face} ${row},${col}`);
    return {
      x: slot.grid.x * FIVE_PITCH + slot.normal.x * FIVE_LIFT,
      y: slot.grid.y * FIVE_PITCH + slot.normal.y * FIVE_LIFT,
      z: slot.grid.z * FIVE_PITCH + slot.normal.z * FIVE_LIFT,
    };
  }
  const slot = SLOTS.find((item) => item.face === face && item.row === row && item.col === col);
  if (!slot) throw new Error(`No sticker at ${face} ${row},${col}`);
  return {
    x: slot.pos.x + slot.normal.x * THREE_LIFT,
    y: slot.pos.y + slot.normal.y * THREE_LIFT,
    z: slot.pos.z + slot.normal.z * THREE_LIFT,
  };
}

export function indexAt(pos: Vec, normal: Vec): number | null {
  const slot = SLOTS.find((item) => item.pos.x === pos.x && item.pos.y === pos.y && item.pos.z === pos.z && item.normal.x === normal.x && item.normal.y === normal.y && item.normal.z === normal.z);
  return slot?.index ?? null;
}

/** Short message for an illegal colouring. The painter then returns to the front face. */
export function paintErrorMessage(issues: { code: string }[]): string {
  if (issues.some((issue) => issue.code === "counts")) {
    return "Some colours don't add up — each colour needs 9 stickers. Check and try again.";
  }
  return "This colouring isn't possible on a real cube. Check each face again.";
}
