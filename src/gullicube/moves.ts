/** Colour letters used by this app, in face order U R F D L B. */
const TO_FACE: Record<string, string> = { y: "U", o: "R", g: "F", w: "D", r: "L", b: "B" };

/** Gullicube facelets are Kociemba letters. Ours are the colour letters wyrogb. */
export function toGullicubeFacelets(facelets: string): string {
  let text = "";
  for (const letter of facelets) {
    const face = TO_FACE[letter];
    if (!face) throw new Error("The cube uses an unknown colour.");
    text += face;
  }
  return text;
}

const MOVE = /^(?:[23]?[URFDLB]w?|[URFDLB]w)(?:'|2)?$/;

/** Keep only moves this cube can turn. Gullicube already prints 2U and 3U. */
export function gullicubeMoves(stdout: string): string[] {
  const moves: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(" ")) continue;
    for (const token of line.trim().split(/\s+/)) {
      if (MOVE.test(token)) moves.push(token);
    }
  }
  return moves;
}
