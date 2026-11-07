import {
  COLORS,
  FACES,
  OPPOSITE_COLOR,
  OPPOSITE_FACE,
  type ColorName,
  type Face,
  applyMoves,
  centerColor,
  copyBytes,
  centersAreHome,
  faceletsToString,
  permutationParity,
  readCubies,
  rotationToHome,
  rotateFaceRing,
  stringToFacelets,
} from "./model";

export interface ValidationIssue {
  code: string;
  message: string;
  /** True when several faces could explain the problem. */
  ambiguous: boolean;
  pieces: string[];
}

export interface OrientationFix {
  /** Quarter-turns clockwise of each photographed face. */
  quarters: Record<Face, number>;
  summary: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  fixes: OrientationFix[];
  normalized: string | null;
}

const COLOR_NAME: Record<ColorName, string> = {
  white: "white",
  yellow: "yellow",
  red: "red",
  orange: "orange",
  blue: "blue",
  green: "green",
};

export function validateFaceletString(value: string, options?: { searchRotations?: boolean }): ValidationResult {
  if (value.length !== 54 || [...value].some((letter) => !"wyrogb".includes(letter))) {
    return {
      ok: false,
      issues: [
        {
          code: "length",
          message: "Enter all 54 stickers. Each one needs a colour from the six-colour palette.",
          ambiguous: false,
          pieces: [],
        },
      ],
      fixes: [],
      normalized: null,
    };
  }
  return validateBytes(stringToFacelets(value), options);
}

