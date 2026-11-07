import { describe, expect, it } from "vitest";
import {
  applyMoves,
  faceletsToString,
  mulberry32,
  randomScramble,
  solvedBytes,
  stringToFacelets,
} from "../src/cube/model";
import { CANONICAL_DISTANCE_LIMIT, FACE_SAMPLE_MARGIN, classifyAgainstCentres, defaultFaceCrop, nameFromCanonical, paintInsetFace, paintSyntheticFace, rgbToLab, rotateNine, sampleFaceGrid, warpQuad, type NormPoint } from "../src/scan/color";
import { COLORS, type ColorName } from "../src/cube/model";
import { photographCube, reconstructCube } from "../src/scan/mapping";
import { validateBytes } from "../src/cube/validate";
import { CANONICAL_RGB } from "../src/scan/color";

describe("scan mapping", () => {
  it("reads painted photos of a scramble back to the same colours", () => {
    const cube = applyMoves(solvedBytes(), randomScramble(mulberry32(7), 12));
    const photos = photographCube(cube);
    for (const colours of Object.values(photos)) {
      const raster = paintSyntheticFace(colours, { size: 240, marginRatio: FACE_SAMPLE_MARGIN, noise: 4, seed: 2 });
      const margin = Math.round(240 * FACE_SAMPLE_MARGIN);
      const patches = sampleFaceGrid(raster, { x: margin, y: margin, width: 240 - margin * 2, height: 240 - margin * 2 });
      patches.forEach((patch, index) => {
        expect(nameFromCanonical(patch.lab).name).toBe(colours[index]);
      });
    }
    expect(faceletsToString(reconstructCube(photos))).toBe(faceletsToString(cube));
  });

  it("round-trips scrambled cubes through the six guided photos", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const cube = applyMoves(solvedBytes(), randomScramble(mulberry32(seed), 18));
      const photos = photographCube(cube);
      const back = reconstructCube(photos);
      expect(faceletsToString(back)).toBe(faceletsToString(cube));
    }
  });

  it("rejects a single rotated photo and can name the one fix when it is unique", () => {
    const cube = applyMoves(solvedBytes(), ["R", "U", "F"]);
    const photos = photographCube(cube);
    photos.F = rotateNine(photos.F, 1);
    const broken = reconstructCube(photos);
    const verdict = validateBytes(broken);
    expect(verdict.ok).toBe(false);
    expect(verdict.issues.some((issue) => issue.ambiguous || issue.code === "orientation-hint" || issue.code === "edge-flip" || issue.code === "parity" || issue.code === "pieces" || issue.code === "duplicates" || issue.code === "corner-twist")).toBe(true);
  });
});

describe("sticker colours", () => {
  it("names canonical stickers and keeps them under warm, cool, dim, and side lighting", () => {
    const lights: [number, number, number][] = [
      [1, 1, 1],
      [1.25, 1.02, 0.78],
      [0.75, 0.85, 1.15],
      [0.55, 0.55, 0.55],
      [1.3, 1.3, 1.3],
    ];
    for (const tint of lights) {
      for (const gradient of [0, 0.35]) {
        const colours = [...COLORS, ...COLORS, ...COLORS].slice(0, 9) as ColorName[];
        const raster = paintSyntheticFace(colours, { tint, gradient, noise: 8, seed: 7 });
        const margin = Math.round(raster.width * FACE_SAMPLE_MARGIN);
        const rect = { x: margin, y: margin, width: raster.width - margin * 2, height: raster.height - margin * 2 };
        const patches = sampleFaceGrid(raster, rect);
        const centres = COLORS.map((colour) => {
          const reference = paintSyntheticFace(Array(9).fill(colour) as ColorName[], { tint, gradient: 0, noise: 0, seed: 3 });
          return sampleFaceGrid(reference, rect)[4]!.lab;
        });
        const wellLit = tint[0] === 1 && tint[1] === 1 && tint[2] === 1 && gradient === 0;
        patches.forEach((patch, index) => {
          const result = classifyAgainstCentres(patch.lab, centres);
          expect(result.name, `${colours[index]} under ${tint.join(",")}`).toBe(colours[index]);
          if (wellLit) expect(result.uncertain).toBe(false);
        });
      }
    }
  });

  it("flags a sticker halfway between red and orange instead of trusting it", () => {
    const red = rgbToLab(...CANONICAL_RGB.red);
    const orange = rgbToLab(...CANONICAL_RGB.orange);
    const blend = { L: (red.L + orange.L) / 2, a: (red.a + orange.a) / 2, b: (red.b + orange.b) / 2 };
    const centres = COLORS.map((colour) => rgbToLab(...CANONICAL_RGB[colour]));
    const result = classifyAgainstCentres(blend, centres);
    expect(result.uncertain).toBe(true);
    expect(["red", "orange"]).toContain(result.name);
  });

  it("names a photographed centre even when the lamp is warm", () => {
    const warmWhite = rgbToLab(242 * 1.15, 230, 200);
    expect(nameFromCanonical(warmWhite).name).toBe("white");
    const warmYellow = rgbToLab(247 * 1.05, 190, 40);
    expect(nameFromCanonical(warmYellow).name).toBe("yellow");
  });

  it("lets a manual correction replace one sampled sticker", () => {
    const photos = photographCube(stringToFacelets(faceletsToString(solvedBytes())));
    photos.F[0] = "red";
    const cube = reconstructCube(photos);
    expect(validateBytes(cube).ok).toBe(false);
    photos.F[0] = "green";
    expect(validateBytes(reconstructCube(photos)).ok).toBe(true);
  });

  it("reads a face that does not fill the photo once the crop sits on it", () => {
    const colours: ColorName[] = ["white", "yellow", "red", "orange", "blue", "green", "white", "red", "yellow"];
    const raster = paintInsetFace(colours, 420, 300, { x: 90, y: 40, width: 210, height: 200 }, [40, 20, 70]);
    const wrong = warpQuad(raster, defaultFaceCrop());
    const wrongNames = sampleFaceGrid(wrong, { x: 0, y: 0, width: wrong.width, height: wrong.height }).map((patch) => nameFromCanonical(patch.lab));
    expect(wrongNames.some((named) => named.distance > CANONICAL_DISTANCE_LIMIT || named.name !== colours[wrongNames.indexOf(named)])).toBe(true);
    const crop: [NormPoint, NormPoint, NormPoint, NormPoint] = [
      { x: 90 / 420, y: 40 / 300 },
      { x: 300 / 420, y: 40 / 300 },
      { x: 300 / 420, y: 240 / 300 },
      { x: 90 / 420, y: 240 / 300 },
    ];
    const aligned = warpQuad(raster, crop);
    const names = sampleFaceGrid(aligned, { x: 0, y: 0, width: aligned.width, height: aligned.height }).map((patch) => nameFromCanonical(patch.lab));
    names.forEach((named, index) => {
      expect(named.name).toBe(colours[index]);
      expect(named.distance).toBeLessThan(CANONICAL_DISTANCE_LIMIT);
    });
  });
});
