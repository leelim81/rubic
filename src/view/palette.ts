import type { ColorName } from "../cube/model";
import { LABEL_HALO, LABEL_INK, STICKER_HEX } from "./contrast";

/**
 * Display colours for logical sticker names.
 *
 * Solvers, validators, and the photo scan keep using logical names
 * (`white`, `red`, …). Anything that paints a sticker asks
 * `displaySwatch(name)` for the hex, the label ink, and the halo of the
 * palette the visitor picked. `applyPalette` writes those onto
 * `--{name}`, `--{name}-ink`, and `--{name}-halo`, so a swatch or net cell
 * with `data-colour="{name}"` follows along.
 *
 * The cube, 4×4, and Pyraminx already use names from this list (`white`,
 * `yellow`, `red`, `orange`, `blue`, `green`; a Pyraminx uses four of them).
 * Megaminx can use all twelve without another palette change:
 * `white`, `yellow`, `red`, `orange`, `blue`, `green`, `purple`, `pink`,
 * `sky`, `lime`, `cream`, `grey`. A new logical name is one entry in
 * `LOGICAL_COLOURS` plus a standard swatch and a pastel swatch. Photograph
 * classification must keep using `CANONICAL_RGB` in `src/scan/color.ts`;
 * these hexes are for display only.
 */

export const PALETTE_STORAGE_KEY = "rubic-palette-v1";

export const LOGICAL_COLOURS = [
  "white",
  "yellow",
  "red",
  "orange",
  "blue",
  "green",
  "purple",
  "pink",
  "sky",
  "lime",
  "cream",
  "grey",
] as const;

export type LogicalColour = (typeof LOGICAL_COLOURS)[number];
export type PaletteName = "standard" | "pastel";

export interface Swatch {
  hex: string;
  ink: string;
  halo: string;
}

const STANDARD_EXTRA: Record<Exclude<LogicalColour, ColorName>, Swatch> = {
  purple: { hex: "#7c3aed", ink: "#ffffff", halo: "#000000" },
  pink: { hex: "#ec4899", ink: "#000000", halo: "#ffffff" },
  sky: { hex: "#22d3ee", ink: "#000000", halo: "#ffffff" },
  lime: { hex: "#84cc16", ink: "#000000", halo: "#ffffff" },
  cream: { hex: "#e7c98a", ink: "#000000", halo: "#ffffff" },
  grey: { hex: "#94a3b8", ink: "#000000", halo: "#ffffff" },
};

/**
 * Pastel hexes are light enough that a black label stays above 4.5:1 even
 * when a backlight is cut to 40%, and every pair stays apart in OKLab
 * (the closest pair is orange and red). Hues stay recognisable: the red is
 * a light coral so it does not collapse into pink, and cream is a warm ivory
 * rather than a second yellow.
 */
const PASTEL: Record<LogicalColour, Swatch> = {
  white: { hex: "#fcfaff", ink: "#000000", halo: "#ffffff" },
  yellow: { hex: "#fedf35", ink: "#000000", halo: "#ffffff" },
  red: { hex: "#ff9397", ink: "#000000", halo: "#ffffff" },
  orange: { hex: "#f3ab58", ink: "#000000", halo: "#ffffff" },
  blue: { hex: "#80baff", ink: "#000000", halo: "#ffffff" },
  green: { hex: "#62c8a0", ink: "#000000", halo: "#ffffff" },
  purple: { hex: "#d0a1ff", ink: "#000000", halo: "#ffffff" },
  pink: { hex: "#ffbce7", ink: "#000000", halo: "#ffffff" },
  sky: { hex: "#9ae7f2", ink: "#000000", halo: "#ffffff" },
  lime: { hex: "#afe38e", ink: "#000000", halo: "#ffffff" },
  cream: { hex: "#f5d8b3", ink: "#000000", halo: "#ffffff" },
  grey: { hex: "#b0b2b6", ink: "#000000", halo: "#ffffff" },
};

function standardSwatch(name: LogicalColour): Swatch {
  if (name in STICKER_HEX) {
    const colour = name as ColorName;
    return { hex: STICKER_HEX[colour], ink: LABEL_INK[colour], halo: LABEL_HALO[colour] };
  }
  return STANDARD_EXTRA[name as Exclude<LogicalColour, ColorName>];
}

export const PALETTES: Record<PaletteName, Record<LogicalColour, Swatch>> = {
  standard: Object.fromEntries(LOGICAL_COLOURS.map((name) => [name, standardSwatch(name)])) as Record<LogicalColour, Swatch>,
  pastel: PASTEL,
};

function storedPalette(): PaletteName {
  try {
    if (typeof localStorage === "undefined") return "standard";
    return localStorage.getItem(PALETTE_STORAGE_KEY) === "pastel" ? "pastel" : "standard";
  } catch {
    return "standard";
  }
}

let current: PaletteName = storedPalette();
const listeners = new Set<() => void>();

export function getPalette(): PaletteName {
  return current;
}

export function displaySwatch(name: LogicalColour, palette: PaletteName = current): Swatch {
  return PALETTES[palette][name];
}

/** Push the active palette onto the CSS variables the swatches read. */
export function applyPalette(palette: PaletteName = current): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.palette = palette;
  const table = PALETTES[palette];
  for (const name of LOGICAL_COLOURS) {
    const swatch = table[name];
    root.style.setProperty(`--${name}`, swatch.hex);
    root.style.setProperty(`--${name}-ink`, swatch.ink);
    root.style.setProperty(`--${name}-halo`, swatch.halo);
  }
}

export function setPalette(palette: PaletteName): void {
  current = palette;
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, palette);
  } catch {
    // Private mode can block storage. The choice still applies for this visit.
  }
  applyPalette(palette);
  for (const listener of listeners) listener();
}

export function subscribePalette(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
