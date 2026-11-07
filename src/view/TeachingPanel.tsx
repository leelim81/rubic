import { useEffect, useMemo, useRef, useState } from "react";
import { applyMoves, faceletsToString, stringToFacelets } from "../cube/model";
import type { TeachingChunk } from "../solver/beginner";
import { CubeView } from "./CubeView";
import { FingerCue } from "./FingerCue";

interface Props {
  facelets: string;
  chunk: TeachingChunk | null;
  suffix: string[];
  doneInChunk: number;
  solved: boolean;
}

export function TeachingPanel({ facelets, chunk, suffix, doneInChunk, solved }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [frame, setFrame] = useState(0);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setPlaying(false);
    setFrame(0);
  }, [facelets, chunk?.id, suffix.join(" ")]);

  useEffect(() => {
    if (!playing) return;
    const delay = reduced ? 700 : 900 / speed;
    timer.current = window.setTimeout(() => {
      setFrame((value) => {
        if (value >= suffix.length) return 0;
        return value + 1;
      });
    }, delay);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [playing, frame, speed, suffix.length, reduced]);

  const demoFacelets = useMemo(() => {
    return faceletsToString(applyMoves(stringToFacelets(facelets), suffix.slice(0, frame)));
  }, [facelets, suffix, frame]);

  const shown = Math.min(frame === 0 ? 0 : frame - 1, Math.max(0, suffix.length - 1));
  const move = suffix[shown] ?? "";
  const trick = chunk ? chunk.fingertricks[doneInChunk + shown] : "";

  return (
    <section className="panel teaching" aria-labelledby="teaching-title">
      <header className="panel-head">
        <p className="eyebrow">Demonstration · copy of this cube</p>
        <h2 id="teaching-title">{solved ? "Solved" : chunk?.title ?? "Ready when you are"}</h2>
      </header>
      {solved ? (
        <p className="lead">Every face matches its centre. Scramble again or scan another cube to practise a new start.</p>
      ) : chunk ? (
        <>
          <p className="case">{chunk.caseName}</p>
          <p className="goal"><strong>Goal.</strong> {chunk.goal}</p>
          <p><strong>On this cube.</strong> {chunk.advice}</p>
          <p className="why"><strong>Why.</strong> {chunk.why}</p>
          {chunk.tip ? <p className="tip"><strong>Reusable idea, not a camera reading.</strong> {chunk.tip}</p> : null}
          <p className="hold">{chunk.hold}</p>
          {doneInChunk > 0 ? (
            <p className="midchunk">You are partway through this step ({doneInChunk} of {chunk.moves.length} done). The demonstration continues from the cube as it is now. It does not rewind the lesson.</p>
          ) : null}
          <ol className="alg" aria-label="Moves in this step">
            {chunk.moves.map((token, index) => (
              <li key={`${token}-${index}`} className={index < doneInChunk ? "done" : index === doneInChunk + frame - (frame > 0 ? 0 : 0) && index >= doneInChunk && index < doneInChunk + frame ? "now" : ""}>
                <span>{token}</span>
              </li>
            ))}
          </ol>
          <div className="demo-layout">
            <div className="demo-stage">
              <CubeView
                facelets={demoFacelets}
                highlight={frame === 0 ? chunk.focus : []}
                letters
                turns={false}
                label="Demonstration cube. Playing it does not change your lesson."
              />
            </div>
            <div className="demo-side">
              {move ? <FingerCue move={move} /> : null}
              <p className="trick">{trick || "Follow the move letters. They refer to the hold, not the camera."}</p>
              <div className="transport" role="group" aria-label="Demonstration playback">
                <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
                <button type="button" onClick={() => { setPlaying(false); setFrame(0); }}>Repeat</button>
                <label>
                  Speed
                  <select className="speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Demonstration speed">
                    <option value={0.6}>0.6×</option>
                    <option value={1}>1×</option>
                    <option value={1.6}>1.6×</option>
                    <option value={2.2}>2.2×</option>
                  </select>
                </label>
              </div>
              <label className="scrub">
                Scrub
                <input
                  type="range"
                  min={0}
                  max={suffix.length}
                  value={frame}
                  onChange={(event) => {
                    setPlaying(false);
                    setFrame(Number(event.target.value));
                  }}
                  aria-valuetext={frame === 0 ? "Start of the demonstration" : `After ${suffix.slice(0, frame).join(" ")}`}
                />
              </label>
              {reduced ? <p className="quiet">Reduced motion is on, so the demonstration steps from state to state instead of sliding.</p> : null}
            </div>
          </div>
        </>
      ) : (
        <p className="lead">Scramble the lesson cube, or scan the one in your hands. The demonstration will copy that exact position.</p>
      )}
    </section>
  );
}
