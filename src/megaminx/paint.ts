import {
  FACE_NAMES,
  MEGA_COLORS,
  MEGA_NORMALS,
  MEGA_STICKER_MESH,
  STICKERS_PER_FACE,
  blankMegaString,
  isMegaCentre,
  type MegaFace,
  type Vec,
} from "./model";

/** The order a person turns a megaminx while copying colours. */
export const MEGA_PAINT_ORDER: MegaFace[] = ["F", "R", "BR", "BL", "L", "U", "FR", "DR", "B", "DL", "FL", "D"];

export interface MegaGuide {
  title: string;
  turn: string;
}

const GUIDE: Record<MegaFace, MegaGuide> = {
  F: { title: "Front", turn: "Hold the megaminx with the green centre facing you and the white centre on top." },
  R: { title: "Right", turn: "Turn it so the red centre faces you. Keep the white centre on top." },
  BR: { title: "Back right", turn: "Turn it so the blue centre faces you. Keep the white centre on top." },
  BL: { title: "Back left", turn: "Turn it so the yellow centre faces you. Keep the white centre on top." },
  L: { title: "Left", turn: "Turn it so the purple centre faces you. Keep the white centre on top." },
  U: { title: "Up", turn: "Tilt it toward you so the white centre faces you." },
  FR: { title: "Front right", turn: "Tilt the front-right lower face toward you. Its centre is cream." },
  DR: { title: "Down right", turn: "Turn the pink centre toward you." },
  B: { title: "Back", turn: "Turn the lime centre toward you." },
  DL: { title: "Down left", turn: "Turn the orange centre toward you." },
  FL: { title: "Front left", turn: "Turn the sky centre toward you." },
  D: { title: "Down", turn: "Tilt it so the grey centre faces you." },
};

export function megaGuide(face: MegaFace): MegaGuide {
  return GUIDE[face];
}

export function megaPaintCount(): number {
  return 10;
}

export function blankMegaPaint(): string {
  return blankMegaString();
}

export function filledOnMegaFace(cells: string, face: MegaFace): number {
  const offset = FACE_NAMES.indexOf(face) * STICKERS_PER_FACE;
  let filled = 0;
  for (let local = 1; local < STICKERS_PER_FACE; local += 1) if (cells[offset + local] !== ".") filled += 1;
  return filled;
}

export function firstBlankMegaFace(cells: string): MegaFace {
  for (const face of MEGA_PAINT_ORDER) if (filledOnMegaFace(cells, face) < megaPaintCount()) return face;
  return "F";
}

/** Camera angles that show one face, tilted so the neighbouring faces stay visible. */
export function megaFacePose(face: MegaFace): { theta: number; phi: number } {
  const normal = MEGA_NORMALS[FACE_NAMES.indexOf(face)]!;
  const tangent = perpendicular(normal);
  const tilt = normalize(add(normal, scale(tangent, 0.24)));
  return {
    phi: Math.acos(Math.max(-1, Math.min(1, tilt.y))),
    theta: Math.atan2(tilt.x, tilt.z),
  };
}

export function megaStickerPoint(face: MegaFace, local: number): Vec {
  const index = FACE_NAMES.indexOf(face) * STICKERS_PER_FACE + local;
  const sticker = MEGA_STICKER_MESH[index];
  if (!sticker) throw new Error(`No megaminx sticker at ${face} ${local}`);
  return sticker.centroid;
}

export function megaColourId(letter: string): string | null {
  return MEGA_COLORS.find((color) => color.letter === letter)?.id ?? null;
}

export { isMegaCentre };

function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(a: Vec, factor: number): Vec {
  return { x: a.x * factor, y: a.y * factor, z: a.z * factor };
}

function cross(a: Vec, b: Vec): Vec {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(a: Vec): Vec {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / length);
}

function perpendicular(v: Vec): Vec {
  const axis = Math.abs(v.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalize(cross(v, axis));
}
