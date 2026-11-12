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
 * 4×4 cubies sit on grid coordinates −3, −1, 1 and 3, so neighbouring centres
 * are two grid steps apart. Pitch is the length of one grid step. It is set
 * so the finished cube has the same outer size as the 3×3, and the same share
 * of each slot is plastic (body / centre-spacing matches THREE_BODY). Treating
 * the grid step as 1 leaves a hole nearly as wide as a cubie.
 */
const FOUR_OUTER = THREE_PITCH + THREE_BODY / 2;
export const FOUR_PITCH = FOUR_OUTER / (3 + THREE_BODY / THREE_PITCH);
export const FOUR_BODY = (THREE_BODY / THREE_PITCH) * 2 * FOUR_PITCH;
export const FOUR_STICKER = (THREE_STICKER / THREE_PITCH) * 2 * FOUR_PITCH;
export const FOUR_LIFT = (THREE_LIFT / THREE_PITCH) * 2 * FOUR_PITCH;
