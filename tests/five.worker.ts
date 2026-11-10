import { parentPort } from "node:worker_threads";
import { solveFive } from "../src/solver/fiveSolve";

parentPort!.on("message", (text: string) => {
  const started = Date.now();
  try {
    const moves = solveFive(text).moves;
    parentPort!.postMessage({ ok: true, moves, ms: Date.now() - started });
  } catch (error) {
    parentPort!.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    });
  }
});
