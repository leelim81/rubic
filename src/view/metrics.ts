/** 3×3 cubies sit on the integer grid. These sizes are what the orbit tests were tuned against. */
export const THREE_PITCH = 1;
export const THREE_BODY = 0.92;
export const THREE_STICKER = 0.78;
export const THREE_LIFT = 0.475;

/**
 * 5×5 uses the same camera, so the cubies are packed to fill about the same
 * frame as the 3×3. A little larger than a strict half-scale keeps the
 * stickers tappable on a 320px phone.
 */
export const FIVE_PITCH = 0.68;
export const FIVE_BODY = 0.62;
export const FIVE_STICKER = 0.56;
export const FIVE_LIFT = 0.32;

/**
 * 4×4 layers are two grid units apart (±3, ±1). The body is sized for that
 * step, so the gap between cubies matches the 3×3 and 5×5 instead of leaving
 * a floating lattice. The outer face still lands in the same camera frame.
 */
export const FOUR_PITCH = 0.427;
export const FOUR_BODY = 0.778;
export const FOUR_STICKER = 0.7;
export const FOUR_LIFT = 0.4;

/** Distance between neighbouring cubie centres. 4×4 layers are two units apart. */
export function cubieStep(order: 3 | 4 | 5): number {
  if (order === 3) return THREE_PITCH;
  if (order === 5) return FIVE_PITCH;
  return FOUR_PITCH * 2;
}

export function cubieBody(order: 3 | 4 | 5): number {
  if (order === 3) return THREE_BODY;
  if (order === 5) return FIVE_BODY;
  return FOUR_BODY;
}

/** Empty fraction of the centre-to-centre step. Thin, and about the same on every size. */
export function cubieGapRatio(order: 3 | 4 | 5): number {
  const step = cubieStep(order);
  return (step - cubieBody(order)) / step;
}
