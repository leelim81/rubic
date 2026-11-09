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
  white: "#000000",
  yellow: "#000000",
  orange: "#000000",
  red: "#ffffff",
  blue: "#ffffff",
  green: "#000000",
};

export const LABEL_HALO: Record<ColorName, string> = {
  white: "#ffffff",
  yellow: "#ffffff",
  orange: "#ffffff",
  red: "#000000",
  blue: "#000000",
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

function linearByte(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance from an sRGB pixel. */
export function byteLuminance(red: number, green: number, blue: number): number {
  return 0.2126 * linearByte(red) + 0.7152 * linearByte(green) + 0.0722 * linearByte(blue);
}

/** WCAG 2 contrast ratio. 1 is identical, 21 is black on white. */
export function contrastOfLuminance(lighter: number, darker: number): number {
  const [hi, lo] = lighter > darker ? [lighter, darker] : [darker, lighter];
  return (hi + 0.05) / (lo + 0.05);
}

function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  return byteLuminance((value >> 16) & 255, (value >> 8) & 255, value & 255);
}

export function contrastRatio(background: string, foreground: string): number {
  return contrastOfLuminance(luminance(background), luminance(foreground));
}
