import { applyMoves, matchesCenters, solvedBytes } from "../cube/model";

/** Combine adjacent turns of the same face. R R R becomes R', and four quarters disappear. */
export function cancelMoves(moves: string[]): string[] {
  const stacked: { face: string; quarters: number }[] = [];
  for (const move of moves) {
    if (!move) continue;
    const face = move[0] ?? "";
    const quarters = move.endsWith("2") ? 2 : move.endsWith("'") ? 3 : 1;
    const last = stacked[stacked.length - 1];
    if (last && last.face === face) {
      last.quarters = (last.quarters + quarters) % 4;
      if (last.quarters === 0) stacked.pop();
    } else {
      stacked.push({ face, quarters });
    }
  }
  return stacked.map((item) => (item.quarters === 2 ? `${item.face}2` : item.quarters === 3 ? `${item.face}'` : item.face));
}

/** Drop adjacent duplicates and any stretch of moves that leaves a solved cube solved. */
export function normalizePlan(moves: string[]): string[] {
  let current = cancelMoves(moves);
  for (let guard = 0; guard < current.length + 2; guard++) {
    const identity = findIdentity(current);
    if (!identity) return current;
    current = cancelMoves([...current.slice(0, identity.start), ...current.slice(identity.end)]);
  }
  return current;
}

function findIdentity(moves: string[]): { start: number; end: number } | null {
  for (let length = moves.length; length >= 1; length--) {
    for (let start = 0; start + length <= moves.length; start++) {
      if (isIdentity(moves.slice(start, start + length))) return { start, end: start + length };
    }
  }
  return null;
}

function isIdentity(moves: string[]): boolean {
  if (!moves.length) return false;
  return matchesCenters(applyMoves(solvedBytes(), moves));
}
