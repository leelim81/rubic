import { solveFive } from "../solver/fiveSolve";
import { solveBeginner } from "../solver/beginner";
import { solveCube } from "../solver/twoPhase";

self.onmessage = (event: MessageEvent<{ facelets: string; method?: "beginner" | "expert" | "short" }>) => {
  try {
    if (event.data.facelets.length === 150) {
      const solution = solveFive(event.data.facelets, (progress) => self.postMessage({ progress }));
      self.postMessage({ solution });
      return;
    }
    const expert = event.data.method === "expert" || event.data.method === "short" || !event.data.method;
    const solution = expert ? solveCube(event.data.facelets) : solveBeginner(event.data.facelets);
    self.postMessage({ solution });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "The cube could not be solved." });
  }
};
