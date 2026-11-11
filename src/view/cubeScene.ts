import * as THREE from "three";
import { type ColorName, type Face, FACES, faceOffset, LETTER_COLOR } from "../cube/model";
import { FIVE_SLOTS, parseFiveMove } from "../cube/five";
import { FOUR_SLOTS, parseFourMove } from "../cube/four";
import { MASTER_MESH, masterAnim } from "../pyraminx/master";
import { PYRA_MESH, pyraAnim, pyraBodyTriangles, type PyraSticker, type Vec as PyraVec } from "../pyraminx/model";
import { BLANK, isCentre } from "./paint";
import { SLOTS } from "../cube/model";
import { cameraDistance, HOME_PHI, HOME_THETA, orbitBy, viewIsShifted } from "./camera";
import { FIVE_BODY, FIVE_LIFT, FIVE_PITCH, FIVE_STICKER, FOUR_BODY, FOUR_LIFT, FOUR_PITCH, FOUR_STICKER, THREE_BODY, THREE_LIFT, THREE_PITCH, THREE_STICKER } from "./metrics";
import { STICKER_MARK } from "./contrast";
import { displaySwatch, getPalette, subscribePalette } from "./palette";

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
  material: THREE.MeshBasicMaterial;
  normal: THREE.Vector3;
  index: number;
}

