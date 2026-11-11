import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { COLORS } from "../src/cube/model";
import { CANONICAL_RGB, nameFromCanonical, rgbToLab } from "../src/scan/color";
import { contrastRatio, dimHex, oklabDistance } from "../src/view/contrast";
import {
  LOGICAL_COLOURS,
  PALETTE_STORAGE_KEY,
  displaySwatch,
  getPalette,
  setPalette,
  subscribePalette,
  type Swatch,
} from "../src/view/palette";

afterEach(() => {
  setPalette("standard");
});

function rgbHex([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Black ink stays black on a dim screen. White ink dims with the backlight. */
function inkContrast(swatch: Swatch, brightness = 1): number {
  const background = brightness === 1 ? swatch.hex : dimHex(swatch.hex, brightness);
  const foreground = swatch.ink === "#000000" ? "#000000" : dimHex(swatch.ink, brightness);
  return contrastRatio(background, foreground);
}

function closest(names: readonly string[], hexOf: (name: string) => string, brightness = 1): { distance: number; pair: string } {
  let distance = Infinity;
  let pair = "";
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const left = brightness === 1 ? hexOf(names[i]!) : dimHex(hexOf(names[i]!), brightness);
      const right = brightness === 1 ? hexOf(names[j]!) : dimHex(hexOf(names[j]!), brightness);
      const next = oklabDistance(left, right);
      if (next < distance) {
        distance = next;
        pair = `${names[i]}/${names[j]}`;
      }
    }
  }
  return { distance, pair };
}

describe("display palette", () => {
  it("starts on the standard colours and keeps the cube hexes", () => {
    expect(getPalette()).toBe("standard");
    for (const colour of COLORS) {
      expect(displaySwatch(colour, "standard").hex).toBe(
        { white: "#f3f0e8", yellow: "#f5d20f", red: "#d7263d", orange: "#f18f01", blue: "#2f6fed", green: "#1f9d55" }[colour],
      );
    }
  });

  it("remembers pastel in localStorage", () => {
    const memory = new Map<string, string>();
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => memory.set(key, value),
        removeItem: (key: string) => memory.delete(key),
      },
    });
    try {
      setPalette("pastel");
      expect(getPalette()).toBe("pastel");
      expect(memory.get(PALETTE_STORAGE_KEY)).toBe("pastel");
      setPalette("standard");
      expect(memory.get(PALETTE_STORAGE_KEY)).toBe("standard");
      expect(getPalette()).toBe("standard");
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("notifies listeners and lets them unsubscribe", () => {
    const seen: string[] = [];
    const stop = subscribePalette(() => seen.push(getPalette()));
    setPalette("pastel");
    stop();
    setPalette("standard");
    expect(seen).toEqual(["pastel"]);
  });

  it("keeps pastel stickers apart, including on a dim screen, and labels readable", () => {
    const hexOf = (name: string) => displaySwatch(name as (typeof LOGICAL_COLOURS)[number], "pastel").hex;
    const full = closest(LOGICAL_COLOURS, hexOf);
    const half = closest(LOGICAL_COLOURS, hexOf, 0.5);
    const dim = closest(LOGICAL_COLOURS, hexOf, 0.4);
    expect(full.distance, full.pair).toBeGreaterThanOrEqual(0.1);
    expect(half.distance, `half backlight ${half.pair}`).toBeGreaterThanOrEqual(0.08);
    expect(dim.distance, `40% backlight ${dim.pair}`).toBeGreaterThanOrEqual(0.075);
    for (const name of LOGICAL_COLOURS) {
      const swatch = displaySwatch(name, "pastel");
      expect(inkContrast(swatch), name).toBeGreaterThanOrEqual(4.5);
      expect(inkContrast(swatch, 0.5), `${name} at half brightness`).toBeGreaterThanOrEqual(4.5);
      expect(inkContrast(swatch, 0.4), `${name} at 40% brightness`).toBeGreaterThanOrEqual(4.5);
      expect(swatch.hex).not.toBe(displaySwatch(name, "standard").hex);
    }
  });

  it("keeps the twelve standard display colours distinguishable and labelled", () => {
    const hexOf = (name: string) => displaySwatch(name as (typeof LOGICAL_COLOURS)[number], "standard").hex;
    const full = closest(LOGICAL_COLOURS, hexOf);
    expect(full.distance, full.pair).toBeGreaterThanOrEqual(0.09);
    for (const name of LOGICAL_COLOURS) {
      expect(inkContrast(displaySwatch(name, "standard")), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("does not change how a photograph is classified", () => {
    const source = readFileSync(new URL("../src/scan/color.ts", import.meta.url), "utf8");
    expect(source).not.toContain("displaySwatch");
    expect(source).not.toContain("palette");
    setPalette("pastel");
    for (const colour of COLORS) {
      expect(nameFromCanonical(rgbToLab(...CANONICAL_RGB[colour])).name).toBe(colour);
      expect(displaySwatch(colour, "pastel").hex).not.toBe(rgbHex(CANONICAL_RGB[colour]));
    }
  });

  it("publishes the same standard hexes the stylesheet defaults to", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    for (const name of LOGICAL_COLOURS) {
      const swatch = displaySwatch(name, "standard");
      expect(css).toContain(`--${name}: ${swatch.hex}`);
      expect(css).toContain(`--${name}-ink: ${swatch.ink}`);
      expect(css).toContain(`--${name}-halo: ${swatch.halo}`);
      expect(css).toContain(`html[data-palette="pastel"] .sticker[data-colour="${name}"]`);
    }
  });
});
