import type { ColorName } from "../cube/model";

/** Sticker paints. Letters are chosen so each pair clears WCAG AA (4.5:1). */
export const STICKER_HEX: Record<ColorName, string> = {
  white: "#f3f0e8",
  yellow: "#f5d20f",
  orange: "#f18f01",
  red: "#d7263d",
  blue: "#2f6fed",
  green: "#1f9d55",
};

/** Green is a mid tone, so a dark letter is the one that stays above 4.5:1. */
export const LABEL_INK: Record<ColorName, string> = {
  white: "#111111",
  yellow: "#111111",
  orange: "#111111",
  red: "#ffffff",
  blue: "#ffffff",
  green: "#111111",
};

export const LABEL_HALO: Record<ColorName, string> = {
  white: "#ffffff",
  yellow: "#ffffff",
  orange: "#ffffff",
  red: "#111111",
  blue: "#111111",
  green: "#ffffff",
};

export const STICKER_MARK: Record<ColorName, string> = {
  white: "W",
  yellow: "Y",
  orange: "O",
  red: "R",
  blue: "B",
  green: "G",
};

function channel(hex: string, shift: number): number {
  const value = parseInt(hex.slice(shift, shift + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG 2 contrast ratio. 1 is identical, 21 is black on white. */
export function contrastRatio(background: string, foreground: string): number {
  const lighter = luminance(background);
  const darker = luminance(foreground);
  const [hi, lo] = lighter > darker ? [lighter, darker] : [darker, lighter];
  return (hi + 0.05) / (lo + 0.05);
}
