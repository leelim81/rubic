import { useId } from "react";

/** Original schematic. The dot is a fingertip and the arrow is the turn direction. */
const PATHS: Record<string, { d: string; dot: [number, number] }> = {
  U: { d: "M92 36 H34", dot: [92, 36] },
  "U'": { d: "M28 36 H86", dot: [28, 36] },
  U2: { d: "M28 28 H86 M92 44 H34", dot: [54, 36] },
  D: { d: "M28 36 H86", dot: [28, 36] },
  "D'": { d: "M92 36 H34", dot: [92, 36] },
  D2: { d: "M28 28 H86 M92 44 H34", dot: [54, 36] },
  R: { d: "M60 62 V18", dot: [60, 62] },
  "R'": { d: "M60 14 V58", dot: [60, 14] },
  R2: { d: "M48 16 V58 M72 58 V16", dot: [60, 36] },
  L: { d: "M60 14 V58", dot: [60, 14] },
  "L'": { d: "M60 62 V18", dot: [60, 62] },
  L2: { d: "M48 16 V58 M72 58 V16", dot: [60, 36] },
  F: { d: "M28 24 H86", dot: [28, 24] },
  "F'": { d: "M92 24 H34", dot: [92, 24] },
  F2: { d: "M28 20 H86 M92 32 H34", dot: [54, 26] },
  B: { d: "M92 24 H34", dot: [92, 24] },
  "B'": { d: "M28 24 H86", dot: [28, 24] },
  B2: { d: "M28 20 H86 M92 32 H34", dot: [54, 26] },
  y: { d: "M92 36 H34", dot: [92, 36] },
  "y'": { d: "M28 36 H86", dot: [28, 36] },
  y2: { d: "M28 28 H86 M92 44 H34", dot: [54, 36] },
  x: { d: "M60 14 V58", dot: [60, 14] },
  "x'": { d: "M60 62 V18", dot: [60, 62] },
  x2: { d: "M48 16 V58 M72 58 V16", dot: [60, 36] },
  z: { d: "M28 24 H86", dot: [28, 24] },
  "z'": { d: "M92 24 H34", dot: [92, 24] },
  z2: { d: "M28 20 H86 M92 32 H34", dot: [54, 26] },
};

export function FingerCue({ move }: { move: string }) {
  const id = useId().replace(/:/g, "");
  const cue = PATHS[move] ?? PATHS.U!;
  return (
    <svg className="finger-cue" viewBox="0 0 120 76" role="img" aria-label={`Schematic cue for ${move}`}>
      <rect x="36" y="18" width="48" height="40" rx="5" className="finger-cube" />
      <path d={cue.d} className="finger-arrow" markerEnd={`url(#${id})`} />
      <circle cx={cue.dot[0]} cy={cue.dot[1]} r="6.5" className="finger-dot" />
      <defs>
        <marker id={id} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}
