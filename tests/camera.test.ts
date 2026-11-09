import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CAMERA_FOV, HOME_PHI, HOME_THETA, PHI_MAX, PHI_MIN, cameraBasis, cameraDistance, cameraEye, dragInCubeSpace, orbitBy, projectToScreen } from "../src/view/camera";

function facingPoint(theta: number, phi: number) {
  const eye = cameraEye(theta, phi, 1);
  const length = Math.hypot(eye.x, eye.y, eye.z) || 1;
  return { x: (eye.x / length) * 1.25, y: (eye.y / length) * 1.25, z: (eye.z / length) * 1.25 };
}

function measure(
  size: number,
  view: { theta: number; phi: number },
  dx: number,
  dy: number,
) {
  const point = facingPoint(view.theta, view.phi);
  const before = projectToScreen(point, size, size, view.theta, view.phi);
  const next = orbitBy(view.theta, view.phi, dx, dy, size, size);
  const after = projectToScreen(point, size, size, next.theta, next.phi);
  return {
    surface: Math.hypot(after.x - before.x, after.y - before.y),
    turn: Math.hypot(next.theta - view.theta, next.phi - view.phi),
    sx: after.x - before.x,
    sy: after.y - before.y,
    next,
  };
}

function screenShift(
  point: { x: number; y: number; z: number },
  view: { theta: number; phi: number },
  dx: number,
  dy: number,
) {
  const before = projectToScreen(point, 500, 500, view.theta, view.phi);
  const next = orbitBy(view.theta, view.phi, dx, dy, 500, 500);
  const after = projectToScreen(point, 500, 500, next.theta, next.phi);
  return { x: after.x - before.x, y: after.y - before.y };
}

describe("camera projection", () => {
  it("matches the three.js camera used to draw the cube", () => {
    const width = 500;
    const height = 480;
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 40);
    const eye = cameraEye(HOME_THETA, HOME_PHI, cameraDistance(width / height));
    camera.position.set(eye.x, eye.y, eye.z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const point = new THREE.Vector3(0, 1, 1);
    const projected = point.clone().project(camera);
    const screen = projectToScreen({ x: 0, y: 1, z: 1 }, width, height, HOME_THETA, HOME_PHI);
    expect(screen.x).toBeCloseTo((projected.x * 0.5 + 0.5) * width, 1);
    expect(screen.y).toBeCloseTo((-projected.y * 0.5 + 0.5) * height, 1);
    const basis = cameraBasis(HOME_THETA, HOME_PHI);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    expect(basis.right.x).toBeCloseTo(right.x, 5);
    expect(basis.up.y).toBeCloseTo(up.y, 5);
    const drag = dragInCubeSpace(-40, 0, HOME_THETA, HOME_PHI);
    const threeDrag = right.multiplyScalar(-40).add(up.multiplyScalar(0));
    expect(drag.x).toBeCloseTo(threeDrag.x, 4);
    expect(drag.y).toBeCloseTo(threeDrag.y, 4);
    expect(drag.z).toBeCloseTo(threeDrag.z, 4);
  });

  it("moves the grabbed surface with the finger, on every axis", () => {
    const views = [
      { theta: HOME_THETA, phi: HOME_PHI },
      orbitBy(HOME_THETA, HOME_PHI, 90, -40, 500, 500),
      { theta: HOME_THETA + 1.1, phi: 1.4 },
    ];
    for (const view of views) {
      const grabbed = facingPoint(view.theta, view.phi);
      expect(screenShift(grabbed, view, 30, 0).x).toBeGreaterThan(12);
      expect(screenShift(grabbed, view, -30, 0).x).toBeLessThan(-12);
      expect(screenShift(grabbed, view, 0, 30).y).toBeGreaterThan(12);
      expect(screenShift(grabbed, view, 0, -30).y).toBeLessThan(-12);
      const diagonal = screenShift(grabbed, view, 24, -24);
      expect(diagonal.x).toBeGreaterThan(8);
      expect(diagonal.y).toBeLessThan(-8);
    }
  });

  it("keeps a 20px drag to a bounded turn, including a diagonal", () => {
    // Desktop 1280×800 uses a 400px cube; a phone cube is about 379px.
    // Gain is linear: the facing surface moves about one screen pixel per
    // finger pixel. A diagonal is the same rate on both axes, not a faster one.
    const sizes = [400, 379];
    const drags = [
      { dx: 20, dy: 0 },
      { dx: 0, dy: -20 },
      { dx: 0, dy: 20 },
      { dx: 14, dy: -14 },
    ];
    for (const size of sizes) {
      const views = [
        { theta: HOME_THETA, phi: HOME_PHI },
        { theta: HOME_THETA, phi: HOME_PHI - 0.12 },
        orbitBy(HOME_THETA, HOME_PHI, 70, -24, size, size),
      ];
      for (const view of views) {
        for (const drag of drags) {
          const moved = measure(size, view, drag.dx, drag.dy);
          const finger = Math.hypot(drag.dx, drag.dy);
          expect(moved.surface).toBeGreaterThan(finger * 0.85);
          expect(moved.surface).toBeLessThan(finger * 1.35);
          expect(moved.turn).toBeGreaterThan(0.18);
          expect(moved.turn).toBeLessThan(0.42);
          if (drag.dx > 0) expect(moved.sx).toBeGreaterThan(8);
          if (drag.dy < 0) expect(moved.sy).toBeLessThan(-8);
          if (drag.dy > 0) expect(moved.sy).toBeGreaterThan(8);
        }
        const small = measure(size, view, 20, 0);
        const large = measure(size, view, 80, 0);
        expect(large.surface).toBeGreaterThan(small.surface);
        expect(large.turn).toBeGreaterThan(small.turn * 3.2);
        expect(large.turn).toBeLessThan(small.turn * 4.5);
      }
      let stepped = { theta: HOME_THETA, phi: HOME_PHI };
      let previous = 0;
      for (let step = 0; step < 20; step++) {
        const moved = measure(size, stepped, 1, -1);
        expect(moved.surface).toBeGreaterThan(1);
        expect(moved.surface).toBeLessThan(2.4);
        if (step > 0) expect(moved.surface).toBeLessThan(previous * 1.25);
        previous = moved.surface;
        stepped = moved.next;
      }
    }
  });

  it("tracks a slow drag without a jump and stops at the poles", () => {
    const front = { x: 0.2, y: 0, z: 1.3 };
    let theta = HOME_THETA;
    let phi = HOME_PHI;
    let previous = 0;
    for (let step = 0; step < 12; step++) {
      const shift = screenShift(front, { theta, phi }, 4, 0);
      expect(shift.x).toBeGreaterThan(1);
      if (step > 0) expect(shift.x).toBeLessThan(previous * 1.8);
      previous = shift.x;
      const next = orbitBy(theta, phi, 4, 0, 500, 500);
      theta = next.theta;
      phi = next.phi;
    }
    expect(orbitBy(HOME_THETA, PHI_MIN, 0, 80, 500, 500).phi).toBe(PHI_MIN);
    expect(Math.abs(screenShift(front, { theta: HOME_THETA, phi: PHI_MIN }, 0, 80).y)).toBeLessThan(0.5);
    expect(orbitBy(HOME_THETA, PHI_MAX, 0, -80, 500, 500).phi).toBe(PHI_MAX);
    expect(Math.abs(screenShift(front, { theta: HOME_THETA, phi: PHI_MAX }, 0, -80).y)).toBeLessThan(0.5);
  });
});