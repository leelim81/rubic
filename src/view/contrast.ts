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

export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function linearToByte(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

/**
 * A dimmer backlight. Linear light is scaled by `brightness` (1 leaves the
 * colour alone, 0.5 is a screen at half brightness) and encoded back to sRGB.
 * Black stays black, so light text and light stickers lose contrast.
 */
export function dimHex(hex: string, brightness: number): string {
  const scaled = hexToRgb(hex).map((channel) => linearToByte(linearByte(channel) * brightness));
  return `#${scaled.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** OKLab, so hue differences still count when two stickers share a lightness. */
export function oklabOf(hex: string): { L: number; a: number; b: number } {
  const [redByte, greenByte, blueByte] = hexToRgb(hex);
  const red = linearByte(redByte);
  const green = linearByte(greenByte);
  const blue = linearByte(blueByte);
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabDistance(left: string, right: string): number {
  const a = oklabOf(left);
  const b = oklabOf(right);
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}
