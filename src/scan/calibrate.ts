import type { ColorName, Face } from "../cube/model";
import { labDistance, type Lab } from "./color";
import { CAPTURES } from "./mapping";

export interface CalibratedSticker {
  lab: Lab;
  name: ColorName;
  uncertain: boolean;
  confirmed: boolean;
  touched: boolean;
}

/**
 * Centre stickers are the colour references for this cube.
 * Each other sticker is named after the nearest centre's chosen name.
 * A sticker the user has already set (`touched`) is left alone.
 * Renaming a centre therefore renames every untouched sticker that is
 * closest to that centre's sampled colour, including stickers on faces
 * captured earlier.
 */
export function propagateCentreNames<T extends CalibratedSticker>(draft: Record<Face, T[] | null>): Record<Face, T[] | null> {
  const centres = CAPTURES.flatMap((capture) => {
    const centre = draft[capture.face]?.[4];
    return centre ? [{ lab: centre.lab, name: centre.name }] : [];
  });
  if (!centres.length) return draft;
  const next = { ...draft };
  for (const capture of CAPTURES) {
    const face = draft[capture.face];
    if (!face) continue;
    next[capture.face] = face.map((sticker, index) => {
      if (index === 4 || sticker.touched) return sticker;
      const ranked = centres
        .map((centre) => ({ centre, distance: labDistance(sticker.lab, centre.lab) }))
        .sort((a, b) => a.distance - b.distance);
      const best = ranked[0]!;
      const second = ranked[1];
      const gap = !second || second.distance <= 0.0001 ? 0 : (second.distance - best.distance) / second.distance;
      const uncertain = gap < 0.18 || best.distance > 0.22;
      return {
        ...sticker,
        name: best.centre.name,
        uncertain,
        confirmed: !uncertain,
      };
    });
  }
  return next;
}
