import * as THREE from "three";
import { type ColorName, type Face, FACES, faceOffset, stringToFacelets } from "../cube/model";
import { SLOTS } from "../cube/model";
import { interpretDrag } from "./drag";

const STICKER: Record<ColorName, string> = {
  white: "#f3f0e8",
  yellow: "#f5d20f",
  red: "#d7263d",
  orange: "#f18f01",
  blue: "#2f6fed",
  green: "#1f9d55",
};

const LETTER: Record<ColorName, string> = {
  white: "W",
  yellow: "Y",
  red: "R",
  orange: "O",
  blue: "B",
  green: "G",
};

const MOVE_ANGLE: Record<string, { axis: "x" | "y" | "z"; layer: (value: number) => boolean; angle: number }> = {
  U: { axis: "y", layer: (value) => value === 1, angle: -Math.PI / 2 },
  D: { axis: "y", layer: (value) => value === -1, angle: Math.PI / 2 },
  R: { axis: "x", layer: (value) => value === 1, angle: -Math.PI / 2 },
  L: { axis: "x", layer: (value) => value === -1, angle: Math.PI / 2 },
  F: { axis: "z", layer: (value) => value === 1, angle: -Math.PI / 2 },
  B: { axis: "z", layer: (value) => value === -1, angle: Math.PI / 2 },
  x: { axis: "x", layer: () => true, angle: -Math.PI / 2 },
  y: { axis: "y", layer: () => true, angle: -Math.PI / 2 },
  z: { axis: "z", layer: () => true, angle: -Math.PI / 2 },
};

interface StickerMesh {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  normal: THREE.Vector3;
  index: number;
}

interface Cubie {
  mesh: THREE.Group;
  home: THREE.Vector3;
  stickers: StickerMesh[];
}

export interface CubeSceneOptions {
  reducedMotion: boolean;
  letters: boolean;
  turns: boolean;
  onTurn?: (move: string) => void;
  onViewShift?: (shifted: boolean) => void;
}