export function validateBytes(state: Uint8Array, options?: { searchRotations?: boolean }): ValidationResult {
  const issues: ValidationIssue[] = [];
  const counts = new Map<ColorName, number>();
  for (const color of COLORS) counts.set(color, 0);
  for (let i = 0; i < 54; i++) {
    const name = COLORS[state[i]!]!;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const badCounts = COLORS.filter((color) => counts.get(color) !== 9);
  if (badCounts.length) {
    const detail = COLORS.map((color) => `${counts.get(color)} ${COLOR_NAME[color]}`).join(", ");
    issues.push({
      code: "counts",
      message: `A normal cube has 9 stickers of each colour. This one has ${detail}.`,
      ambiguous: false,
      pieces: badCounts.map((color) => COLOR_NAME[color]),
    });
  }

  const centers = FACES.map((face) => centerColor(state, face));
  const uniqueCenters = new Set(centers);
  if (uniqueCenters.size !== 6) {
    issues.push({
      code: "centres",
      message: "The six centre stickers must be six different colours. Centres name the faces, so fix those before trusting the other stickers.",
      ambiguous: false,
      pieces: centers.map((color) => COLOR_NAME[color]),
    });
  } else {
    for (const face of FACES) {
      const color = centerColor(state, face);
      const opposite = centerColor(state, OPPOSITE_FACE[face]);
      if (OPPOSITE_COLOR[color] !== opposite) {
        issues.push({
          code: "opposites",
          message: `This lesson assumes the ordinary Western opposites: white opposite yellow, red opposite orange, and blue opposite green. Here ${COLOR_NAME[color]} is opposite ${COLOR_NAME[opposite]}.`,
          ambiguous: false,
          pieces: [COLOR_NAME[color], COLOR_NAME[opposite]],
        });
        break;
      }
    }
    if (!issues.some((issue) => issue.code === "opposites")) {
      const setup = rotationToHome(state);
      const turned = setup.length ? applyMoves(state, setup) : copyBytes(state);
      if (!centersAreHome(turned)) {
        issues.push({
          code: "chirality",
          message:
            "The opposite colours are right, but the side centres are a mirror of the usual Western arrangement (green in front and white on top would not put red on the right). This lesson only solves the usual arrangement.",
          ambiguous: false,
          pieces: [],
        });
      }
    }
  }

  if (issues.length) {
    return { ok: false, issues, fixes: [], normalized: null };
  }

  const setup = rotationToHome(state);
  const home = setup.length ? applyMoves(state, setup) : copyBytes(state);
  const cubies = readCubies(home);
  if (cubies.unknownEdges.length || cubies.unknownCorners.length) {
    issues.push({
      code: "pieces",
      message: `Some stickers do not form a real edge or corner of this colour scheme (${[...cubies.unknownEdges, ...cubies.unknownCorners].slice(0, 4).join(", ")}). That usually means a sticker was given the wrong colour, and it is not honest to blame one face when several photos could cause it.`,
      ambiguous: true,
      pieces: [...cubies.unknownEdges, ...cubies.unknownCorners],
    });
  }
  if (cubies.duplicateEdges.length || cubies.duplicateCorners.length) {
    issues.push({
      code: "duplicates",
      message: `A piece appears more than once (${[...cubies.duplicateEdges, ...cubies.duplicateCorners].slice(0, 4).join(", ")}), so another piece is missing. Check those colours. If a photo was rotated, more than one face could be the cause.`,
      ambiguous: true,
      pieces: [...cubies.duplicateEdges, ...cubies.duplicateCorners],
    });
  }

  if (!issues.length) {
    const edgeSum = cubies.edgeOri.reduce((sum, value) => sum + value, 0);
    const cornerSum = cubies.cornerOri.reduce((sum, value) => sum + value, 0);
    const edgeParity = permutationParity(cubies.edgePerm);
    const cornerParity = permutationParity(cubies.cornerPerm);
    if (edgeSum % 2 !== 0) {
      issues.push({
        code: "edge-flip",
        message:
          "Every real piece is present, but the edges are flipped in a way a normal cube cannot reach (it would take a single flipped edge, or another odd flip). A wrong sticker colour or a rotated photo can look like this. The pattern does not name one face.",
        ambiguous: true,
        pieces: [],
      });
    }
    if (cornerSum % 3 !== 0) {
      issues.push({
        code: "corner-twist",
        message:
          "Every real piece is present, but a corner is twisted in a way a normal cube cannot reach. That can be a mis-coloured sticker or a rotated photo. It is ambiguous which face, so none is singled out.",
        ambiguous: true,
        pieces: [],
      });
    }
    if (edgeParity !== null && cornerParity !== null && edgeParity !== cornerParity) {
      issues.push({
        code: "parity",
        message:
          "The pieces would need an odd swap (two edges exchanged, or two corners exchanged) and a normal cube cannot do that. This is often one sticker swapped by a bad read. Several faces could explain it.",
        ambiguous: true,
        pieces: [],
      });
    }
  }

  const fixes = options?.searchRotations === false || issues.length === 0 ? [] : searchOrientationFixes(state);
  if (fixes.length === 1 && issues.length) {
    issues.push({
      code: "orientation-hint",
      message: `One orientation of the photos does make a solvable cube: ${fixes[0]!.summary}. Apply it only if the 3D preview then matches the cube in your hands.`,
      ambiguous: false,
      pieces: [],
    });
  } else if (fixes.length > 1) {
    issues.push({
      code: "orientation-ambiguous",
      message: `${fixes.length} different photo rotations would each produce a solvable colouring. That is ambiguous, so nothing is applied automatically. Rotate a face in the review, or retake it, and check the preview.`,
      ambiguous: true,
      pieces: [],
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    fixes,
    normalized: issues.some((issue) => ["counts", "centres", "opposites", "chirality", "length"].includes(issue.code))
      ? null
      : faceletsToString(home),
  };
}

function searchOrientationFixes(state: Uint8Array): OrientationFix[] {
  const fixes: OrientationFix[] = [];
  const quarters = [0, 1, 2, 3];
  for (const u of quarters) {
    let cube = rotateFaceRing(state, "U", u);
    for (const r of quarters) {
      let cubeR = rotateFaceRing(cube, "R", r);
      for (const f of quarters) {
        let cubeF = rotateFaceRing(cubeR, "F", f);
        for (const d of quarters) {
          let cubeD = rotateFaceRing(cubeF, "D", d);
          for (const l of quarters) {
            let cubeL = rotateFaceRing(cubeD, "L", l);
            for (const b of quarters) {
              if (u + r + f + d + l + b === 0) continue;
              const turned = rotateFaceRing(cubeL, "B", b);
              const result = validateBytes(turned, { searchRotations: false });
              if (result.ok) {
                const map = { U: u, R: r, F: f, D: d, L: l, B: b };
                fixes.push({ quarters: map, summary: describeQuarters(map) });
                if (fixes.length >= 6) return fixes;
              }
            }
          }
        }
      }
    }
  }
  return fixes;
}

function describeQuarters(map: Record<Face, number>): string {
  const parts = FACES.filter((face) => map[face] !== 0).map((face) => {
    const turns = map[face]!;
    const label = turns === 1 ? "90° clockwise" : turns === 2 ? "180°" : "90° anticlockwise";
    return `${faceName(face)} ${label}`;
  });
  return parts.join(", ");
}

export function faceName(face: Face): string {
  switch (face) {
    case "U":
      return "Up";
    case "D":
      return "Down";
    case "F":
      return "Front";
    case "B":
      return "Back";
    case "R":
      return "Right";
    case "L":
      return "Left";
  }
}

export function applyOrientation(state: Uint8Array, quarters: Record<Face, number>): Uint8Array {
  let next = copyBytes(state);
  for (const face of FACES) next = rotateFaceRing(next, face, quarters[face] ?? 0);
  return next;
}
