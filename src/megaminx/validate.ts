import {
  FACE_NAMES,
  MEGA_COLORS,
  MEGA_CORNERS,
  MEGA_EDGES,
  MEGA_OPPOSITE,
  MEGA_STICKERS,
  STICKERS_PER_FACE,
  megaFromString,
  readPieces,
} from "./model";

export interface MegaIssue {
  code: string;
  message: string;
}

export interface MegaValidation {
  ok: boolean;
  issues: MegaIssue[];
}

const LETTERS = MEGA_COLORS.map((color) => color.letter).join("");

export function validateMega(text: string): MegaValidation {
  if (text.length !== MEGA_STICKERS || [...text].some((letter) => !LETTERS.includes(letter))) {
    return fail("length", "Enter all 132 stickers. Each one needs a colour from the twelve-colour palette.");
  }
  let state: Uint8Array;
  try {
    state = megaFromString(text);
  } catch (error) {
    return fail("length", error instanceof Error ? error.message : "This colouring is not a megaminx.");
  }
  const issues: MegaIssue[] = [];
  const counts = new Array(12).fill(0);
  for (let i = 0; i < MEGA_STICKERS; i += 1) counts[state[i]!]! += 1;
  if (counts.some((count) => count !== 11)) {
    const detail = MEGA_COLORS.map((color, index) => `${counts[index]} ${color.name}`).join(", ");
    issues.push({ code: "counts", message: `A megaminx has 11 stickers of each colour. This one has ${detail}.` });
  }
  for (let face = 0; face < 12; face += 1) {
    if (state[face * STICKERS_PER_FACE] !== face) {
      issues.push({
        code: "centres",
        message: `The ${FACE_NAMES[face]} centre should be ${MEGA_COLORS[face]!.name}. Centres name the faces, so fix those before the other stickers.`,
      });
      break;
    }
  }
  for (let face = 0; face < 12; face += 1) {
    const opposite = MEGA_OPPOSITE[face]!;
    if (state[opposite * STICKERS_PER_FACE] !== opposite) continue;
    if (MEGA_OPPOSITE[state[face * STICKERS_PER_FACE]!] !== state[opposite * STICKERS_PER_FACE]) {
      issues.push({
        code: "opposites",
        message: "Opposite centres must be white opposite grey, red opposite orange, green opposite lime, yellow opposite cream, purple opposite pink, and blue opposite sky.",
      });
      break;
    }
  }
  if (issues.length) return { ok: false, issues };

  const pieces = readPieces(state);
  if (pieces.edgePiece.includes(255) || pieces.cornerPiece.includes(255)) {
    issues.push({
      code: "pieces",
      message: "Some stickers do not form a real edge or corner of this colour scheme. A sticker was given a colour that piece does not have.",
    });
  }
  if (pieces.cornerOri.includes(255)) {
    issues.push({
      code: "mirror",
      message: "A corner's three colours are in a mirrored order. A normal megaminx cannot twist a corner that way.",
    });
  }
  if (new Set(pieces.edgePiece.filter((piece) => piece !== 255)).size !== 30 || new Set(pieces.cornerPiece.filter((piece) => piece !== 255)).size !== 20) {
    issues.push({
      code: "duplicates",
      message: "A piece appears more than once, so another piece is missing. Check those colours.",
    });
  }
  if (issues.length) return { ok: false, issues };

  const edgeSum = pieces.edgeOri.reduce((sum, value) => sum + value, 0);
  const cornerSum = pieces.cornerOri.reduce((sum, value) => sum + value, 0);
  if (edgeSum % 2 !== 0) {
    issues.push({
      code: "edge-flip",
      message: "The edges are flipped in a way a normal megaminx cannot reach. It would take a single flipped edge, or another odd flip.",
    });
  }
  if (cornerSum % 3 !== 0) {
    issues.push({
      code: "corner-twist",
      message: "A corner is twisted in a way a normal megaminx cannot reach. The twists on a solvable megaminx add up to a multiple of three.",
    });
  }
  if (parity(pieces.edgePiece) !== 0 || parity(pieces.cornerPiece) !== 0) {
    issues.push({
      code: "parity",
      message: "The pieces would need an odd swap, and a normal megaminx cannot do that. Two edges are exchanged, or two corners are.",
    });
  }
  if (MEGA_EDGES.length !== 30 || MEGA_CORNERS.length !== 20) {
    issues.push({ code: "pieces", message: "The megaminx model is incomplete." });
  }
  return { ok: issues.length === 0, issues };
}

function parity(perm: Uint8Array): number {
  const seen = new Uint8Array(perm.length);
  let sign = 0;
  for (let i = 0; i < perm.length; i += 1) {
    if (seen[i]) continue;
    let length = 0;
    let cursor = i;
    while (!seen[cursor]) {
      seen[cursor] = 1;
      cursor = perm[cursor]!;
      length += 1;
    }
    if (length % 2 === 0) sign ^= 1;
  }
  return sign;
}

function fail(code: string, message: string): MegaValidation {
  return { ok: false, issues: [{ code, message }] };
}
