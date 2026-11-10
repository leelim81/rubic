import { parentPort } from "node:worker_threads";

parentPort.on("message", () => {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    // Occupies this worker on purpose. The page watchdog must still fire.
  }
});
