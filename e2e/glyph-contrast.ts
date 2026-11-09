import type { Page } from "@playwright/test";
import type { Face, Vec } from "../src/cube/model";
import { projectToScreen } from "../src/view/camera";
import { contrastOfLuminance } from "../src/view/contrast";
import { facePose, stickerPoint } from "../src/view/paint";

const NORMAL: Record<Face, Vec> = {
  U: { x: 0, y: 1, z: 0 },
  D: { x: 0, y: -1, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  B: { x: 0, y: 0, z: -1 },
  R: { x: 1, y: 0, z: 0 },
  L: { x: -1, y: 0, z: 0 },
};

function tangents(normal: Vec): [Vec, Vec] {
  if (Math.abs(normal.y) > 0.5) return [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }];
  if (Math.abs(normal.x) > 0.5) return [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }];
  return [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }];
}

/** Contrast of the centre letter against its sticker, measured from the rendered canvas. */
export async function centreGlyphContrast(page: Page, face: Face): Promise<number> {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The cube is not on screen.");
  const pose = facePose(face);
  const centre = stickerPoint(face, 1, 1);
  const normal = NORMAL[face];
  const [across, up] = tangents(normal);
  const half = 0.3;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
    const point = {
      x: centre.x + (across.x * x + up.x * y) * half,
      y: centre.y + (across.y * x + up.y * y) * half,
      z: centre.z + (across.z * x + up.z * y) * half,
    };
    return projectToScreen(point, box.width, box.height, pose.theta, pose.phi);
  });
  const samples = await canvas.evaluate((el, query) => {
    const gl = el.getContext("webgl2") ?? el.getContext("webgl");
    if (!gl) return [];
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const scaleX = width / el.clientWidth;
    const scaleY = height / el.clientHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const screen = query.corners.map((corner) => ({ x: corner.x * scaleX, y: height - corner.y * scaleY }));
    const minX = Math.max(0, Math.floor(Math.min(...screen.map((corner) => corner.x))));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(...screen.map((corner) => corner.x))));
    const minY = Math.max(0, Math.floor(Math.min(...screen.map((corner) => corner.y))));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...screen.map((corner) => corner.y))));
    const found: number[] = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!inside(x + 0.5, y + 0.5, screen)) continue;
        const index = (y * width + x) * 4;
        const red = pixels[index] ?? 0;
        const green = pixels[index + 1] ?? 0;
        const blue = pixels[index + 2] ?? 0;
        const alpha = pixels[index + 3] ?? 0;
        if (alpha < 200) continue;
        found.push(luminance(red, green, blue));
      }
    }
    return found;

    function inside(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
      let sign = 0;
      for (let index = 0; index < polygon.length; index += 1) {
        const start = polygon[index]!;
        const end = polygon[(index + 1) % polygon.length]!;
        const cross = (end.x - start.x) * (y - start.y) - (end.y - start.y) * (x - start.x);
        if (Math.abs(cross) < 0.5) continue;
        const next = Math.sign(cross);
        if (sign === 0) sign = next;
        else if (next !== sign) return false;
      }
      return true;
    }

    function linear(value: number): number {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }

    function luminance(red: number, green: number, blue: number): number {
      return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    }
  }, { corners });
  if (samples.length < 40) throw new Error(`Only ${samples.length} pixels on the ${face} centre.`);
  const sorted = [...samples].sort((left, right) => left - right);
  const dark = sorted[Math.floor(sorted.length * 0.04)]!;
  const light = sorted[Math.floor(sorted.length * 0.96)]!;
  return contrastOfLuminance(light, dark);
}
