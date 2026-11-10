/**
 * Independent 5×5 sticker simulator.
 *
 * Stickers are tracked as coordinates and rotated with a small matrix
 * written for the tests. It does not use the solver's permutation tables.
 */

export interface SimSticker {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  color: string;
}

const FACES = ["U", "R", "F", "D", "L", "B"] as const;

function grid(face: string, row: number, col: number): [number, number, number, number, number, number] {
  const k = 2;
  switch (face) {
    case "U":
      return [col - k, k, row - k, 0, 1, 0];
    case "D":
      return [col - k, -k, k - row, 0, -1, 0];
    case "F":
      return [col - k, k - row, k, 0, 0, 1];
    case "B":
      return [k - col, k - row, -k, 0, 0, -1];
    case "R":
      return [k, k - row, k - col, 1, 0, 0];
    default:
      return [-k, k - row, col - k, -1, 0, 0];
  }
}

export function solvedSim(): SimSticker[] {
  const colors = ["y", "o", "g", "w", "r", "b"];
  const stickers: SimSticker[] = [];
  FACES.forEach((face, faceIndex) => {
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const [x, y, z, nx, ny, nz] = grid(face, row, col);
        stickers.push({ x, y, z, nx, ny, nz, color: colors[faceIndex]! });
      }
    }
  });
  return stickers;
}

function rotate(x: number, y: number, z: number, face: string): [number, number, number] {
  switch (face) {
    case "U":
      return [-z, y, x];
    case "D":
      return [z, y, -x];
    case "R":
      return [x, z, -y];
    case "L":
      return [x, -z, y];
    case "F":
      return [y, -x, z];
    default:
      return [-y, x, z];
  }
}

function layer(face: string, depth: 1 | 2 | 3): number {
  if (depth === 3) return 0;
  const sign = face === "D" || face === "L" || face === "B" ? -1 : 1;
  return sign * (depth === 1 ? 2 : 1);
}

function axis(face: string): "x" | "y" | "z" {
  if (face === "R" || face === "L") return "x";
  if (face === "U" || face === "D") return "y";
  return "z";
}

export function parseSimMove(move: string): { face: string; depth: 1 | 2 | 3; wide: boolean; quarters: number } {
  let rest = move;
  let depth: 1 | 2 | 3 = 1;
  if (/^[23][URFDLB]/.test(rest)) {
    depth = rest[0] === "3" ? 3 : 2;
    rest = rest.slice(1);
  }
  const face = rest[0] ?? "";
  rest = rest.slice(1);
  const wide = rest.startsWith("w");
  if (wide) rest = rest.slice(1);
  const quarters = rest === "" ? 1 : rest === "'" ? 3 : 2;
  return { face, depth, wide, quarters };
}

function affected(sticker: SimSticker, move: ReturnType<typeof parseSimMove>): boolean {
  const value = sticker[axis(move.face)];
  if (move.wide) return value === layer(move.face, 1) || value === layer(move.face, 2);
  return value === layer(move.face, move.depth);
}

export function applySim(stickers: SimSticker[], moves: readonly string[]): SimSticker[] {
  let current = stickers;
  for (const text of moves) {
    const move = parseSimMove(text);
    current = current.map((sticker) => {
      if (!affected(sticker, move)) return sticker;
      let x = sticker.x;
      let y = sticker.y;
      let z = sticker.z;
      let nx = sticker.nx;
      let ny = sticker.ny;
      let nz = sticker.nz;
      for (let turnIndex = 0; turnIndex < move.quarters; turnIndex += 1) {
        [x, y, z] = rotate(x, y, z, move.face);
        [nx, ny, nz] = rotate(nx, ny, nz, move.face);
      }
      return { ...sticker, x, y, z, nx, ny, nz };
    });
  }
  return current;
}

export function simString(stickers: SimSticker[]): string {
  const byKey = new Map(stickers.map((sticker) => [`${sticker.x},${sticker.y},${sticker.z}|${sticker.nx},${sticker.ny},${sticker.nz}`, sticker.color]));
  let text = "";
  for (const face of FACES) {
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const [x, y, z, nx, ny, nz] = grid(face, row, col);
        text += byKey.get(`${x},${y},${z}|${nx},${ny},${nz}`) ?? "?";
      }
    }
  }
  return text;
}
