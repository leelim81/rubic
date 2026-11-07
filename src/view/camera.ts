import type { Vec } from "../cube/model";

/** Vertical field of view of the rendered camera, in degrees. */
export const CAMERA_FOV = 32;
/** Slightly wider fit so a turning layer stays inside the frame. */
const FIT_FOV = 34;

export const HOME_THETA = 0.62;
export const HOME_PHI = 1.02;
export const ORBIT_SPEED = 0.008;
/** A shorter drag is a cancelled gesture, not a face turn. */
export const TURN_DRAG_PX = 28;

export function cameraDistance(aspect: number): number {
  const safe = Math.max(0.45, aspect || 1);
  const vFov = (FIT_FOV * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * safe);
  const bound = 2.9;
  return Math.max(bound / Math.sin(vFov / 2), bound / Math.sin(hFov / 2)) * 1.14;
}

export function cameraEye(theta: number, phi: number, radius: number): Vec {
  return {
    x: radius * Math.sin(phi) * Math.sin(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.cos(theta),
  };
}

/** Matches three.js `lookAt(0, 0, 0)` with the default up vector. */
export function cameraBasis(theta: number, phi: number): { right: Vec; up: Vec; forward: Vec } {
  const eye = cameraEye(theta, phi, 1);
  const zaxis = normalize(eye);
  const xaxis = normalize(cross({ x: 0, y: 1, z: 0 }, zaxis));
  const yaxis = cross(zaxis, xaxis);
  return { right: xaxis, up: yaxis, forward: { x: -zaxis.x, y: -zaxis.y, z: -zaxis.z } };
}

export function dragInCubeSpace(dx: number, dy: number, theta: number, phi: number): Vec {
  const { right, up } = cameraBasis(theta, phi);
  return add(scale(right, dx), scale(up, -dy));
}

export function orbitBy(theta: number, phi: number, dx: number, dy: number): { theta: number; phi: number } {
  return {
    theta: theta - dx * ORBIT_SPEED,
    phi: Math.min(2.6, Math.max(0.25, phi + dy * ORBIT_SPEED)),
  };
}

/** Project a cube-space point into CSS pixels of a canvas with the home-style camera. */
export function projectToScreen(point: Vec, width: number, height: number, theta: number, phi: number): { x: number; y: number } {
  const radius = cameraDistance(width / Math.max(1, height));
  const eye = cameraEye(theta, phi, radius);
  const { right, up, forward } = cameraBasis(theta, phi);
  const relative = sub(point, eye);
  const x = dot(relative, right);
  const y = dot(relative, up);
  const z = dot(relative, forward);
  const aspect = width / Math.max(1, height);
  const tan = Math.tan((CAMERA_FOV * Math.PI) / 180 / 2);
  const ndcX = x / (z * tan * aspect);
  const ndcY = y / (z * tan);
  return { x: (ndcX * 0.5 + 0.5) * width, y: (-ndcY * 0.5 + 0.5) * height };
}

export function viewIsShifted(theta: number, phi: number): boolean {
  return Math.hypot(theta - HOME_THETA, phi - HOME_PHI) > 0.28;
}

function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: Vec, factor: number): Vec {
  return { x: a.x * factor, y: a.y * factor, z: a.z * factor };
}

function cross(a: Vec, b: Vec): Vec {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(a: Vec): Vec {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / length);
}