export class CubeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private cubies: Cubie[] = [];
  private stickers: StickerMesh[] = [];
  private frame = 0;
  private theta = 0.62;
  private phi = 1.02;
  private radius = 11;
  private readonly homeTheta = 0.62;
  private readonly homePhi = 1.02;
  private dragging = false;
  private moved = false;
  private pointer = { x: 0, y: 0 };
  private hit: { position: THREE.Vector3; normal: THREE.Vector3 } | null = null;
  private highlight = new Set<number>();
  private facelets = "";
  private disposed = false;
  private animating = false;
  private options: CubeSceneOptions;
  private resizeObserver: ResizeObserver;
  private textures = new Map<string, THREE.CanvasTexture>();

  constructor(private canvas: HTMLCanvasElement, options: CubeSceneOptions) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    this.scene.add(new THREE.HemisphereLight(0xfff6ea, 0x2a241c, 1.15));
    const key = new THREE.DirectionalLight(0xfff7ee, 2.1);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xb9c7e6, 0.55);
    fill.position.set(-5, 2, -3);
    this.scene.add(fill);
    this.buildCubies();
    this.updateCamera();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    this.frame = requestAnimationFrame(this.loop);
  }

  setOptions(options: Partial<CubeSceneOptions>) {
    this.options = { ...this.options, ...options };
    if (this.facelets) this.paint(this.facelets);
  }

  setFacelets(facelets: string) {
    this.facelets = facelets;
    this.resetCubies();
    this.paint(facelets);
  }

  setHighlight(indexes: number[]) {
    this.highlight = new Set(indexes);
    this.paint(this.facelets);
  }

  async animateMove(move: string): Promise<void> {
    const spec = moveSpec(move);
    if (!spec || this.options.reducedMotion) return;
    this.animating = true;
    const pivot = new THREE.Group();
    this.scene.add(pivot);
    const moving = this.cubies.filter((cubie) => spec.layer(cubie.home[spec.axis]));
    for (const cubie of moving) pivot.attach(cubie.mesh);
    await this.tween(pivot, spec.axis, spec.angle);
    this.scene.remove(pivot);
    this.resetCubies();
    if (this.facelets) this.paint(this.facelets);
    this.animating = false;
  }

  resetView() {
    this.theta = this.homeTheta;
    this.phi = this.homePhi;
    this.updateCamera();
    this.options.onViewShift?.(false);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    this.textures.forEach((texture) => texture.dispose());
    this.renderer.dispose();
  }

  private buildCubies() {
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const group = new THREE.Group();
          group.position.set(x, y, z);
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.94, 0.94, 0.94),
            new THREE.MeshStandardMaterial({ color: "#2a261f", roughness: 0.62, metalness: 0.04 }),
          );
          group.add(body);
          const cubie: Cubie = { mesh: group, home: new THREE.Vector3(x, y, z), stickers: [] };
          for (const normal of normalsFor(x, y, z)) {
            const material = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.02 });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), material);
            mesh.position.copy(normal).multiplyScalar(0.475);
            aimPlane(mesh, normal);
            group.add(mesh);
            const sticker: StickerMesh = { mesh, material, normal, index: -1 };
            cubie.stickers.push(sticker);
            this.stickers.push(sticker);
          }
          this.cubies.push(cubie);
          this.scene.add(group);
        }
      }
    }
  }

  private paint(facelets: string) {
    if (facelets.length !== 54) return;
    const colors = stringToFacelets(facelets);
    for (const slot of SLOTS) {
      const sticker = this.stickerAt(slot.pos, slot.normal);
      if (!sticker) continue;
      sticker.index = slot.index;
      const name = (["white", "yellow", "red", "orange", "blue", "green"] as const)[colors[slot.index]!]!;
      const highlighted = this.highlight.has(slot.index);
      sticker.material.color.set(STICKER[name]);
      sticker.material.emissive.set(STICKER[name]);
      sticker.material.emissiveIntensity = highlighted ? 0.55 : 0.22;
      sticker.material.map = this.options.letters || highlighted ? this.texture(name, highlighted) : null;
      sticker.material.needsUpdate = true;
    }
  }

  private texture(color: ColorName, highlighted: boolean) {
    const key = `${color}-${highlighted}-${this.options.letters}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, 128, 128);
    if (highlighted) {
      context.strokeStyle = "#1a140c";
      context.lineWidth = 10;
      context.strokeRect(8, 8, 112, 112);
    }
    if (this.options.letters || highlighted) {
      context.fillStyle = color === "white" || color === "yellow" ? "#241c12" : "#fffaf3";
      context.font = "700 54px Outfit, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(LETTER[color], 64, 68);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textures.set(key, texture);
    return texture;
  }

  private stickerAt(pos: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }) {
    const cubie = this.cubies.find((item) => item.home.x === pos.x && item.home.y === pos.y && item.home.z === pos.z);
    return cubie?.stickers.find((sticker) => sticker.normal.x === normal.x && sticker.normal.y === normal.y && sticker.normal.z === normal.z);
  }

  private resetCubies() {
    for (const cubie of this.cubies) {
      this.scene.attach(cubie.mesh);
      cubie.mesh.position.copy(cubie.home);
      cubie.mesh.quaternion.identity();
      cubie.mesh.rotation.set(0, 0, 0);
      cubie.mesh.scale.set(1, 1, 1);
    }
  }

  private tween(pivot: THREE.Group, axis: "x" | "y" | "z", angle: number) {
    const duration = 280;
    const start = performance.now();
    return new Promise<void>((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        pivot.rotation[axis] = angle * eased;
        if (t < 1 && !this.disposed) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private resize = () => {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth ?? 320;
    const height = parent?.clientHeight ?? 320;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.fitDistance();
    this.camera.updateProjectionMatrix();
    this.updateCamera();
  };

  /** Pull the camera back until the cube's bounding sphere fits both axes, including while a layer turns. */
  private fitDistance() {
    const aspect = Math.max(0.45, this.camera.aspect || 1);
    const vFov = (34 * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const bound = 2.9;
    const distV = bound / Math.sin(vFov / 2);
    const distH = bound / Math.sin(hFov / 2);
    this.radius = Math.max(distV, distH) * 1.14;
  }

  private updateCamera() {
    const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
    const shifted = Math.hypot(this.theta - this.homeTheta, this.phi - this.homePhi) > 0.28;
    this.options.onViewShift?.(shifted);
  }

  private loop = () => {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.loop);
  };

  private onDown = (event: PointerEvent) => {
    if (this.animating) return;
    this.dragging = true;
    this.moved = false;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.hit = this.options.turns ? this.pick(event) : null;
  };

  private onMove = (event: PointerEvent) => {
    if (!this.dragging || this.animating) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    if (!this.moved && dx * dx + dy * dy < 36) return;
    this.moved = true;
    if (this.hit && this.options.turns) {
      const move = this.dragMove(dx, dy);
      if (move) {
        this.dragging = false;
        this.hit = null;
        this.options.onTurn?.(move);
      }
      return;
    }
    this.theta -= dx * 0.008;
    this.phi = Math.min(2.6, Math.max(0.25, this.phi + dy * 0.008));
    this.pointer = { x: event.clientX, y: event.clientY };
    this.updateCamera();
  };

  private onUp = () => {
    this.dragging = false;
    this.hit = null;
  };

  private pick(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hits = ray.intersectObjects(this.stickers.map((sticker) => sticker.mesh), false);
    const hit = hits[0];
    if (!hit) return null;
    const sticker = this.stickers.find((item) => item.mesh === hit.object);
    if (!sticker) return null;
    const cubie = this.cubies.find((item) => item.stickers.includes(sticker));
    if (!cubie) return null;
    return { position: cubie.home.clone(), normal: sticker.normal.clone() };
  }

  private dragMove(dx: number, dy: number): string | null {
    if (!this.hit) return null;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const drag = right.multiplyScalar(dx).add(up.multiplyScalar(-dy));
    return interpretDrag(
      { x: this.hit.position.x, y: this.hit.position.y, z: this.hit.position.z },
      { x: this.hit.normal.x, y: this.hit.normal.y, z: this.hit.normal.z },
      { x: drag.x, y: drag.y, z: drag.z },
    );
  }
}

function moveSpec(move: string) {
  const base = move[0] ?? "";
  const spec = MOVE_ANGLE[base];
  if (!spec) return null;
  const turns = move.endsWith("2") ? 2 : move.endsWith("'") ? 3 : 1;
  return { ...spec, angle: spec.angle * turns };
}

function aimPlane(mesh: THREE.Mesh, normal: THREE.Vector3) {
  if (normal.y === 1) mesh.rotation.x = -Math.PI / 2;
  else if (normal.y === -1) mesh.rotation.x = Math.PI / 2;
  else if (normal.x === 1) mesh.rotation.y = Math.PI / 2;
  else if (normal.x === -1) mesh.rotation.y = -Math.PI / 2;
  else if (normal.z === -1) mesh.rotation.y = Math.PI;
}

function normalsFor(x: number, y: number, z: number): THREE.Vector3[] {
  const normals: THREE.Vector3[] = [];
  if (x === 1) normals.push(new THREE.Vector3(1, 0, 0));
  if (x === -1) normals.push(new THREE.Vector3(-1, 0, 0));
  if (y === 1) normals.push(new THREE.Vector3(0, 1, 0));
  if (y === -1) normals.push(new THREE.Vector3(0, -1, 0));
  if (z === 1) normals.push(new THREE.Vector3(0, 0, 1));
  if (z === -1) normals.push(new THREE.Vector3(0, 0, -1));
  return normals;
}

export function faceName(face: Face): string {
  return { U: "Up", D: "Down", F: "Front", B: "Back", R: "Right", L: "Left" }[face];
}

export const FACE_LIST = FACES;
export const FACELET_OFFSET = faceOffset;
