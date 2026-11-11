import { SolveStopped } from "./gullicube/client";
import { solveFour } from "./solver/fourSolve";
import { solveFive } from "./solver/fiveSolve";
import type { Solution } from "./solver/beginner";
import { solveBeginner } from "./solver/beginner";
import { solveCube } from "./solver/twoPhase";

export type SolveMethod = "beginner" | "expert";

function solveNow(facelets: string, method: SolveMethod): Solution {
  if (facelets.length === 150) return solveFive(facelets);
  if (facelets.length === 96) return solveFour(facelets);
  return method === "expert" ? solveCube(facelets) : solveBeginner(facelets);
}

export function solveInWorker(facelets: string, method: SolveMethod = "expert", onProgress?: (message: string) => void, signal?: AbortSignal): Promise<Solution> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker/solverWorker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      try {
        resolve(solveNow(facelets, method));
      } catch (fallback) {
        reject(fallback instanceof Error ? fallback : error);
      }
      return;
    }
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("The solution took too long to prepare."));
    }, facelets.length === 150 ? 60_000 : facelets.length === 96 ? 30_000 : 8_000);
    const stop = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      worker.terminate();
      reject(new SolveStopped());
    };
    if (signal?.aborted) {
      stop();
      return;
    }
    signal?.addEventListener("abort", stop);
    worker.onmessage = (event: MessageEvent<{ solution?: Solution; error?: string; progress?: string }>) => {
      if (event.data.progress) {
        onProgress?.(event.data.progress);
        return;
      }
      window.clearTimeout(timer);
      worker.terminate();
      if (event.data.error || !event.data.solution) reject(new Error(event.data.error ?? "The cube could not be solved."));
      else resolve(event.data.solution);
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      worker.terminate();
      try {
        resolve(solveNow(facelets, method));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("The solver could not start."));
      }
    };
    worker.postMessage({ facelets, method });
  });
}
