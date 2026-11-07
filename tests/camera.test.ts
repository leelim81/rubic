import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CAMERA_FOV, HOME_PHI, HOME_THETA, cameraBasis, cameraDistance, cameraEye, dragInCubeSpace, projectToScreen } from "../src/view/camera";
import { resolveTurn } from "../src/view/drag";

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

  it("keeps a top-edge drag as U after the view turns", () => {
    const theta = HOME_THETA - 0.7;
    const phi = HOME_PHI;
    const drag = dragInCubeSpace(-36, 4, theta, phi);
    const up = cameraBasis(theta, phi).up;
    expect(resolveTurn({ x: 0, y: 1, z: 1 }, { x: 0, y: 0, z: 1 }, drag, up)).toBe("U");
  });
});