interface Cubie {
  mesh: THREE.Group;
  home: THREE.Vector3;
  stickers: StickerMesh[];
  id?: string;
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
  /** Slow spin used on the empty landing, before a cube has been entered. */
  idle?: boolean;
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
  private idleStamp = 0;
  private options: CubeSceneOptions;
  private order: 3 | 4 | 5 = 3;
  private pyra = false;
  private tetra: 36 | 64 | 0 = 0;
  private pyraBody: THREE.Mesh | null = null;
  private resizeObserver: ResizeObserver;
  private textures = new Map<string, THREE.CanvasTexture>();
  private blankMap: THREE.CanvasTexture | null = null;
  private unsubscribePalette: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement, options: CubeSceneOptions) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
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
    (exposed as HTMLCanvasElement & { __rubicPick?: (x: number, y: number) => number | null }).__rubicPick = (x, y) => this.pickIndex(x, y);
    (exposed as HTMLCanvasElement & { __rubicReset?: () => void }).__rubicReset = () => this.resetView();
    this.canvas.addEventListener("pointerdown", this.onDown, { passive: false });
    this.canvas.addEventListener("pointermove", this.onMove, { passive: false });
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onCancel);
    this.unsubscribePalette = subscribePalette(this.onPalette);
    this.frame = requestAnimationFrame(this.loop);
  }

  setOptions(options: Partial<CubeSceneOptions>) {
    this.options = { ...this.options, ...options };
    if (this.facelets) this.paint(this.facelets);
  }

  setFacelets(facelets: string) {
    const tetra = facelets.length === 64 ? 64 : facelets.length === 36 ? 36 : 0;
    const order = facelets.length === 150 ? 5 : facelets.length === 96 ? 4 : 3;
    if (tetra !== this.tetra || (tetra === 0 && order !== this.order)) {
      this.tetra = tetra;
      this.pyra = tetra !== 0;
      if (!this.pyra) this.order = order;
      this.clearCubies();
      if (tetra === 64) this.buildPyraminx(MASTER_MESH);
      else if (tetra === 36) this.buildPyraminx(PYRA_MESH);
      else this.buildCubies();
    }
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
    if (this.pyra) return this.animatePyra(move, nextFacelets, durationMs);
    const spec = this.describeMove(move);
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
    for (const cubie of moving) pivot.attach(cubie.mesh);
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
    this.unsubscribePalette();
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onCancel);
    this.textures.forEach((texture) => texture.dispose());
    this.blankMap?.dispose();
    this.renderer.dispose();
  }

  private clearCubies() {
    if (this.pyraBody) {
      this.pyraBody.removeFromParent();
      this.pyraBody.geometry.dispose();
      (this.pyraBody.material as THREE.Material).dispose();
      this.pyraBody = null;
    }
    for (const cubie of this.cubies) {
      cubie.mesh.removeFromParent();
      cubie.mesh.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose?.();
      });
    }
    this.cubies = [];
    this.stickers = [];
  }

  private buildPyraminx(stickers: PyraSticker[]) {
    const body = pyraBodyTriangles();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(body.positions, 3));
    geometry.setIndex(body.indices);
    geometry.computeVertexNormals();
    this.pyraBody = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: "#07070b", roughness: 0.38, metalness: 0.18, side: THREE.FrontSide }),
    );
    this.scene.add(this.pyraBody);
    const groups = new Map<string, THREE.Group>();
    for (const sticker of stickers) {
      let group = groups.get(sticker.piece);
      if (!group) {
        group = new THREE.Group();
        groups.set(sticker.piece, group);
        this.scene.add(group);
        this.cubies.push({ mesh: group, home: new THREE.Vector3(), stickers: [], id: sticker.piece });
      }
      const material = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(triangleGeometry(sticker.verts), material);
      group.add(mesh);
      const drawn: StickerMesh = { mesh, material, normal: new THREE.Vector3(sticker.normal.x, sticker.normal.y, sticker.normal.z), index: sticker.index };
      const cubie = this.cubies.find((item) => item.id === sticker.piece);
      cubie?.stickers.push(drawn);
      this.stickers.push(drawn);
    }
  }

  private tetraFace(index: number): string {
    const stride = this.tetra === 64 ? 16 : 9;
    return ["F", "R", "L", "D"][Math.floor(index / stride)] ?? "F";
  }

  private paintPyra(facelets: string) {
    if (facelets.length !== 36 && facelets.length !== 64) return;
    for (const sticker of this.stickers) {
      const letter = facelets[sticker.index] ?? "";
      const onCurrent = !this.options.paintFace || this.tetraFace(sticker.index) === this.options.paintFace;
      const highlighted = this.highlight.has(sticker.index);
      if (letter === BLANK) {
        sticker.material.color.set(onCurrent ? "#ffffff" : "#5a554c");
        sticker.material.map = this.blankTexture();
        sticker.material.needsUpdate = true;
        continue;
      }
      const name = LETTER_COLOR[letter];
      if (!name) continue;
      const showLetter = this.options.letters || highlighted;
      if (showLetter) {
        sticker.material.color.set(onCurrent ? "#ffffff" : "#6a645c");
        sticker.material.map = this.texture(name, highlighted);
      } else {
        sticker.material.color.set(displaySwatch(name).hex);
        if (!onCurrent) sticker.material.color.multiplyScalar(0.55);
        sticker.material.map = null;
      }
      sticker.material.needsUpdate = true;
    }
  }

  private async animatePyra(move: string, nextFacelets?: string, durationMs?: number): Promise<boolean> {
    const spec = this.tetra === 64 ? masterAnim(move) : pyraAnim(move);
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
    this.scene.add(pivot);
    const moving = new Set(spec.pieces);
    for (const cubie of this.cubies) {
      if (cubie.id && moving.has(cubie.id)) pivot.attach(cubie.mesh);
    }
    const finished = await this.tweenAxis(pivot, new THREE.Vector3(spec.axis.x, spec.axis.y, spec.axis.z), spec.angle, durationMs, token);
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

  private tweenAxis(pivot: THREE.Group, axis: THREE.Vector3, angle: number, durationMs: number | undefined, token: number) {
    const duration = durationMs ?? Math.max(160, this.options.turnMs ?? 750);
    const start = performance.now();
    const turn = new THREE.Quaternion();
    return new Promise<boolean>((resolve) => {
      const step = (now: number) => {
        if (this.generation !== token || this.disposed) {
          resolve(false);
          return;
        }
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        turn.setFromAxisAngle(axis, angle * eased);
        pivot.quaternion.copy(turn);
        this.renderer.render(this.scene, this.camera);
        if (t < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  private buildCubies() {
    const order = this.order;
    if (order === 4) {
      this.buildFourCubies();
      return;
    }
    const k = order === 3 ? 1 : 2;
    const pitch = order === 3 ? THREE_PITCH : FIVE_PITCH;
    const bodySize = order === 3 ? THREE_BODY : FIVE_BODY;
    const stickerSize = order === 3 ? THREE_STICKER : FIVE_STICKER;
    const lift = order === 3 ? THREE_LIFT : FIVE_LIFT;
    for (let x = -k; x <= k; x++) {
      for (let y = -k; y <= k; y++) {
        for (let z = -k; z <= k; z++) {
          if (order === 3 && x === 0 && y === 0 && z === 0) continue;
          if (order === 5 && Math.abs(x) < 2 && Math.abs(y) < 2 && Math.abs(z) < 2) continue;
          const group = new THREE.Group();
          group.position.set(x * pitch, y * pitch, z * pitch);
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(bodySize, bodySize, bodySize),
            new THREE.MeshStandardMaterial({ color: "#07070b", roughness: 0.38, metalness: 0.18 }),
          );
          group.add(body);
          const cubie: Cubie = { mesh: group, home: new THREE.Vector3(x, y, z), stickers: [] };
          for (const normal of normalsFor(x, y, z, k)) {
            const material = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, alphaTest: 0.28 });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(stickerSize, stickerSize), material);
            mesh.position.copy(normal).multiplyScalar(lift);
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

  private buildFourCubies() {
    const layers = [-3, -1, 1, 3];
    for (const x of layers) {
      for (const y of layers) {
        for (const z of layers) {
          if (Math.abs(x) === 1 && Math.abs(y) === 1 && Math.abs(z) === 1) continue;
          const group = new THREE.Group();
          group.position.set(x * FOUR_PITCH, y * FOUR_PITCH, z * FOUR_PITCH);
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(FOUR_BODY, FOUR_BODY, FOUR_BODY),
            new THREE.MeshStandardMaterial({ color: "#07070b", roughness: 0.38, metalness: 0.18 }),
          );
          group.add(body);
          const cubie: Cubie = { mesh: group, home: new THREE.Vector3(x, y, z), stickers: [] };
          for (const normal of fourNormals(x, y, z)) {
            const material = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, alphaTest: 0.28 });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(FOUR_STICKER, FOUR_STICKER), material);
            mesh.position.copy(normal).multiplyScalar(FOUR_LIFT);
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
    if (this.pyra) {
      this.paintPyra(facelets);
      return;
    }
    const order = facelets.length === 150 ? 5 : facelets.length === 96 ? 4 : facelets.length === 54 ? 3 : 0;
    if (!order) return;
    const slots = order === 5 ? FIVE_SLOTS.map((slot) => ({ ...slot, pos: slot.grid })) : order === 4 ? FOUR_SLOTS.map((slot) => ({ ...slot, pos: slot.grid })) : SLOTS;
    for (const slot of slots) {
      const sticker = this.stickerAt(slot.pos, slot.normal);
      if (!sticker) continue;
      sticker.index = slot.index;
      const highlighted = this.highlight.has(slot.index);
      const painting = this.options.paintFace;
      const onCurrent = !painting || slot.face === painting;
      const letter = facelets[slot.index] ?? "";
      if (letter === BLANK) {
        sticker.material.color.set(onCurrent ? "#ffffff" : "#5a554c");
        sticker.material.map = this.blankTexture();
        sticker.material.needsUpdate = true;
        continue;
      }
      const name = LETTER_COLOR[letter];
      if (!name) continue;
      const showLetter = this.options.letters || highlighted;
      if (showLetter) {
        sticker.material.color.set(onCurrent ? "#ffffff" : "#6a645c");
        sticker.material.map = this.texture(name, highlighted);
      } else {
        sticker.material.color.set(displaySwatch(name).hex);
        if (!onCurrent) sticker.material.color.multiplyScalar(0.55);
        sticker.material.map = null;
      }
      sticker.material.needsUpdate = true;
    }
  }

  /** Mid-grey sticker with a dashed rim, so an empty square is not mistaken for white. */
  private blankTexture() {
    if (this.blankMap) return this.blankMap;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, 128, 128);
    traceRound(context, 14, 14, 100, 100, 22);
    context.fillStyle = "rgba(255, 255, 255, 0.05)";
    context.fill();
    context.strokeStyle = "rgba(244, 247, 255, 0.82)";
    context.lineWidth = 5;
    context.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.blankMap = texture;
    return texture;
  }

  private onPalette = () => {
    const stale = [...this.textures.values()];
    this.textures.clear();
    if (this.facelets) this.paint(this.facelets);
    for (const texture of stale) texture.dispose();
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  };

  private texture(color: ColorName, highlighted: boolean) {
    const palette = getPalette();
    const swatch = displaySwatch(color, palette);
    const key = `${palette}-${color}-${highlighted}-${this.options.letters}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, 128, 128);
    traceRound(context, 6, 6, 116, 116, 26);
    context.fillStyle = swatch.hex;
    context.fill();
    context.clip();
    if (highlighted) {
      context.strokeStyle = swatch.ink;
      context.lineWidth = 8;
      context.strokeRect(8, 8, 112, 112);
    }
    context.font = "700 78px Inter, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.lineWidth = 16;
    context.strokeStyle = swatch.halo;
    context.strokeText(STICKER_MARK[color], 64, 70);
    context.lineWidth = 6;
    context.strokeStyle = swatch.ink;
    context.strokeText(STICKER_MARK[color], 64, 70);
    context.fillStyle = swatch.ink;
    context.fillText(STICKER_MARK[color], 64, 70);
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
      if (this.pyra) {
        cubie.mesh.position.set(0, 0, 0);
        cubie.mesh.quaternion.identity();
        cubie.mesh.rotation.set(0, 0, 0);
        cubie.mesh.scale.set(1, 1, 1);
        continue;
      }
      const pitch = this.order === 3 ? THREE_PITCH : this.order === 4 ? FOUR_PITCH : FIVE_PITCH;
      cubie.mesh.position.set(cubie.home.x * pitch, cubie.home.y * pitch, cubie.home.z * pitch);
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
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this.idleStamp || now)) / 1000);
    this.idleStamp = now;
    if (this.options.idle && !this.options.reducedMotion && !this.dragging && !this.animating && !this.options.paintFace) {
      this.theta += dt * 0.18;
      this.updateCamera();
    }
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
    if (this.pyra) {
      if (index === null || this.tetraFace(index) !== this.options.paintFace) return;
      this.options.onPaint?.(index);
      return;
    }
    const stride = this.order === 5 ? 25 : this.order === 4 ? 16 : 9;
    const centre = this.order === 4 ? false : this.order === 5 ? index !== null && index % 25 === 12 : index !== null && isCentre(index);
    if (index === null || centre) return;
    const faceIndex = "URFDLB".indexOf(this.options.paintFace);
    if (Math.floor(index / stride) !== faceIndex) return;
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

  private describeMove(move: string) {
    if (this.order === 4 && parseFourMoveSafe(move)) {
      const parsed = parseFourMove(move);
      const axis: "x" | "y" | "z" = parsed.face === "R" || parsed.face === "L" ? "x" : parsed.face === "U" || parsed.face === "D" ? "y" : "z";
      const sign = parsed.face === "D" || parsed.face === "L" || parsed.face === "B" ? -1 : 1;
      const outer = 3 * sign;
      const inner = sign;
      const layers = parsed.wide ? [outer, inner] : [parsed.depth === 1 ? outer : inner];
      const turns = parsed.quarters === 2 ? 2 : parsed.quarters === 3 ? 3 : 1;
      const base = MOVE_ANGLE[parsed.face];
      if (!base) return null;
      return { axis, layer: (value: number) => layers.includes(value), angle: base.angle * turns };
    }
    if (this.order === 5 && parseFiveMoveSafe(move)) {
      const parsed = parseFiveMove(move);
      const axis: "x" | "y" | "z" = parsed.face === "R" || parsed.face === "L" ? "x" : parsed.face === "U" || parsed.face === "D" ? "y" : "z";
      const sign = parsed.face === "D" || parsed.face === "L" || parsed.face === "B" ? -1 : 1;
      const outer = 2 * sign;
      const inner = sign;
      const layers = parsed.wide ? [outer, inner] : [parsed.depth === 1 ? outer : parsed.depth === 2 ? inner : 0];
      const turns = parsed.quarters === 2 ? 2 : parsed.quarters === 3 ? 3 : 1;
      const base = MOVE_ANGLE[parsed.face];
      if (!base) return null;
      return { axis, layer: (value: number) => layers.includes(value), angle: base.angle * turns };
    }
    return moveSpec(move);
  }
}

function parseFourMoveSafe(move: string): boolean {
  try {
    parseFourMove(move);
    return true;
  } catch {
    return false;
  }
}

function parseFiveMoveSafe(move: string): boolean {
  try {
    parseFiveMove(move);
    return true;
  } catch {
    return false;
  }
}

function traceRound(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function triangleGeometry(verts: [PyraVec, PyraVec, PyraVec]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts.flatMap((point) => [point.x, point.y, point.z]), 3));
  const normal = new THREE.Vector3(verts[1].x - verts[0].x, verts[1].y - verts[0].y, verts[1].z - verts[0].z)
    .cross(new THREE.Vector3(verts[2].x - verts[0].x, verts[2].y - verts[0].y, verts[2].z - verts[0].z))
    .normalize();
  const up = Math.abs(normal.y) > 0.92 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const yAxis = up.clone().addScaledVector(normal, -up.dot(normal)).normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, normal).normalize();
  const center = new THREE.Vector3(
    (verts[0].x + verts[1].x + verts[2].x) / 3,
    (verts[0].y + verts[1].y + verts[2].y) / 3,
    (verts[0].z + verts[1].z + verts[2].z) / 3,
  );
  let reach = 0.001;
  const placed = verts.map((point) => {
    const delta = new THREE.Vector3(point.x, point.y, point.z).sub(center);
    const x = delta.dot(xAxis);
    const y = delta.dot(yAxis);
    reach = Math.max(reach, Math.abs(x), Math.abs(y));
    return { x, y };
  });
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(placed.flatMap((point) => [0.5 + (point.x / reach) * 0.46, 0.5 + (point.y / reach) * 0.46]), 2));
  geometry.computeVertexNormals();
  return geometry;
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

function fourNormals(x: number, y: number, z: number): THREE.Vector3[] {
  const normals: THREE.Vector3[] = [];
  if (x === 3) normals.push(new THREE.Vector3(1, 0, 0));
  if (x === -3) normals.push(new THREE.Vector3(-1, 0, 0));
  if (y === 3) normals.push(new THREE.Vector3(0, 1, 0));
  if (y === -3) normals.push(new THREE.Vector3(0, -1, 0));
  if (z === 3) normals.push(new THREE.Vector3(0, 0, 1));
  if (z === -3) normals.push(new THREE.Vector3(0, 0, -1));
  return normals;
}

function normalsFor(x: number, y: number, z: number, k = 1): THREE.Vector3[] {
  const normals: THREE.Vector3[] = [];
  if (x === k) normals.push(new THREE.Vector3(1, 0, 0));
  if (x === -k) normals.push(new THREE.Vector3(-1, 0, 0));
  if (y === k) normals.push(new THREE.Vector3(0, 1, 0));
  if (y === -k) normals.push(new THREE.Vector3(0, -1, 0));
  if (z === k) normals.push(new THREE.Vector3(0, 0, 1));
  if (z === -k) normals.push(new THREE.Vector3(0, 0, -1));
  return normals;
}

export function faceName(face: Face): string {
  return { U: "Up", D: "Down", F: "Front", B: "Back", R: "Right", L: "Left" }[face];
}

export const FACE_LIST = FACES;
export const FACELET_OFFSET = faceOffset;
