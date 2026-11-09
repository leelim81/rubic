import type { Solution } from "./solver/beginner";
import { solveBeginner } from "./solver/beginner";
import { solveCube } from "./solver/twoPhase";

export type SolveMethod = "beginner" | "expert";

function solveNow(facelets: string, method: SolveMethod): Solution {
  return method === "expert" ? solveCube(facelets) : solveBeginner(facelets);
}

export function solveInWorker(facelets: string, method: SolveMethod = "expert"): Promise<Solution> {
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
    }, 8000);
    worker.onmessage = (event: MessageEvent<{ solution?: Solution; error?: string }>) => {
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
