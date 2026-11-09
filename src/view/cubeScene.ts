import * as THREE from "three";
import { type ColorName, type Face, FACES, faceOffset, stringToFacelets } from "../cube/model";
import { isCentre } from "./paint";
import { SLOTS } from "../cube/model";
import { cameraDistance, HOME_PHI, HOME_THETA, orbitBy, viewIsShifted } from "./camera";

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

export type CubeGesture = "view" | "turn" | "off";

export interface CubeSceneOptions {
  reducedMotion: boolean;
  letters: boolean;
  gesture: CubeGesture;
  onTurn?: (move: string) => void;
  onViewShift?: (shifted: boolean) => void;
  onGesture?: (message: string | null) => void;
  onPaint?: (index: number) => void;
  paintFace?: Face | null;
  turnMs?: number;
}

export class CubeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private cubies: Cubie[] = [];
  private stickers: StickerMesh[] = [];
  private frame = 0;
  private theta = HOME_THETA;
  private phi = HOME_PHI;
  private radius = 11;
  private dragging = false;
  private pointer = { x: 0, y: 0 };
  private down = { x: 0, y: 0 };
  private viewToken = 0;
  private highlight = new Set<number>();
  private activePivot: THREE.Group | null = null;
  private activeAxis: "x" | "y" | "z" | null = null;
  private generation = 0;
  private facelets = "";
  private disposed = false;
  private animating = false;
  private options: CubeSceneOptions;
  private resizeObserver: ResizeObserver;
  private textures = new Map<string, THREE.CanvasTexture>();

  constructor(private canvas: HTMLCanvasElement, options: CubeSceneOptions) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
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
    const exposed = this.canvas as HTMLCanvasElement & {
      __rubicSample?: () => unknown;
      __rubicPose?: () => { theta: number; phi: number };
    };
    exposed.__rubicSample = () => this.sampleCubies();
    exposed.__rubicPose = () => ({ theta: this.theta, phi: this.phi });
    (exposed as HTMLCanvasElement & { __rubicReset?: () => void }).__rubicReset = () => this.resetView();
    this.canvas.addEventListener("pointerdown", this.onDown, { passive: false });
    this.canvas.addEventListener("pointermove", this.onMove, { passive: false });
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onCancel);
    this.frame = requestAnimationFrame(this.loop);
  }

  setOptions(options: Partial<CubeSceneOptions>) {
    this.options = { ...this.options, ...options };
    if (this.facelets) this.paint(this.facelets);
  }

  setFacelets(facelets: string) {
    this.facelets = facelets;
    if (this.animating) return;
    this.resetCubies();
    this.paint(facelets);
    this.renderer.render(this.scene, this.camera);
  }

  setHighlight(indexes: number[]) {
    this.highlight = new Set(indexes);
    this.paint(this.facelets);
  }

  async animateMove(move: string, nextFacelets?: string, durationMs?: number): Promise<boolean> {
    const spec = moveSpec(move);
    const settle = nextFacelets || this.facelets;
    const token = this.generation;
    if (!spec || this.options.reducedMotion) {
      if (this.generation !== token) return false;
      if (settle) this.setFacelets(settle);
      return this.generation === token;
    }
    this.animating = true;
    const pivot = new THREE.Group();
    this.activePivot = pivot;
    this.activeAxis = spec.axis;
    this.scene.add(pivot);
    const moving = this.cubies.filter((cubie) => spec.layer(cubie.home[spec.axis]));
    for (const cubie of moving) {
      pivot.attach(cubie.mesh);
      for (const sticker of cubie.stickers) sticker.material.emissiveIntensity = 0.72;
    }
    const finished = await this.tween(pivot, spec.axis, spec.angle, durationMs, token);
    if (!finished || this.generation !== token) {
      this.animating = false;
      return false;
    }
    this.scene.remove(pivot);
    this.activePivot = null;
    this.activeAxis = null;
    this.resetCubies();
    if (settle) this.facelets = settle;
    if (this.facelets) this.paint(this.facelets);
    this.animating = false;
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  cancelAnimation() {
    this.generation += 1;
    this.animating = false;
    if (this.activePivot) {
      this.scene.remove(this.activePivot);
      this.activePivot = null;
      this.activeAxis = null;
    }
    this.resetCubies();
  }

  resetView() {
    this.theta = HOME_THETA;
    this.phi = HOME_PHI;
    this.updateCamera();
    this.options.onViewShift?.(false);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onCancel);
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
      const painting = this.options.paintFace;
      const onCurrent = !painting || slot.face === painting;
      sticker.material.color.set(STICKER[name]);
      if (!onCurrent) sticker.material.color.multiplyScalar(0.34);
      sticker.material.emissive.set(STICKER[name]);
      sticker.material.emissiveIntensity = highlighted ? 0.55 : onCurrent ? 0.22 : 0.04;
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

  private tween(pivot: THREE.Group, axis: "x" | "y" | "z", angle: number, durationMs: number | undefined, token: number) {
    const duration = durationMs ?? Math.max(160, this.options.turnMs ?? 750);
    const start = performance.now();
    return new Promise<boolean>((resolve) => {
      const step = (now: number) => {
        if (this.generation !== token || this.disposed) {
          resolve(false);
          return;
        }
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        pivot.rotation[axis] = angle * eased;
        this.renderer.render(this.scene, this.camera);
        if (t < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  private sampleCubies() {
    return {
      animating: this.animating,
      angle: this.activePivot && this.activeAxis ? this.activePivot.rotation[this.activeAxis] : 0,
      cubies: this.cubies.map((cubie) => {
        const position = new THREE.Vector3();
        cubie.mesh.getWorldPosition(position);
        return {
          hx: cubie.home.x,
          hy: cubie.home.y,
          hz: cubie.home.z,
          x: position.x,
          y: position.y,
          z: position.z,
        };
      }),
    };
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
    this.radius = cameraDistance(this.camera.aspect || 1);
  }

  private updateCamera() {
    const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
    this.options.onViewShift?.(viewIsShifted(this.theta, this.phi));
  }

  private loop = () => {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.loop);
  };

  setPaintFace(face: Face | null) {
    this.options = { ...this.options, paintFace: face };
    if (this.facelets) this.paint(this.facelets);
  }

  /** Smoothly turn the camera so a face sits toward the viewer, slightly angled. */
  lookAt(theta: number, phi: number, duration = 700): Promise<void> {
    const token = ++this.viewToken;
    const fromTheta = this.theta;
    const fromPhi = this.phi;
    let deltaTheta = theta - fromTheta;
    while (deltaTheta > Math.PI) deltaTheta -= Math.PI * 2;
    while (deltaTheta < -Math.PI) deltaTheta += Math.PI * 2;
    const deltaPhi = phi - fromPhi;
    const apply = (amount: number) => {
      this.theta = fromTheta + deltaTheta * amount;
      this.phi = fromPhi + deltaPhi * amount;
      this.updateCamera();
      this.renderer.render(this.scene, this.camera);
    };
    if (this.options.reducedMotion || duration < 20) {
      apply(1);
      return Promise.resolve();
    }
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        if (token !== this.viewToken || this.disposed) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        apply(eased);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private onDown = (event: PointerEvent) => {
    if (this.animating || this.options.gesture === "off") return;
    this.viewToken += 1;
    this.dragging = true;
    this.down = { x: event.clientX, y: event.clientY };
    this.pointer = { x: event.clientX, y: event.clientY };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Dispatched test events have no active pointer. The listeners still run.
    }
    event.preventDefault();
  };

  private onMove = (event: PointerEvent) => {
    if (!this.dragging || this.animating || this.options.gesture === "off") return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    if (dx === 0 && dy === 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const next = orbitBy(this.theta, this.phi, dx, dy, rect.width, rect.height);
    this.theta = next.theta;
    this.phi = next.phi;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    event.preventDefault();
  };

  private onUp = (event: PointerEvent) => {
    if (!this.dragging) return;
    const dx = event.clientX - this.down.x;
    const dy = event.clientY - this.down.y;
    this.dragging = false;
    if (!this.options.paintFace || dx * dx + dy * dy > 10 * 10) return;
    const index = this.pickIndex(event.clientX, event.clientY);
    if (index === null || isCentre(index)) return;
    const faceIndex = "URFDLB".indexOf(this.options.paintFace);
    if (Math.floor(index / 9) !== faceIndex) return;
    this.options.onPaint?.(index);
  };

  private pickIndex(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hits = ray.intersectObjects(this.stickers.map((sticker) => sticker.mesh), false);
    const hit = hits[0];
    if (!hit) return null;
    const sticker = this.stickers.find((item) => item.mesh === hit.object);
    return sticker && sticker.index >= 0 ? sticker.index : null;
  };

  private onCancel = () => {
    this.dragging = false;
  };
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
