import {
  type ColorName,
  type Face,
  FACES,
  applyMoves,
  colorIndex,
  colorsOfFace,
  faceOffset,
  parseAlg,
  slotSources,
} from "../cube/model";

export interface CaptureStep {
  face: Face;
  /** Whole-cube rotation from the starting hold before this photo. */
  setup: string;
  title: string;
  instruction: string;
  detail: string;
}

/**
 * Photos are taken from the starting hold: the face you choose as top stays Up,
 * and the face you choose as front is Front. Between photos, turn the whole cube.
 * Each photo is read with the current top edge at the top of the picture.
 */
export const CAPTURES: CaptureStep[] = [
  {
    face: "F",
    setup: "",
    title: "Front",
    instruction: "Point the camera straight at the front face. Keep your chosen top colour at the top of the photo.",
    detail: "If a layer turns after a face is saved, close this scan and start again. Retaking one face cannot repair the others.",
  },
  {
    face: "R",
    setup: "y",
    title: "Right",
    instruction: "Turn the whole cube clockwise as you look down, until the right face points at the camera. Top stays on top.",
    detail: "Still no layer turns. If one turned, close this scan and start again.",
  },
  {
    face: "B",
    setup: "y2",
    title: "Back",
    instruction: "Turn the whole cube the same way again. The original back face now faces you.",
    detail: "If a layer has turned, close this scan and start again.",
  },
  {
    face: "L",
    setup: "y'",
    title: "Left",
    instruction: "Turn it once more the same way. This is the original left face.",
    detail: "Keep the same top colour upward.",
  },
  {
    face: "U",
    setup: "x'",
    title: "Top",
    instruction: "Tip the top face toward the camera. The face that was at the back sits at the top of the photo.",
    detail: "The centre you chose as the top is now in the middle.",
  },
  {
    face: "D",
    setup: "x",
    title: "Bottom",
    instruction: "Tip the bottom face toward the camera. The original front colour sits at the top of the photo.",
    detail: "This is the last face.",
  },
];

export function photographCube(state: Uint8Array): Record<Face, ColorName[]> {
  const photos = {} as Record<Face, ColorName[]>;
  for (const capture of CAPTURES) {
    const turned = capture.setup ? applyMoves(state, parseAlg(capture.setup)) : state;
    photos[capture.face] = colorsOfFace(turned, "F");
  }
  return photos;
}

export function reconstructCube(photos: Record<Face, ColorName[]>): Uint8Array {
  const out = new Uint8Array(54);
  for (const capture of CAPTURES) {
    const sources = slotSources(capture.setup ? parseAlg(capture.setup) : []);
    const start = faceOffset("F");
    for (let i = 0; i < 9; i++) {
      const colour = photos[capture.face]?.[i];
      if (!colour) throw new Error(`Missing a sticker for the ${capture.face} photo.`);
      out[sources[start + i]!] = colorIndex(colour);
    }
  }
  return out;
}

export function capturedFaces(): Face[] {
  return FACES.filter((face) => CAPTURES.some((capture) => capture.face === face));
}
