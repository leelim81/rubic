import { type Face, type Vec, faceOffset, faceletsToString, solvedBytes, SLOTS } from "../cube/model";

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
  F: { title: "Front", turn: "Green faces you. Yellow stays on top." },
  R: { title: "Right", turn: "Turn the cube to your left until orange faces you. Yellow stays on top." },
  B: { title: "Back", turn: "Turn the cube to your left again until blue faces you." },
  L: { title: "Left", turn: "Turn the cube to your left once more until red faces you." },
  U: { title: "Up", turn: "Tip the top toward you until yellow faces you." },
  D: { title: "Down", turn: "Tip the bottom toward you until white faces you." },
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

export function faceletIndex(face: Face, row: number, col: number): number {
  return faceOffset(face) + row * 3 + col;
}

export function isCentre(index: number): boolean {
  return index % 9 === 4;
}

export function faceOfIndex(index: number): Face {
  return (["U", "R", "F", "D", "L", "B"] as const)[Math.floor(index / 9)] ?? "F";
}

/** World position of the sticker plane used by the renderer. */
export function stickerPoint(face: Face, row: number, col: number): Vec {
  const slot = SLOTS.find((item) => item.face === face && item.row === row && item.col === col);
  if (!slot) throw new Error(`No sticker at ${face} ${row},${col}`);
  return {
    x: slot.pos.x + slot.normal.x * 0.475,
    y: slot.pos.y + slot.normal.y * 0.475,
    z: slot.pos.z + slot.normal.z * 0.475,
  };
}

export function indexAt(pos: Vec, normal: Vec): number | null {
  const slot = SLOTS.find((item) => item.pos.x === pos.x && item.pos.y === pos.y && item.pos.z === pos.z && item.normal.x === normal.x && item.normal.y === normal.y && item.normal.z === normal.z);
  return slot?.index ?? null;
}

const SOLVED_FACELETS = faceletsToString(solvedBytes());

/**
 * Face to show when a colouring is illegal.
 * A sticker that is not the solved colour, of a colour that appears more than nine times, is the stray one.
 * A named piece such as UF points at its first face.
 */
export function faceToInspect(facelets: string, issues: { pieces: string[] }[]): Face | null {
  const counts: Record<string, number> = {};
  for (const letter of facelets) counts[letter] = (counts[letter] ?? 0) + 1;
  for (const face of PAINT_FACES) {
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const index = faceletIndex(face, row, col);
        if (isCentre(index)) continue;
        const letter = facelets[index] ?? "";
        if (letter !== SOLVED_FACELETS[index] && (counts[letter] ?? 0) > 9) return face;
      }
    }
  }
  for (const piece of issues.flatMap((issue) => issue.pieces)) {
    const letter = piece[0];
    if (letter && "URFDLB".includes(letter)) return letter as Face;
  }
  return null;
}
