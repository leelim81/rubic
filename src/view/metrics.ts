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

/** 4×4 grid is ±3 and ±1, so the pitch is tighter to keep the same frame as a 3×3. */
export const FOUR_PITCH = 0.46;
export const FOUR_BODY = 0.4;
export const FOUR_STICKER = 0.34;
export const FOUR_LIFT = 0.21;
