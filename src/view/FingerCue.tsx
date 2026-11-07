import { useId } from "react";

/**
 * Original schematic hand. The long finger is the one that pushes,
 * and it travels in the same direction as the stickers on that move.
 */
type Motion = "left" | "right" | "up" | "down" | "half";

const MOTION: Record<string, Motion> = {
  U: "left",
  "U'": "right",
  U2: "half",
  D: "right",
  "D'": "left",
  D2: "half",
  R: "up",
  "R'": "down",
  R2: "half",
  L: "down",
  "L'": "up",
  L2: "half",
  F: "right",
  "F'": "left",
  F2: "half",
  B: "left",
  "B'": "right",
  B2: "half",
  y: "left",
  "y'": "right",
  y2: "half",
  x: "down",
  "x'": "up",
  x2: "half",
  z: "right",
  "z'": "left",
  z2: "half",
};

const CAPTION: Record<Motion, string> = {
  left: "Finger pushes left",
  right: "Finger pushes right",
  up: "Finger pushes up",
  down: "Finger pushes down",
  half: "Either way, halfway",
};

export function FingerCue({ move }: { move: string }) {
  const marker = useId().replace(/:/g, "");
  const motion = MOTION[move] ?? "up";
  const vertical = motion === "up" || motion === "down" || (motion === "half" && "RL".includes(move[0] ?? ""));
  return (
    <figure className="hand-figure">
      <svg className="finger-cue" viewBox="0 0 180 110" role="img" aria-label={`Schematic hand for ${move}. ${CAPTION[motion]}.`}>
        <rect x="16" y="28" width="58" height="58" rx="6" className="finger-cube" />
        <path d="M16 28 H74 V40 H28 V86 H16 Z" className="finger-cube-top" />
        {vertical ? <VerticalHand motion={motion} marker={marker} /> : <HorizontalHand motion={motion} marker={marker} />}
        <defs>
          <marker id={marker} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
          </marker>
        </defs>
      </svg>
      <figcaption>{CAPTION[motion]}</figcaption>
    </figure>
  );
}

function VerticalHand({ motion, marker }: { motion: Motion; marker: string }) {
  const up = motion !== "down";
  return (
    <g className={`schematic-hand motion-${motion}`}>
      <ellipse cx="128" cy="78" rx="26" ry="16" className="palm" />
      <rect x="112" y="62" width="7" height="16" rx="3" className="finger-stub" />
      <rect x="122" y="60" width="7" height="18" rx="3" className="finger-stub" />
      <rect x="142" y="64" width="7" height="14" rx="3" className="finger-stub" />
      <g className="moving-finger">
        <rect x="130" y="26" width="9" height="40" rx="4.5" className="index" />
        <circle cx="134.5" cy="26" r="6" className="fingertip" />
        <path d={up ? "M148 52 V24" : "M148 22 V50"} className="finger-arrow" markerEnd={`url(#${marker})`} />
      </g>
    </g>
  );
}

function HorizontalHand({ motion, marker }: { motion: Motion; marker: string }) {
  const left = motion !== "right";
  return (
    <g className={`schematic-hand motion-${motion}`}>
      <ellipse cx="132" cy="78" rx="28" ry="15" className="palm" />
      <rect x="108" y="66" width="14" height="7" rx="3" className="finger-stub" />
      <rect x="108" y="76" width="16" height="7" rx="3" className="finger-stub" />
      <rect x="112" y="86" width="12" height="7" rx="3" className="finger-stub" />
      <g className="moving-finger">
        <rect x="78" y="18" width="42" height="9" rx="4.5" className="index" />
        <circle cx={left ? 78 : 120} cy="22.5" r="6" className="fingertip" />
        <path d={left ? "M112 12 H76" : "M78 12 H114"} className="finger-arrow" markerEnd={`url(#${marker})`} />
      </g>
    </g>
  );
}
