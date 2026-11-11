import * as THREE from "three";
import { cameraDistance, HOME_PHI, HOME_THETA, orbitBy, viewIsShifted } from "../view/camera";
import type { CubeSceneOptions } from "../view/cubeScene";
import { displaySwatch, getPalette, subscribePalette, type LogicalColour } from "../view/palette";
import {
  FACE_NAMES,
  MEGA_COLORS,
  MEGA_FACE_OUTLINE,
  MEGA_NORMALS,
  MEGA_PIECES,
  MEGA_STICKER_MESH,
  parseMegaMove,
  type MegaFace,
} from "./model";

interface StickerMesh {
  mesh: THREE.Mesh;
  letter: THREE.Mesh;
  index: number;
  face: number;
  kind: "center" | "edge" | "corner";
}

interface PieceGroup {
  group: THREE.Group;
  faces: number[];
}

const LETTER = new Map(MEGA_COLORS.map((color) => [color.letter, color]));

/**
 * Dodecahedron view. The public methods match the cube scene so the same
 * playback and paint controls can drive it.
 */
export class MegaminxScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private pieces: PieceGroup[] = [];
  private stickers: StickerMesh[] = [];
  private frame = 0;
  private theta = HOME_THETA;
  private phi = HOME_PHI;
  private radius = 11;
  private dragging = false;
  private pointer = { x: 0, y: 0 };
  private down = { x: 0, y: 0 };
  private viewToken = 0;
  private generation = 0;
  private facelets = "";
  private disposed = false;
  private animating = false;
  private idleStamp = 0;
  private options: CubeSceneOptions;
  private resizeObserver: ResizeObserver;
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private letterMaps = new Map<string, THREE.CanvasTexture>();
  private unsubscribePalette: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement, options: CubeSceneOptions) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    this.scene.add(new THREE.HemisphereLight(0xfff6ea, 0x2a241c, 1.15));
    const key = new THREE.DirectionalLight(0xfff7ee, 1.4);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    this.build();
    this.updateCamera();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    const exposed = this.canvas as HTMLCanvasElement & { __rubicPose?: () => { theta: number; phi: number }; __rubicPick?: (x: number, y: number) => number | null };
    exposed.__rubicPose = () => ({ theta: this.theta, phi: this.phi });
    exposed.__rubicPick = (x, y) => this.pickIndex(x, y);
    this.unsubscribePalette = subscribePalette(this.onPalette);
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
    this.resetPieces();
    this.paint(facelets);
    this.renderer.render(this.scene, this.camera);
  }

  setHighlight() {
    if (this.facelets) this.paint(this.facelets);
  }

  async animateMove(move: string, nextFacelets?: string, durationMs?: number): Promise<boolean> {
    const settle = nextFacelets || this.facelets;
    const token = this.generation;
    let parsed: ReturnType<typeof parseMegaMove> | null = null;
    try {
      parsed = parseMegaMove(move);
    } catch {
      parsed = null;
    }
    if (!parsed || this.options.reducedMotion || !move) {
      if (settle) this.setFacelets(settle);
      return this.generation === token;
    }
    this.animating = true;
    const pivot = new THREE.Group();
    this.scene.add(pivot);
    const moving = this.pieces.filter((piece) => piece.faces.includes(parsed!.face));
    for (const piece of moving) pivot.attach(piece.group);
    const normal = MEGA_NORMALS[parsed.face]!;
    const signed = parsed.steps === 1 ? 1 : parsed.steps === 2 ? 2 : parsed.steps === 3 ? -2 : -1;
    const angle = (signed * 72 * Math.PI) / 180;
    const axis = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
    const duration = durationMs ?? Math.max(160, this.options.turnMs ?? 750);
    const started = performance.now();
    const finished = await new Promise<boolean>((resolve) => {
      const step = (now: number) => {
        if (this.generation !== token || this.disposed) {
          resolve(false);
          return;
        }
        const t = Math.min(1, (now - started) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        pivot.quaternion.setFromAxisAngle(axis, angle * eased);
        this.renderer.render(this.scene, this.camera);
        if (t < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
    this.scene.remove(pivot);
    this.resetPieces();
    if (finished && settle) this.facelets = settle;
    if (this.facelets) this.paint(this.facelets);
    this.animating = false;
    this.renderer.render(this.scene, this.camera);
    return finished && this.generation === token;
  }

  cancelAnimation() {
    this.generation += 1;
    this.animating = false;
    this.resetPieces();
  }

  resetView() {
    this.theta = HOME_THETA;
    this.phi = HOME_PHI;
    this.updateCamera();
    this.options.onViewShift?.(false);
  }

  setPaintFace(face: string | null) {
    this.options = { ...this.options, paintFace: face as CubeSceneOptions["paintFace"] };
    if (this.facelets) this.paint(this.facelets);
  }

  lookAt(theta: number, phi: number, duration = 700): Promise<void> {
    const token = ++this.viewToken;
    const fromTheta = this.theta;
    const fromPhi = this.phi;
    let deltaTheta = theta - fromTheta;
    while (deltaTheta > Math.PI) deltaTheta -= Math.PI * 2;
    while (deltaTheta < -Math.PI) deltaTheta += Math.PI * 2;
    const apply = (amount: number) => {
      this.theta = fromTheta + deltaTheta * amount;
      this.phi = fromPhi + (phi - fromPhi) * amount;
      this.updateCamera();
      this.renderer.render(this.scene, this.camera);
    };
    if (this.options.reducedMotion || duration < 20) {
      apply(1);
      return Promise.resolve();
    }
    const started = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        if (token !== this.viewToken || this.disposed) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - started) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        apply(eased);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
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
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.letterMaps.forEach((texture) => texture.dispose());
    this.renderer.dispose();
  }

  private build() {
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#141820", roughness: 0.45, metalness: 0.12, side: THREE.DoubleSide });
    this.materials.push(bodyMaterial);
    MEGA_FACE_OUTLINE.forEach((outline) => {
      const mesh = new THREE.Mesh(this.polygon(outline.map((point) => ({ x: point.x * 0.985, y: point.y * 0.985, z: point.z * 0.985 }))), bodyMaterial);
      this.scene.add(mesh);
    });
    for (const piece of MEGA_PIECES) {
      const group = new THREE.Group();
      for (const index of piece.stickers) {
        const sticker = MEGA_STICKER_MESH[index]!;
        const material = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, side: THREE.DoubleSide });
        this.materials.push(material);
        const mesh = new THREE.Mesh(this.polygon(sticker.polygon), material);
        mesh.userData.index = index;
        group.add(mesh);
        const size = sticker.kind === "center" ? 0.26 : 0.15;
        const letterMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
        this.materials.push(letterMaterial);
        const plane = new THREE.PlaneGeometry(size, size);
        this.geometries.push(plane);
        const letter = new THREE.Mesh(plane, letterMaterial);
        const lift = 0.02;
        letter.position.set(sticker.centroid.x + sticker.normal.x * lift, sticker.centroid.y + sticker.normal.y * lift, sticker.centroid.z + sticker.normal.z * lift);
        letter.lookAt(letter.position.x + sticker.normal.x, letter.position.y + sticker.normal.y, letter.position.z + sticker.normal.z);
        group.add(letter);
        this.stickers.push({ mesh, letter, index, face: sticker.face, kind: sticker.kind });
      }
      this.pieces.push({ group, faces: [...piece.faces] });
      this.scene.add(group);
    }
  }

  private polygon(points: readonly { x: number; y: number; z: number }[]) {
    const positions: number[] = [];
    const origin = points[0]!;
    for (let i = 1; i < points.length - 1; i += 1) {
      const next = points[i]!;
      const last = points[i + 1]!;
      positions.push(origin.x, origin.y, origin.z, next.x, next.y, next.z, last.x, last.y, last.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    this.geometries.push(geometry);
    return geometry;
  }

  private paint(facelets: string) {
    const painting = this.options.paintFace;
    const paintIndex = painting ? FACE_NAMES.indexOf(painting as MegaFace) : -1;
    for (const sticker of this.stickers) {
      const letter = facelets[sticker.index] ?? ".";
      const material = sticker.mesh.material as THREE.MeshBasicMaterial;
      const colour = LETTER.get(letter);
      const dim = paintIndex >= 0 && sticker.face !== paintIndex;
      const glyph = sticker.letter.material as THREE.MeshBasicMaterial;
      if (!colour) {
        material.color.set(dim ? "#6a645c" : "#d7d1c6");
        sticker.letter.visible = false;
      } else {
        material.color.set(displaySwatch(colour.id as LogicalColour).hex);
        if (dim) material.color.multiplyScalar(0.55);
        sticker.letter.visible = this.options.letters;
        glyph.map = this.letterTexture(colour.id);
        glyph.needsUpdate = true;
      }
      material.map = null;
      material.needsUpdate = true;
    }
  }

  private onPalette = () => {
    this.letterMaps.forEach((texture) => texture.dispose());
    this.letterMaps.clear();
    if (this.facelets) this.paint(this.facelets);
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  };

  private letterTexture(id: string) {
    const key = `${getPalette()}:${id}`;
    const cached = this.letterMaps.get(key);
    if (cached) return cached;
    const colour = MEGA_COLORS.find((item) => item.id === id);
    if (!colour) return null;
    const swatch = displaySwatch(colour.id as LogicalColour);
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, 128, 128);
    context.font = "700 78px Inter, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 10;
    context.strokeStyle = swatch.halo;
    context.strokeText(colour.mark, 64, 68);
    context.fillStyle = swatch.ink;
    context.fillText(colour.mark, 64, 68);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.letterMaps.set(key, texture);
    return texture;
  }

  private resetPieces() {
    for (const piece of this.pieces) {
      this.scene.attach(piece.group);
      piece.group.quaternion.identity();
      piece.group.position.set(0, 0, 0);
      piece.group.rotation.set(0, 0, 0);
    }
  }

  private resize = () => {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth ?? 320;
    const height = parent?.clientHeight ?? 320;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.radius = cameraDistance(this.camera.aspect || 1);
    this.camera.updateProjectionMatrix();
    this.updateCamera();
  };

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

  private onDown = (event: PointerEvent) => {
    if (this.animating || this.options.gesture === "off") return;
    this.viewToken += 1;
    this.dragging = true;
    this.down = { x: event.clientX, y: event.clientY };
    this.pointer = { x: event.clientX, y: event.clientY };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Test events have no pointer to capture.
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
    if (index === null || index % 11 === 0) return;
    const face = FACE_NAMES.indexOf(this.options.paintFace as MegaFace);
    if (Math.floor(index / 11) !== face) return;
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
    const index = (hit.object.userData as { index?: number }).index;
    return typeof index === "number" ? index : null;
  }

  private onCancel = () => {
    this.dragging = false;
  };
}
