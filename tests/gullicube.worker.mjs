import { parentPort } from "node:worker_threads";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(process.cwd(), "public/gullicube");
const dataDir = join(root, "data");
const tables = readdirSync(dataDir).filter((name) => name.endsWith(".cls"));
const factory = (await import(pathToFileURL(join(root, "gullicube.js")).href)).default;
const TO_FACE = { y: "U", o: "R", g: "F", w: "D", r: "L", b: "B" };

function movesFrom(stdout) {
  const moves = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(" ")) continue;
    for (const token of line.trim().split(/\s+/)) {
      if (/^(?:[23]?[URFDLB]w?|[URFDLB]w)(?:'|2)?$/.test(token)) moves.push(token);
    }
  }
  return moves;
}

parentPort.on("message", async (text) => {
  const started = Date.now();
  try {
    const facelets = [...text].map((letter) => TO_FACE[letter]).join("");
    const input = `${facelets}\n`;
    let cursor = 0;
    const lines = [];
    const module = await factory({
      print: (line) => lines.push(line),
      printErr: () => undefined,
      stdin: () => (cursor < input.length ? input.charCodeAt(cursor++) : null),
      preRun: [(mod) => {
        mod.FS.mkdir("/data");
        for (const name of tables) mod.FS.writeFile(`/data/${name}`, readFileSync(join(dataDir, name)));
      }],
    });
    module.callMain(["5", "-f", "-o", "-t", "1", "--time", "16"]);
    const moves = movesFrom(lines.join("\n"));
    parentPort.postMessage({
      ok: moves.length > 0,
      moves,
      error: moves.length ? undefined : "no solution",
      ms: Date.now() - started,
    });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started });
  }
});
