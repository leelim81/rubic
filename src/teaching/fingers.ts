/** Original grip notes. Directions match the cube model's verified edge cycles. */

const CUES: Record<string, string> = {
  U: "Right index finger flicks the front edge of the top face to the left.",
  "U'": "Right index finger flicks the front edge of the top face to the right.",
  U2: "Push the front edge of the top face halfway around. Either direction is the same half turn.",
  D: "The front edge of the bottom face moves right. Many people use the left hand so the right hand can stay on top.",
  "D'": "The front edge of the bottom face moves left.",
  D2: "The bottom face makes a half turn. The front edge ends at the back.",
  R: "Right hand on the right face. The front edge moves up — the right index can push that edge upward.",
  "R'": "Right hand on the right face. The front edge moves down — flick it downward with the right index.",
  R2: "Right hand turns the right face halfway. The front edge ends at the back.",
  L: "Left hand on the left face. The front edge moves down.",
  "L'": "Left hand on the left face. The front edge moves up.",
  L2: "Left hand turns the left face halfway.",
  F: "Turn the front face so its top edge moves right. Right thumb can push the lower right while the index stays near the top.",
  "F'": "Turn the front face so its top edge moves left.",
  F2: "The front face makes a half turn. Its top edge ends at the bottom.",
  B: "Clockwise when you look at the back. From the front, the back face's top edge moves to your left. The right hand can reach over the top.",
  "B'": "From the front, the back face's top edge moves to your right.",
  B2: "The back face makes a half turn.",
  y: "Turn the whole cube clockwise as you look down at the top. Every layer moves together — this is a regrip, not a layer turn.",
  "y'": "Turn the whole cube anticlockwise as you look down at the top. Layers stay together.",
  y2: "Turn the whole cube halfway as you look down, so the back colour comes to the front.",
  x: "Tip the whole cube so the top face comes toward you. Layers stay together.",
  "x'": "Tip the whole cube so the top face goes away from you and the bottom comes toward you.",
  x2: "Flip the whole cube upside down. The front colour changes.",
  z: "Roll the whole cube clockwise as you look at the front, like a steering wheel. Layers stay together.",
  "z'": "Roll the whole cube anticlockwise as you look at the front.",
  z2: "Roll the whole cube upside down while the front colour stays facing you. Left and right colours swap places.",
};

export function fingerTrick(move: string): string {
  return CUES[move] ?? `Turn ${move}. Clockwise means the turn you see when you look straight at that face.`;
}

export function fingerTricks(moves: readonly string[]): string[] {
  return moves.map((move) => fingerTrick(move));
}
