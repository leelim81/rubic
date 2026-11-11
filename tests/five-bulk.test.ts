import { mkdtempSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import * as esbuild from "esbuild";
import { applyFiveString, randomFiveScramble, solvedFiveString } from "../src/cube/five";
import { mulberry32 } from "../src/cube/model";
import { batchCount } from "./batchSize";
import { applySim, simString, solvedSim } from "./fiveSim";

const SOLVES = batchCount("FIVE_SOLVES", 1000);

interface Reply {
  ok: boolean;
  moves?: string[];
  error?: string;
  ms: number;
}

describe("5×5 random solves", () => {
  it(`solves ${SOLVES} seeded length-40 scrambles`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "five-solve-"));
    const outfile = join(dir, "worker.mjs");
    await esbuild.build({
      entryPoints: [join(process.cwd(), "tests/five.worker.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile,
      logLevel: "silent",
    });
    const workers = Math.max(1, Math.min(2, availableParallelism()));
    const pool = Array.from({ length: workers }, () => createSolver(outfile));
    const lengths: number[] = [];
    const times: number[] = [];
    let next = 1;
    async function run() {
      const solver = pool.pop();
      if (!solver) return;
      try {
        while (next <= SOLVES) {
          const seed = next;
          next += 1;
          const text = applyFiveString(solvedFiveString(), randomFiveScramble(mulberry32(seed), 40));
          const reply = await solver.solve(text);
          expect(reply.ok, `seed ${seed} ${reply.error ?? ""}`).toBe(true);
          const painted = solvedSim().map((sticker, index) => ({ ...sticker, color: text[index]! }));
          expect(simString(applySim(painted, reply.moves ?? [])), `seed ${seed}`).toBe(solvedFiveString());
          lengths.push(reply.moves?.length ?? 0);
          times.push(reply.ms);
          if (seed % 50 === 0) console.log(`5×5 solves ${seed}/${SOLVES}`);
        }
      } finally {
        await solver.close();
      }
    }
    await Promise.all(Array.from({ length: workers }, () => run()));
    lengths.sort((a, b) => a - b);
    times.sort((a, b) => a - b);
    const mean = (values: number[]) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    console.log(JSON.stringify({
      solves: SOLVES,
      moves: { min: lengths[0], mean: mean(lengths), max: lengths.at(-1) },
      ms: { min: times[0], mean: mean(times), max: times.at(-1) },
    }));
    expect(lengths).toHaveLength(SOLVES);
  }, 90 * 60 * 1000);
});

function createSolver(outfile: string) {
  const worker = new Worker(outfile, { type: "module" });
  const queue: { text: string; resolve: (reply: Reply) => void; reject: (error: Error) => void }[] = [];
  let busy = false;
  worker.on("message", (reply: Reply) => {
    busy = false;
    queue.shift()?.resolve(reply);
    const next = queue[0];
    if (!next) return;
    busy = true;
    worker.postMessage(next.text);
  });
  worker.on("error", (error) => {
    busy = false;
    while (queue.length) queue.shift()?.reject(error);
  });
  return {
    solve(text: string) {
      return new Promise<Reply>((resolve, reject) => {
        queue.push({ text, resolve, reject });
        if (busy) return;
        busy = true;
        worker.postMessage(queue[0]!.text);
      });
    },
    close: () => worker.terminate(),
  };
}
