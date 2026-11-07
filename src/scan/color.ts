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

export function nameFromCanonical(lab: Lab): { name: ColorName; confidence: number } {
  const ranked = COLORS.map((name) => ({
    name,
    distance: labDistance(lab, rgbToLab(...CANONICAL_RGB[name])),
  })).sort((a, b) => a.distance - b.distance);
  const best = ranked[0]!;
  const second = ranked[1]!;
  const confidence = second.distance <= 0.0001 ? 0 : (second.distance - best.distance) / second.distance;
  return { name: best.name, confidence };
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

export function rotateNine<T>(cells: T[], quarters: number): T[] {
  const turns = ((quarters % 4) + 4) % 4;
  const ring = [0, 1, 2, 5, 8, 7, 6, 3];
  const next = cells.slice();
  for (let i = 0; i < 8; i++) {
    next[ring[(i + turns * 2) % 8]!] = cells[ring[i]!]!;
  }
  return next;
}
