import { COLORS, type ColorName } from "../cube/model";

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export interface SampledPatch {
  lab: Lab;
  rgb: [number, number, number];
}

/** Fraction of the photo left as border around the face. The scanner samples this same rectangle. */
export const FACE_SAMPLE_MARGIN = 0.12;

/** Canonical sticker colours used only to name a centre, not to classify the other stickers. */
export const CANONICAL_RGB: Record<ColorName, [number, number, number]> = {
  white: [242, 242, 242],
  yellow: [247, 212, 0],
  red: [196, 30, 58],
  orange: [255, 107, 0],
  blue: [0, 81, 186],
  green: [0, 158, 96],
};

export function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

/** Lightness is down-weighted so a warm lamp does not rename a sticker. */
export function labDistance(left: Lab, right: Lab): number {
  const dL = (left.L - right.L) * 0.28;
  const da = left.a - right.a;
  const db = left.b - right.b;
  return Math.hypot(dL, da, db);
}

export function nameFromCanonical(lab: Lab): { name: ColorName; confidence: number; distance: number } {
  const ranked = COLORS.map((name) => ({
    name,
    distance: labDistance(lab, rgbToLab(...CANONICAL_RGB[name])),
  })).sort((a, b) => a.distance - b.distance);
  const best = ranked[0]!;
  const second = ranked[1]!;
  const confidence = second.distance <= 0.0001 ? 0 : (second.distance - best.distance) / second.distance;
  return { name: best.name, confidence, distance: best.distance };
}

/** Weighted distance used while comparing sticker hues. */
export const CANONICAL_DISTANCE_LIMIT = 0.45;

/** Full OKLab distance. A dark background can mimic a hue once lightness is ignored. */
export const FULL_DISTANCE_LIMIT = 0.22;

export function fullLabDistance(left: Lab, right: Lab): number {
  return Math.hypot(left.L - right.L, left.a - right.a, left.b - right.b);
}

export interface ClassifiedSticker {
  name: ColorName;
  confidence: number;
  uncertain: boolean;
}

export function classifyAgainstCentres(
  lab: Lab,
  centres: Lab[],
): ClassifiedSticker {
  const ranked = centres
    .map((centre, index) => ({ index, distance: labDistance(lab, centre) }))
    .sort((a, b) => a.distance - b.distance);
  const best = ranked[0]!;
  const second = ranked[1] ?? best;
  const gap = second.distance <= 0.0001 ? 0 : (second.distance - best.distance) / second.distance;
  const uncertain = gap < 0.18 || best.distance > 0.22;
  const named = nameFromCanonical(centres[best.index]!);
  return { name: named.name, confidence: Math.min(gap, named.confidence), uncertain: uncertain || named.confidence < 0.12 };
}

export function medianChannel(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Sample nine sticker patches inside a face rectangle. The rectangle is in pixels. */
export function sampleFaceGrid(raster: Raster, rect: { x: number; y: number; width: number; height: number }): SampledPatch[] {
  const patches: SampledPatch[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellX = rect.x + (col * rect.width) / 3;
      const cellY = rect.y + (row * rect.height) / 3;
      const cellW = rect.width / 3;
      const cellH = rect.height / 3;
      const insetX = cellX + cellW * 0.28;
      const insetY = cellY + cellH * 0.28;
      const insetW = cellW * 0.44;
      const insetH = cellH * 0.44;
      const reds: number[] = [];
      const greens: number[] = [];
      const blues: number[] = [];
      const x0 = Math.max(0, Math.floor(insetX));
      const y0 = Math.max(0, Math.floor(insetY));
      const x1 = Math.min(raster.width, Math.ceil(insetX + insetW));
      const y1 = Math.min(raster.height, Math.ceil(insetY + insetH));
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const offset = (y * raster.width + x) * 4;
          reds.push(raster.data[offset] ?? 0);
          greens.push(raster.data[offset + 1] ?? 0);
          blues.push(raster.data[offset + 2] ?? 0);
        }
      }
      const rgb: [number, number, number] = [medianChannel(reds), medianChannel(greens), medianChannel(blues)];
      patches.push({ rgb, lab: rgbToLab(...rgb) });
    }
  }
  return patches;
}

