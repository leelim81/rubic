import { afterEach, describe, expect, it } from "vitest";
import { BATCH_SAMPLE, batchCount, batchRanges } from "./batchSize";

const FULL_RANGES = [[1, 50], [51, 100], [101, 150], [151, 200]] as const;

describe("batch size", () => {
  const saved = {
    full: process.env.FULL_BATCH,
    five: process.env.FIVE_SOLVES,
  };

  afterEach(() => {
    restore("FULL_BATCH", saved.full);
    restore("FIVE_SOLVES", saved.five);
  });

  it("keeps a short sample in the default suite", () => {
    delete process.env.FULL_BATCH;
    delete process.env.FIVE_SOLVES;
    expect(BATCH_SAMPLE).toBeGreaterThanOrEqual(10);
    expect(BATCH_SAMPLE).toBeLessThanOrEqual(20);
    expect(batchCount("FIVE_SOLVES", 1000)).toBe(BATCH_SAMPLE);
    expect(batchRanges(FULL_RANGES)).toEqual([[1, BATCH_SAMPLE]]);
  });

  it("restores the historical batch when FULL_BATCH=1", () => {
    delete process.env.FIVE_SOLVES;
    process.env.FULL_BATCH = "1";
    expect(batchCount("FIVE_SOLVES", 1000)).toBe(1000);
    expect(batchCount("MEGA_SOLVES", 200)).toBe(200);
    expect(batchRanges(FULL_RANGES)).toEqual([...FULL_RANGES]);
  });

  it("lets an explicit count override either mode", () => {
    process.env.FULL_BATCH = "1";
    process.env.FIVE_SOLVES = "3";
    expect(batchCount("FIVE_SOLVES", 1000)).toBe(3);
    process.env.FIVE_SOLVES = "0";
    expect(() => batchCount("FIVE_SOLVES", 1000)).toThrow(/positive/);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
