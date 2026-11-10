import type { Solution } from "../solver/beginner";
import { FALLBACK_NOTE, deviceMemoryHint } from "./probe";

export const SKIP_KEY = "rubic-gullicube-skip-v1";
export const DECLINED_KEY = "rubic-gullicube-declined-v1";
export { FALLBACK_NOTE };

export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: GullicubeMessage }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

export type GullicubeMessage =
  | { type: "solution"; moves: string[] }
  | { type: "fallback"; reason: string }
  | { type: "progress"; message: string };

export interface ShorterOutcome {
  solution: Solution;
  engine: "gullicube" | "reduction";
  note: string | null;
  reason: string | null;
}

export class SolveStopped extends Error {
  constructor() {
    super("The solve was stopped.");
    this.name = "SolveStopped";
  }
}

export function gullicubeBlocked(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(SKIP_KEY) === "1";
}

export function rememberGullicubeFailure(storage: Pick<Storage, "setItem">): void {
  storage.setItem(SKIP_KEY, "1");
}

export function retryGullicube(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(SKIP_KEY);
}

function pack(moves: string[]): Solution {
  if (!moves.length) return { moves: [], chunkOfMove: [], chunks: [] };
  return {
    moves,
    chunkOfMove: moves.map(() => 0),
    chunks: [{
      id: "solve",
      stageId: "hold",
      stageNumber: 0,
      stageName: "Solve",
      title: "Solve",
      goal: "",
      why: "",
      caseName: "gullicube",
      hold: "",
      moves,
      focus: [],
      advice: "",
      tip: null,
      fingertricks: moves.map(() => ""),
    }],
  };
}

export interface ShorterRequest {
  facelets: string;
  probeBytes: number;
  timeSec: number;
  files: { name: string; url: string }[];
  /** Present only as a hint for logs. The worker still probes for real. */
  deviceMemory: number | null;
}

/**
 * Run gullicube in a dedicated worker. Allocation failure, a worker crash,
 * an abort, or the watchdog all terminate that worker and solve with the
 * reduction solver instead. Stopping the request does not fall back.
 */
export function solveShorter(options: {
  request: ShorterRequest;
  spawn: () => WorkerLike;
  timeoutMs: number;
  fallback: (facelets: string, progress?: (message: string) => void) => Promise<Solution>;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  remember?: (reason: string) => void;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}): Promise<ShorterOutcome> {
  const setTimer = options.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms) as unknown as number);
  const clearTimer = options.clearTimer ?? ((id) => window.clearTimeout(id));
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new SolveStopped());
      return;
    }
    let worker: WorkerLike;
    try {
      worker = options.spawn();
    } catch (error) {
      options.remember?.("spawn");
      options.fallback(options.request.facelets, options.onProgress).then(
        (solution) => resolve({ solution, engine: "reduction", note: FALLBACK_NOTE, reason: "spawn" }),
        reject,
      );
      return;
    }
    let settled = false;
    const finish = (solution: Solution) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      resolve({ solution, engine: "gullicube", note: null, reason: null });
    };
    const fallBack = (reason: string) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      options.remember?.(reason);
      options.onProgress?.("Solving with the standard 5×5 solver…");
      options.fallback(options.request.facelets, options.onProgress).then(
        (solution) => resolve({ solution, engine: "reduction", note: FALLBACK_NOTE, reason }),
        reject,
      );
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      worker.terminate();
      reject(new SolveStopped());
    };
    const timer = setTimer(() => fallBack("timeout"), options.timeoutMs);
    options.signal?.addEventListener("abort", onAbort);
    worker.onmessage = (event) => {
      const data = event.data;
      if (data.type === "progress") {
        options.onProgress?.(data.message);
        return;
      }
      if (data.type === "solution") finish(pack(data.moves));
      else fallBack(data.reason);
    };
    worker.onerror = () => fallBack("crash");
    worker.postMessage({ ...options.request, deviceMemory: options.request.deviceMemory ?? deviceMemoryHint() });
  });
}
