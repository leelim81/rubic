import { mkdirSync, writeFileSync } from "node:fs";
import { applyMoves, solvedBytes } from "../src/cube/model";
import { photographCube } from "../src/scan/mapping";
import { paintInsetFace, paintSyntheticFace, type ColorName } from "../src/scan/color";
import { encodePng } from "../e2e/png";

const photos = photographCube(applyMoves(solvedBytes(), ["R", "U", "R'", "U'"]));
const order = ["F", "R", "B", "L", "U", "D"] as const;
const options = {
  F: { tint: [1.12, 0.92, 0.75] as [number, number, number], gradient: 0.18, noise: 6, seed: 3 },
  R: { tint: [0.82, 0.84, 0.95] as [number, number, number], gradient: 0.08, noise: 5, seed: 4 },
  B: { tint: [0.9, 1.02, 1.18] as [number, number, number], gradient: 0.12, noise: 4, seed: 5 },
  L: { tint: [1, 1, 1] as [number, number, number], gradient: 0.05, noise: 8, seed: 6 },
  U: { tint: [1.08, 1.05, 0.92] as [number, number, number], gradient: 0.22, noise: 3, seed: 7 },
  D: { tint: [0.95, 0.88, 0.8] as [number, number, number], gradient: 0.35, noise: 7, seed: 8 },
};
const names = { F: "01-front.png", R: "02-right.png", B: "03-back.png", L: "04-left.png", U: "05-top.png", D: "06-bottom.png" };
mkdirSync("public/fixtures", { recursive: true });
for (const face of order) {
  const raster = paintSyntheticFace(photos[face] as ColorName[], { size: 360, marginRatio: 0.12, ...options[face] });
  writeFileSync(`public/fixtures/${names[face]}`, encodePng(raster));
}
const inset = paintInsetFace(photos.F as ColorName[], 480, 360, { x: 150, y: 70, width: 180, height: 170 }, [48, 24, 78]);
writeFileSync("public/fixtures/07-front-inset.png", encodePng(inset));
console.log("wrote fixtures");
