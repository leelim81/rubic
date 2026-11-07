import { solveBeginner } from "../solver/beginner";

self.onmessage = (event: MessageEvent<{ facelets: string }>) => {
  try {
    const solution = solveBeginner(event.data.facelets);
    self.postMessage({ solution });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "The cube could not be solved." });
  }
};