export function paintSyntheticFace(
  colours: ColorName[],
  options?: { tint?: [number, number, number]; gradient?: number; noise?: number; seed?: number; size?: number; marginRatio?: number },
): Raster {
  const size = options?.size ?? 180;
  const tint = options?.tint ?? [1, 1, 1];
  const gradient = options?.gradient ?? 0;
  const noise = options?.noise ?? 0;
  const seed = options?.seed ?? 1;
  const marginRatio = options?.marginRatio ?? FACE_SAMPLE_MARGIN;
  const data = new Uint8ClampedArray(size * size * 4);
  let noiseState = seed >>> 0;
  const rand = () => {
    noiseState = (Math.imul(1664525, noiseState) + 1013904223) >>> 0;
    return noiseState / 4294967296;
  };
  const margin = Math.round(size * marginRatio);
  const span = size - margin * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      data[offset + 3] = 255;
      if (x < margin || y < margin || x >= size - margin || y >= size - margin) {
        data[offset] = 18;
        data[offset + 1] = 16;
        data[offset + 2] = 14;
        continue;
      }
      const col = Math.min(2, Math.floor(((x - margin) / span) * 3));
      const row = Math.min(2, Math.floor(((y - margin) / span) * 3));
      const colour = colours[row * 3 + col] ?? "white";
      const [r, g, b] = CANONICAL_RGB[colour];
      const shade = 1 - gradient * (x / size - 0.5);
      const n = noise ? (rand() - 0.5) * noise : 0;
      data[offset] = clamp(r * tint[0] * shade + n);
      data[offset + 1] = clamp(g * tint[1] * shade + n);
      data[offset + 2] = clamp(b * tint[2] * shade + n);
    }
  }
  return { data, width: size, height: size };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export interface NormPoint {
  x: number;
  y: number;
}

/** Default crop matches the border left around a face that fills the photo. */
export function defaultFaceCrop(): [NormPoint, NormPoint, NormPoint, NormPoint] {
  const margin = FACE_SAMPLE_MARGIN;
  return [
    { x: margin, y: margin },
    { x: 1 - margin, y: margin },
    { x: 1 - margin, y: 1 - margin },
    { x: margin, y: 1 - margin },
  ];
}

/** Straighten a quadrilateral (top-left, top-right, bottom-right, bottom-left) into a square. */
export function warpQuad(source: Raster, corners: [NormPoint, NormPoint, NormPoint, NormPoint], size = 180): Raster {
  const pixels = corners.map((corner) => ({ x: corner.x * source.width, y: corner.y * source.height })) as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const point = bilinear(pixels, u, v);
      const rgb = sampleBilinear(source, point.x, point.y);
      const offset = (y * size + x) * 4;
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      data[offset + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

/** Paint a face into an axis-aligned rectangle on a flat background. Coordinates are pixels. */
export function paintInsetFace(
  colours: ColorName[],
  width: number,
  height: number,
  rect: { x: number; y: number; width: number; height: number },
  background: [number, number, number],
): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data[offset + 3] = 255;
      const inside = x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
      if (!inside) {
        data[offset] = background[0];
        data[offset + 1] = background[1];
        data[offset + 2] = background[2];
        continue;
      }
      const col = Math.min(2, Math.floor(((x - rect.x) / rect.width) * 3));
      const row = Math.min(2, Math.floor(((y - rect.y) / rect.height) * 3));
      const [r, g, b] = CANONICAL_RGB[colours[row * 3 + col] ?? "white"];
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
    }
  }
  return { data, width, height };
}

function bilinear(
  corners: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
  u: number,
  v: number,
): { x: number; y: number } {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const top = { x: topLeft.x + (topRight.x - topLeft.x) * u, y: topLeft.y + (topRight.y - topLeft.y) * u };
  const bottom = { x: bottomLeft.x + (bottomRight.x - bottomLeft.x) * u, y: bottomLeft.y + (bottomRight.y - bottomLeft.y) * u };
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
}

function sampleBilinear(raster: Raster, x: number, y: number): [number, number, number] {
  const x0 = Math.max(0, Math.min(raster.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(raster.height - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(raster.width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(raster.height - 1, y0 + 1));
  const tx = Math.max(0, Math.min(1, x - x0));
  const ty = Math.max(0, Math.min(1, y - y0));
  const sample = (px: number, py: number) => {
    const offset = (py * raster.width + px) * 4;
    return [raster.data[offset] ?? 0, raster.data[offset + 1] ?? 0, raster.data[offset + 2] ?? 0] as [number, number, number];
  };
  const a = sample(x0, y0);
  const b = sample(x1, y0);
  const c = sample(x0, y1);
  const d = sample(x1, y1);
  return [0, 1, 2].map((channel) => {
    const top = a[channel]! * (1 - tx) + b[channel]! * tx;
    const bottom = c[channel]! * (1 - tx) + d[channel]! * tx;
    return Math.round(top * (1 - ty) + bottom * ty);
  }) as [number, number, number];
}

export function rotateNine<T>(cells: T[], quarters: number): T[] {
  const turns = ((quarters % 4) + 4) % 4;
  const ring = [0, 1, 2, 5, 8, 7, 6, 3];
  const next = cells.slice();
  for (let i = 0; i < 8; i++) {
    next[ring[(i + turns * 2) % 8]!] = cells[ring[i]!]!;
  }
  return next;
}
