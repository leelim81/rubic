import type { Solution } from "./solver/beginner";
import { solveCube } from "./solver/twoPhase";

export function solveInWorker(facelets: string): Promise<Solution> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker/solverWorker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      try {
        resolve(solveCube(facelets));
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
        resolve(solveCube(facelets));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("The solver could not start."));
      }
    };
    worker.postMessage({ facelets });
  });
}
