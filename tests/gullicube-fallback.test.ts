import { describe, expect, it } from "vitest";
import { applyFiveString, solvedFiveString } from "../src/cube/five";
import { solveFive } from "../src/solver/fiveSolve";
import { FALLBACK_NOTE, solveShorter, type WorkerLike } from "../src/gullicube/client";
import { DownloadCancelled, cacheHasAll, downloadSolver, formatDownload, type CacheStore } from "../src/gullicube/download";
import { gullicubeMoves, toGullicubeFacelets } from "../src/gullicube/moves";
import { deviceMemoryHint, probeWasmMemory } from "../src/gullicube/probe";
import { applySim, simString, solvedSim } from "./fiveSim";

class FakeWorker implements WorkerLike {
  terminated = false;
  onmessage: WorkerLike["onmessage"] = null;
  onerror: WorkerLike["onerror"] = null;
  constructor(private readonly react: (worker: FakeWorker) => void) {}
  postMessage(): void {
    this.react(this);
  }
  terminate(): void {
    this.terminated = true;
  }
}

function timers() {
  return {
    setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    clearTimer: (id: number) => clearTimeout(id),
  };
}

async function solveWith(react: (worker: FakeWorker) => void, timeoutMs = 500) {
  const worker = { current: null as FakeWorker | null };
  let fallbackCalls = 0;
  const outcome = await solveShorter({
    request: {
      facelets: solvedFiveString(),
      probeBytes: 65536,
      timeSec: 1,
      files: [],
      deviceMemory: 0.25,
    },
    spawn: () => {
      worker.current = new FakeWorker(react);
      return worker.current;
    },
    timeoutMs,
    fallback: async (facelets) => {
      fallbackCalls += 1;
      return solveFive(facelets);
    },
    ...timers(),
  });
  return { outcome, worker: worker.current!, fallbackCalls };
}

