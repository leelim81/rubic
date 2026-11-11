import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { applyFiveString, randomFiveScramble, solvedFiveString } from "../src/cube/five";
import { mulberry32 } from "../src/cube/model";
import { batchCount, seedChunks, solverPoolSize } from "./batchSize";
import { applySim, simString, solvedSim } from "./fiveSim";

const SOLVES = batchCount("GULLI_SOLVES", 100);
const CHUNK = 4;

interface Reply {
  ok: boolean;
  moves?: string[];
  error?: string;
  ms: number;
}

describe("gullicube solves", () => {
  const filename = join(process.cwd(), "tests/gullicube.worker.mjs");

  for (const [from, to] of seedChunks(SOLVES, CHUNK)) {
    it(`verifies seeded scrambles ${from}–${to} with the independent simulator`, async () => {
      const workers = solverPoolSize();
      const lengths: number[] = [];
      const times: number[] = [];
      let next = from;
      async function run() {
        while (next <= to) {
          const seed = next;
          next += 1;
          const text = applyFiveString(solvedFiveString(), randomFiveScramble(mulberry32(seed), 40));
          const reply = await solveOnce(filename, text);
          expect(reply.ok, `seed ${seed} ${reply.error ?? ""}`).toBe(true);
          const painted = solvedSim().map((sticker, index) => ({ ...sticker, color: text[index]! }));
          expect(simString(applySim(painted, reply.moves ?? [])), `seed ${seed}`).toBe(solvedFiveString());
          lengths.push(reply.moves?.length ?? 0);
          times.push(reply.ms);
          if (seed % 10 === 0) console.log(`gullicube ${seed}/${SOLVES}`);
        }
      }
      await Promise.all(Array.from({ length: workers }, () => run()));
      lengths.sort((a, b) => a - b);
      times.sort((a, b) => a - b);
      const mean = (values: number[]) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
      console.log(JSON.stringify({
        solves: lengths.length,
        moves: { min: lengths[0], mean: mean(lengths), max: lengths.at(-1) },
        ms: { min: times[0], mean: mean(times), max: times.at(-1) },
      }));
      expect(lengths).toHaveLength(to - from + 1);
    }, 45 * 60 * 1000);
  }
});

function solveOnce(filename: string, text: string): Promise<Reply> {
  const worker = new Worker(filename, { type: "module" });
  return new Promise((resolve, reject) => {
    worker.on("message", (reply: Reply) => {
      resolve(reply);
      void worker.terminate();
    });
    worker.on("error", (error) => {
      reject(error);
      void worker.terminate();
    });
    worker.postMessage(text);
  });
}
