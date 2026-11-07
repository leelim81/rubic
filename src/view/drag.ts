import type { Vec } from "../cube/model";

const CLOCKWISE_IS_NEGATIVE = new Set(["U", "R", "F", "y", "x", "z"]);

export type DragClass = { kind: "move"; move: string } | { kind: "ambiguous" } | { kind: "none" };

/**
 * Layer turn implied by dragging one sticker.
 * The sticker follows the pointer, and the whole layer moves with it.
 * A single cubie cannot turn on its own. A diagonal that matches two layers
 * is ambiguous and is not guessed.
 */
export function classifyDrag(position: Vec, normal: Vec, drag: Vec): DragClass {
  const axes: ["x" | "y" | "z", Vec][] = [
    ["x", { x: 1, y: 0, z: 0 }],
    ["y", { x: 0, y: 1, z: 0 }],
    ["z", { x: 0, y: 0, z: 1 }],
  ];
  let best: { axis: "x" | "y" | "z"; score: number } | null = null;
  let second = 0;
  for (const [name, axis] of axes) {
    if (Math.abs(dot(axis, normal)) > 0.85) continue;
    const tangent = cross(axis, position);
    const score = dot(tangent, drag);
    if (!best || Math.abs(score) > Math.abs(best.score)) {
      second = best ? Math.abs(best.score) : 0;
      best = { axis: name, score };
    } else if (Math.abs(score) > second) {
      second = Math.abs(score);
    }
  }
  if (!best || Math.abs(best.score) < 0.15) return { kind: "none" };
  if (second > Math.abs(best.score) * 0.72) return { kind: "ambiguous" };
  const coordinate = best.axis === "x" ? position.x : best.axis === "y" ? position.y : position.z;
  if (Math.abs(coordinate) !== 1) return { kind: "none" };
  const face = faceOnAxis(best.axis, coordinate);
  if (!face) return { kind: "none" };
  const negative = best.score < 0;
  const clockwise = CLOCKWISE_IS_NEGATIVE.has(face) ? negative : !negative;
  return { kind: "move", move: clockwise ? face : `${face}'` };
}

export function interpretDrag(position: Vec, normal: Vec, drag: Vec): string | null {
  const result = classifyDrag(position, normal, drag);
  return result.kind === "move" ? result.move : null;
}

export type TurnResolution = { move: string; reason: "move" } | { move: null; reason: "ambiguous" | "unclear" };

/**
 * The layer slide is kept when it is clear. If the sticker you grabbed is on a
 * different face, and turning that face follows the finger better, that face wins.
 * A drag straight out from the centre, or one that matches two layers, is refused.
 */
export function resolveTurn(position: Vec, normal: Vec, drag: Vec, upHint: Vec, forward?: Vec): TurnResolution {
  const layer = classifyDrag(position, normal, drag);
  const faceMove = touchedFaceTurn(position, normal, drag, upHint, forward);
  if (layer.kind === "move" && faceMove) {
    if (layer.move[0] === faceMove[0]) return { move: layer.move, reason: "move" };
    const layerScore = moveAlignment(layer.move, position, drag);
    const faceScore = moveAlignment(faceMove, position, drag);
    // A front-face drag keeps the layer slide when the two are equal, so the top edge still moves as U.
    // On any other face, a tie goes to the face under the finger.
    const preferFace = normal.z > 0.85 ? faceScore > layerScore : faceScore >= layerScore;
    return { move: preferFace ? faceMove : layer.move, reason: "move" };
  }
  if (layer.kind === "move") return { move: layer.move, reason: "move" };
  if (faceMove) return { move: faceMove, reason: "move" };
  if (layer.kind === "ambiguous") return { move: null, reason: "ambiguous" };
  return { move: null, reason: "unclear" };
}

const LETTER_AXIS: Record<string, { axis: Vec; sign: number }> = {
  U: { axis: { x: 0, y: 1, z: 0 }, sign: -1 },
  D: { axis: { x: 0, y: 1, z: 0 }, sign: 1 },
  R: { axis: { x: 1, y: 0, z: 0 }, sign: -1 },
  L: { axis: { x: 1, y: 0, z: 0 }, sign: 1 },
  F: { axis: { x: 0, y: 0, z: 1 }, sign: -1 },
  B: { axis: { x: 0, y: 0, z: 1 }, sign: 1 },
};

function moveAlignment(move: string, position: Vec, drag: Vec): number {
  const letter = LETTER_AXIS[move[0] ?? ""];
  if (!letter) return 0;
  const sign = move.endsWith("'") ? -letter.sign : letter.sign;
  const displacement = cross(scale(letter.axis, sign), position);
  return dot(displacement, drag);
}

function touchedFaceTurn(position: Vec, normal: Vec, drag: Vec, upHint: Vec, forward?: Vec): string | null {
  const face = faceFromNormal(normal);
  if (!face) return null;
  const centre = { x: normal.x, y: normal.y, z: normal.z };
  let radial = { x: position.x - centre.x, y: position.y - centre.y, z: position.z - centre.z };
  if (Math.hypot(radial.x, radial.y, radial.z) < 0.45 && forward) radial = reject(scale(forward, -1), normal);
  if (Math.hypot(radial.x, radial.y, radial.z) < 0.2) radial = reject(upHint, normal);
  if (Math.hypot(radial.x, radial.y, radial.z) < 0.2) return null;
  const length = Math.hypot(radial.x, radial.y, radial.z);
  radial = { x: radial.x / length, y: radial.y / length, z: radial.z / length };
  const spin = dot(normal, cross(radial, drag));
  const dragLength = Math.hypot(drag.x, drag.y, drag.z) || 1;
  if (Math.abs(spin) < 0.2 * dragLength) return null;
  return spin < 0 ? face : `${face}'`;
}

function faceFromNormal(normal: Vec): string | null {
  if (Math.abs(normal.x) > 0.85) return normal.x > 0 ? "R" : "L";
  if (Math.abs(normal.y) > 0.85) return normal.y > 0 ? "U" : "D";
  if (Math.abs(normal.z) > 0.85) return normal.z > 0 ? "F" : "B";
  return null;
}

function reject(vector: Vec, normal: Vec): Vec {
  const amount = dot(vector, normal);
  return { x: vector.x - normal.x * amount, y: vector.y - normal.y * amount, z: vector.z - normal.z * amount };
}

function faceOnAxis(axis: "x" | "y" | "z", coordinate: number): string | null {
  if (axis === "y") return coordinate > 0 ? "U" : "D";
  if (axis === "x") return coordinate > 0 ? "R" : "L";
  return coordinate > 0 ? "F" : "B";
}

function scale(vector: Vec, factor: number): Vec {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec, b: Vec): Vec {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
