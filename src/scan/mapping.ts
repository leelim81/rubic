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
    title: "1 · Front",
    instruction: "Hold the cube with your chosen top colour upward and one side facing you. Point the camera straight at that front face.",
    detail: "The top colour must be the top of the photo. Do not twist a layer. If one turns by accident, retake this face.",
  },
  {
    face: "R",
    setup: "y",
    title: "2 · Right",
    instruction: "Turn the whole cube a quarter turn clockwise as you look down, so the face that was on the right now faces you. Top stays on top.",
    detail: "Same camera rule: the top colour is the top of the photo.",
  },
  {
    face: "B",
    setup: "y2",
    title: "3 · Back",
    instruction: "Turn the whole cube the same way again. The original back face now faces you.",
    detail: "Still no layer turns. The top colour has not changed.",
  },
  {
    face: "L",
    setup: "y'",
    title: "4 · Left",
    instruction: "Turn it once more the same way. This is the original left face. One more turn would bring you back to the front.",
    detail: "Keep the same top colour upward.",
  },
  {
    face: "U",
    setup: "x'",
    title: "5 · Top",
    instruction: "Return to the starting hold, then tip the top face toward the camera until it faces you.",
    detail: "The face that was at the back should sit at the top of the photo. The centre you chose as top is now in the middle of the picture.",
  },
  {
    face: "D",
    setup: "x",
    title: "6 · Bottom",
    instruction: "From the starting hold, tip the cube the other way until the bottom face points at the camera.",
    detail: "The original front colour should sit at the top of the photo. This is the sixth and last face.",
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
