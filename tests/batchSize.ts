import { availableParallelism } from "node:os";

/** Seeded solves kept in the default `npm test` run. */
export const BATCH_SAMPLE = 16;

/**
 * Solver worker threads. One core stays free for Vitest: two solvers on a
 * two-core runner starve the test process, and Vitest then drops the run
 * after 60s even though every assertion passed.
 */
export function solverPoolSize(cap = 2): number {
  return Math.max(1, Math.min(cap, availableParallelism() - 1));
}

/** Inclusive 1-based chunks, so one test stays inside Vitest's 60s RPC limit. */
export function seedChunks(total: number, chunk: number): readonly (readonly [number, number])[] {
  const chunks: [number, number][] = [];
  for (let from = 1; from <= total; from += chunk) chunks.push([from, Math.min(total, from + chunk - 1)]);
  return chunks;
}

/** True when the full historical batches should run (`npm run test:batch`). */
export function fullBatch(): boolean {
  return process.env.FULL_BATCH === "1";
}

/**
 * How many seeded solves to run.
 * An explicit env override wins. Otherwise `FULL_BATCH=1` uses `full`
 * and the default suite uses `sample`.
 */
export function batchCount(envName: string, full: number, sample = BATCH_SAMPLE): number {
  const raw = process.env[envName];
  if (raw != null && raw !== "") {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(`${envName} must be a positive number, received ${raw}`);
    }
    return Math.floor(parsed);
  }
  return fullBatch() ? full : sample;
}

/**
 * Inclusive seed ranges. The default suite keeps the first `sample` seeds
 * of the first range. `FULL_BATCH=1` restores every range.
 */
export function batchRanges(
  full: readonly (readonly [number, number])[],
  sample = BATCH_SAMPLE,
): readonly (readonly [number, number])[] {
  if (fullBatch()) return full;
  const first = full[0];
  if (!first) return [];
  return [[first[0], Math.min(first[1], first[0] + sample - 1)]];
}
