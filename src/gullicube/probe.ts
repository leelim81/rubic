const PAGE = 65536;

/**
 * Ask the engine for the memory gullicube will grow into.
 * A RangeError here means this device cannot hold it. navigator.deviceMemory
 * is deliberately not consulted: it is Chrome-only, coarse, and capped at 8.
 */
/** Measured resident size of a 5×5 gullicube solve, with a little headroom. */
export const PROBE_BYTES = 1400 * 1024 * 1024;
export const SOLVE_SECONDS = 16;
export const SOLVE_TIMEOUT_MS = 40_000;

export function probeWasmMemory(bytes: number): void {
  const pages = Math.ceil(bytes / PAGE);
  const memory = new WebAssembly.Memory({ initial: pages, maximum: pages });
  const view = new Uint8Array(memory.buffer);
  for (let offset = 0; offset < view.length; offset += PAGE) view[offset] = 1;
}

export const FALLBACK_NOTE = "Used the standard 5x5 solver on this device";

/** Soft hint only. Never skip the probe because of this value. */
export function deviceMemoryHint(): number | null {
  const host = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  const value = host?.deviceMemory;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
