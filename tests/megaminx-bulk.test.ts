import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { beforeAll, describe, expect, it } from "vitest";
import * as esbuild from "esbuild";
import { mulberry32 } from "../src/cube/model";
import { applyMegaString, randomMegaScramble, solvedMegaString } from "../src/megaminx/model";
import { batchCount, seedChunks, solverPoolSize } from "./batchSize";

const SOLVES = batchCount("MEGA_SOLVES", 200);
const CHUNK = 40;
const SCRAMBLE = 70;
const SOLVED = solvedMegaString();

interface Reply {
  ok: boolean;
  moves?: string[];
  error?: string;
  ms: number;
}

describe("megaminx random solves", () => {
  let outfile = "";

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "mega-solve-"));
    outfile = join(dir, "worker.mjs");
    await esbuild.build({
      entryPoints: [join(process.cwd(), "tests/megaminx.worker.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile,
      logLevel: "silent",
    });
  });

  for (const [from, to] of seedChunks(SOLVES, CHUNK)) {
    it(`solves seeded length-${SCRAMBLE} scrambles ${from}–${to}`, async () => {
      const workers = solverPoolSize();
      const pool = Array.from({ length: workers }, () => createSolver(outfile));
      const lengths: number[] = [];
      const times: number[] = [];
      let next = from;
      async function run() {
        const solver = pool.pop();
        if (!solver) return;
        try {
          while (next <= to) {
            const seed = next;
            next += 1;
            const text = applyMegaString(SOLVED, randomMegaScramble(mulberry32(seed), SCRAMBLE));
            const reply = await solver.solve(text);
            expect(reply.ok, `seed ${seed} ${reply.error ?? ""}`).toBe(true);
            expect(applyMegaString(text, reply.moves ?? []), `seed ${seed}`).toBe(SOLVED);
            const length = reply.moves?.length ?? 0;
            expect(length, `seed ${seed}`).toBeGreaterThan(0);
            expect(length, `seed ${seed}`).toBeLessThan(250);
            lengths.push(length);
            times.push(reply.ms);
            if (seed % 25 === 0) console.log(`megaminx solves ${seed}/${SOLVES}`);
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
        solves: lengths.length,
        scramble: SCRAMBLE,
        moves: { min: lengths[0], mean: mean(lengths), max: lengths.at(-1) },
        ms: { min: times[0], mean: mean(times), max: times.at(-1) },
      }));
      expect(lengths).toHaveLength(to - from + 1);
      expect(mean(lengths)).toBeLessThan(200);
      expect(mean(times)).toBeLessThan(5_000);
    }, 40 * 60 * 1000);
  }
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