describe("gullicube fallback", () => {
  it("maps colours and keeps middle-slice moves", () => {
    expect(toGullicubeFacelets("yogwrb")).toBe("URFDLB");
    expect(gullicubeMoves(" ignore\n 3U2 2R' Uw\n")).toEqual(["3U2", "2R'", "Uw"]);
  });

  it("probes by allocating and rejects an impossible reservation", () => {
    probeWasmMemory(65536);
    expect(() => probeWasmMemory(131072 * 65536)).toThrow(RangeError);
    expect(deviceMemoryHint() === null || typeof deviceMemoryHint() === "number").toBe(true);
  });

  it("still starts the worker when deviceMemory is only a hint", async () => {
    const { outcome, worker } = await solveWith((current) => {
      current.onmessage?.({ data: { type: "solution", moves: ["U"] } });
    });
    expect(worker.terminated).toBe(true);
    expect(outcome.engine).toBe("gullicube");
    expect(outcome.note).toBeNull();
    expect(outcome.solution.moves).toEqual(["U"]);
  });

  it("falls back when the memory probe fails", async () => {
    const { outcome, worker, fallbackCalls } = await solveWith((current) => {
      current.onmessage?.({ data: { type: "fallback", reason: "allocation" } });
    });
    expect(worker.terminated).toBe(true);
    expect(fallbackCalls).toBe(1);
    expect(outcome.engine).toBe("reduction");
    expect(outcome.note).toBe(FALLBACK_NOTE);
    expect(outcome.solution.moves).toEqual([]);
  });

  it("falls back when the worker crashes", async () => {
    const { outcome, worker } = await solveWith((current) => {
      current.onerror?.({ message: "unreachable" });
    });
    expect(worker.terminated).toBe(true);
    expect(outcome.engine).toBe("reduction");
    expect(outcome.note).toBe(FALLBACK_NOTE);
  });

  it("falls back on the watchdog while a worker is stuck, without blocking the caller", async () => {
    let returned = false;
    const pending = solveWith(() => undefined, 30).then((result) => {
      returned = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(returned).toBe(false);
    const { outcome, worker } = await pending;
    expect(worker.terminated).toBe(true);
    expect(outcome.engine).toBe("reduction");
    expect(outcome.note).toBe(FALLBACK_NOTE);
  });

  it("terminates a spinning worker from the watchdog", async () => {
    const threads = await import("node:worker_threads") as unknown as {
      Worker: new (filename: string) => {
        on(event: "message", listener: (value: unknown) => void): void;
        on(event: "error", listener: (error: Error) => void): void;
        postMessage(message: unknown): void;
        terminate(): Promise<number>;
      };
    };
    const started = Date.now();
    const outcome = await solveShorter({
      request: { facelets: solvedFiveString(), probeBytes: 65536, timeSec: 1, files: [], deviceMemory: 8 },
      spawn: () => {
        const inner = new threads.Worker(new URL("./block-worker.mjs", import.meta.url).pathname);
        const adapter: WorkerLike = {
          onmessage: null,
          onerror: null,
          postMessage: (message) => inner.postMessage(message),
          terminate: () => { void inner.terminate(); },
        };
        inner.on("message", (data) => adapter.onmessage?.({ data: data as { type: "solution"; moves: string[] } }));
        inner.on("error", (error) => adapter.onerror?.({ message: error.message }));
        return adapter;
      },
      timeoutMs: 200,
      fallback: async (facelets) => solveFive(facelets),
      ...timers(),
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(outcome.engine).toBe("reduction");
    expect(outcome.note).toBe(FALLBACK_NOTE);
  });

  it("downloads with progress, serves a cache hit, and can be cancelled", async () => {
    const stored = new Map<string, Response>();
    const cache: CacheStore = {
      async match(url) { return stored.get(url); },
      async put(url, response) { stored.set(url, response.clone()); },
      async keys() { return [...stored.keys()]; },
    };
    const files = [
      { url: "https://example.test/a", bytes: 4 },
      { url: "https://example.test/b", bytes: 4 },
    ];
    const seen: number[] = [];
    await downloadSolver({
      files,
      cache,
      fetchImpl: async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
      onProgress: (progress) => seen.push(progress.received),
    });
    expect(formatDownload({ received: 4_000_000, total: 8_000_000 })).toBe("4.0 / 8.0 MB · 50%");
    expect(seen.at(-1)).toBe(8);
    expect(await cacheHasAll(cache, files.map((file) => file.url))).toBe(true);
    let fetches = 0;
    await downloadSolver({
      files,
      cache,
      fetchImpl: async () => {
        fetches += 1;
        return new Response();
      },
    });
    expect(fetches).toBe(0);
    const controller = new AbortController();
    controller.abort();
    await expect(downloadSolver({
      files: [{ url: "https://example.test/c", bytes: 1 }],
      cache,
      signal: controller.signal,
      fetchImpl: async () => new Response("x"),
    })).rejects.toBeInstanceOf(DownloadCancelled);
  });

  it("verifies a known shorter solution with the independent simulator", () => {
    const fromFace: Record<string, string> = { U: "y", R: "o", F: "g", D: "w", L: "r", B: "b" };
    const facelets = "RLFLUDUUFUDUUFUDUUFUBLLDLURRRRURRRFUUBBFURRRFURRRFUFFRFFFFDFBRRRBBFFDFBDDDFLRRBRUDDBBUDDBBUDDBBLBBBDBLLLLDLLLRFDFFDDLLLDDLLLDBBDBDRBLBFRBLBULULUFRULUF"
      .split("").map((letter) => fromFace[letter]!).join("");
    const moves = gullicubeMoves(` 3U' U' D F2 L U D' F' U R R2 U' 2L2 B 2U2 B' 2R2 L' D' 2L D2 2R2 D' L B2 2L 2D F' 2D2 F 2D' B L2 F' 2D
 F L2 B 2B2 2U 2B' 2U 2B' 2L2 2U2 2L2 U2 R2 2R' 2D' 2R 2D R2 U2 2R' F' 2U' 3L2 2U 3L2 F 2R 2U2 2L2 2U2
 2D2 2L2 2D' B' 2D' 3L2 2D 3L2 B 2D' 2U' 2L D' 2B2 2R 2B2 2R' D 2L' 2U 2R2 D 3F' 2D 3F2 2D' 3F' D' 2R2`);
    const painted = solvedSim().map((sticker, index) => ({ ...sticker, color: facelets[index]! }));
    expect(simString(applySim(painted, moves))).toBe(solvedFiveString());
    expect(applyFiveString(facelets, moves)).toBe(solvedFiveString());
  });
});
