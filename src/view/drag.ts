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

/**
 * Turn to commit when the pointer is released.
 * Outer stickers slide their layer. The centre of a face only spins, so a drag
 * there turns that whole face clockwise or anticlockwise instead of doing nothing.
 * `upHint` is the camera's up direction, used only for that centre-face case.
 */
export function resolveTurn(position: Vec, normal: Vec, drag: Vec, upHint: Vec): string | null {
  const result = classifyDrag(position, normal, drag);
  if (result.kind === "move") return result.move;
  if (result.kind === "ambiguous") return null;
  return centreFaceTurn(normal, drag, upHint);
}

function centreFaceTurn(normal: Vec, drag: Vec, upHint: Vec): string | null {
  const face = faceFromNormal(normal);
  if (!face) return null;
  let radial = reject(upHint, normal);
  if (Math.hypot(radial.x, radial.y, radial.z) < 0.2) {
    const fallback = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    radial = reject(fallback, normal);
  }
  const length = Math.hypot(radial.x, radial.y, radial.z) || 1;
  radial = { x: radial.x / length, y: radial.y / length, z: radial.z / length };
  const spin = dot(normal, cross(radial, drag));
  const dragLength = Math.hypot(drag.x, drag.y, drag.z);
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
