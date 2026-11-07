import type { Vec } from "../cube/model";

const CLOCKWISE_IS_NEGATIVE = new Set(["U", "R", "F", "y", "x", "z"]);

/**
 * Turn implied by a drag on the cube.
 * `position` is the cubie that was grabbed, `normal` is the sticker facing the pointer,
 * and `drag` is the drag in cube space. Outer layers become face turns.
 */
export function interpretDrag(position: Vec, normal: Vec, drag: Vec): string | null {
  const axes: ["x" | "y" | "z", Vec][] = [
    ["x", { x: 1, y: 0, z: 0 }],
    ["y", { x: 0, y: 1, z: 0 }],
    ["z", { x: 0, y: 0, z: 1 }],
  ];
  let best: { axis: "x" | "y" | "z"; score: number } | null = null;
  for (const [name, axis] of axes) {
    if (Math.abs(dot(axis, normal)) > 0.85) continue;
    const tangent = cross(axis, position);
    const score = dot(tangent, drag);
    if (!best || Math.abs(score) > Math.abs(best.score)) best = { axis: name, score };
  }
  if (!best || Math.abs(best.score) < 0.15) return null;
  const coordinate = best.axis === "x" ? position.x : best.axis === "y" ? position.y : position.z;
  if (Math.abs(coordinate) !== 1) return null;
  const face = faceOnAxis(best.axis, coordinate);
  if (!face) return null;
  const negative = best.score < 0;
  const clockwise = CLOCKWISE_IS_NEGATIVE.has(face) ? negative : !negative;
  return clockwise ? face : `${face}'`;
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
