import { gullicubeMoves, toGullicubeFacelets } from "../gullicube/moves";
import { probeWasmMemory } from "../gullicube/probe";

interface SolveRequest {
  facelets: string;
  probeBytes: number;
  timeSec: number;
  files: { name: string; url: string }[];
  deviceMemory: number | null;
}

interface WasmModule {
  callMain: (args: string[]) => number;
  FS: {
    mkdir: (path: string) => void;
    writeFile: (path: string, data: Uint8Array) => void;
  };
}

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<SolveRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

worker.onmessage = (event) => {
  void solve(event.data);
};

async function solve(request: SolveRequest): Promise<void> {
  if (request.deviceMemory !== null && request.deviceMemory < 2) {
    worker.postMessage({ type: "progress", message: "This device reports limited memory. Trying the shorter solver anyway…" });
  }
  try {
    probeWasmMemory(request.probeBytes);
  } catch (error) {
    worker.postMessage({ type: "fallback", reason: error instanceof RangeError ? "allocation" : "probe" });
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  const lines: string[] = [];
  try {
    worker.postMessage({ type: "progress", message: "Loading the shorter solver…" });
    const bytes = new Map<string, Uint8Array>();
    for (const file of request.files) {
      const response = await caches.match(file.url);
      if (!response) throw new Error(`Missing ${file.name}`);
      bytes.set(file.name, new Uint8Array(await response.arrayBuffer()));
    }
    const js = bytes.get("gullicube.js");
    const wasm = bytes.get("gullicube.wasm");
    if (!js || !wasm) throw new Error("The shorter solver is incomplete.");
    const jsUrl = request.files.find((file) => file.name === "gullicube.js")?.url;
    if (!jsUrl) throw new Error("The shorter solver script is missing.");
    const wasmBytes = new Uint8Array(wasm.byteLength);
    wasmBytes.set(wasm);
    const wasmUrl = URL.createObjectURL(new Blob([wasmBytes], { type: "application/wasm" }));
    const imported = await import(/* @vite-ignore */ jsUrl) as { default?: (options: unknown) => Promise<WasmModule> };
    const factory = imported.default;
    if (!factory) throw new Error("The shorter solver could not start.");
    const input = `${toGullicubeFacelets(request.facelets)}\n`;
    let cursor = 0;
    const module = await factory({
      locateFile: () => wasmUrl,
      print: (text: string) => lines.push(text),
      printErr: () => undefined,
      stdin: () => (cursor < input.length ? input.charCodeAt(cursor++) : null),
      preRun: [(mod: WasmModule) => {
        mod.FS.mkdir("/data");
        for (const file of request.files) {
          const base = file.name.split("/").pop() ?? file.name;
          if (!base.endsWith(".cls")) continue;
          const data = bytes.get(file.name);
          if (data) mod.FS.writeFile(`/data/${base}`, data);
        }
      }],
    });
    worker.postMessage({ type: "progress", message: "Searching for a shorter solution…" });
    module.callMain(["5", "-f", "-o", "-t", "1", "--time", String(request.timeSec)]);
    const moves = gullicubeMoves(lines.join("\n"));
    if (!moves.length) {
      worker.postMessage({ type: "fallback", reason: "no-solution" });
      return;
    }
    worker.postMessage({ type: "solution", moves });
  } catch (error) {
    const moves = gullicubeMoves(lines.join("\n"));
    if (moves.length) {
      worker.postMessage({ type: "solution", moves });
      return;
    }
    const reason = error instanceof RangeError ? "allocation" : `runtime: ${error instanceof Error ? error.message : String(error)}`;
    worker.postMessage({ type: "fallback", reason });
  }
}
