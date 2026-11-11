import { parentPort } from "node:worker_threads";
import { solveFour } from "../src/solver/fourSolve";

parentPort!.on("message", (text: string) => {
  const started = Date.now();
  try {
    const moves = solveFour(text).moves;
    parentPort!.postMessage({ ok: true, moves, ms: Date.now() - started });
  } catch (error) {
    parentPort!.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    });
  }
});
