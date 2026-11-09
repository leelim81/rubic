import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Face } from "../cube/model";
import { CubeScene, type CubeGesture } from "./cubeScene";

export interface CubeHandle {
  animate: (move: string, nextFacelets: string, durationMs?: number) => Promise<boolean>;
  show: (facelets: string) => void;
  cancel: () => void;
  resetView: () => void;
  setPaintFace: (face: Face | null) => void;
  lookAt: (theta: number, phi: number, durationMs?: number) => Promise<void>;
}

interface Props {
  facelets: string;
  highlight?: number[];
  letters: boolean;
  gesture: CubeGesture;
  label: string;
  onTurn?: (move: string) => void;
  onViewShift?: (shifted: boolean) => void;
  onGesture?: (message: string | null) => void;
  onPaint?: (index: number) => void;
  paintFace?: Face | null;
  idle?: boolean;
  turnMs?: number;
}

export const CubeView = forwardRef<CubeHandle, Props>(function CubeView(
  { facelets, highlight = [], letters, gesture, label, onTurn, onViewShift, onGesture, onPaint, paintFace = null, idle = false, turnMs = 750 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CubeScene | null>(null);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new CubeScene(canvas, { reducedMotion: reduced, letters, gesture, onTurn, onViewShift, onGesture, onPaint, paintFace, idle, turnMs });
    sceneRef.current = scene;
    scene.setFacelets(facelets);
    scene.setHighlight(highlight);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // The scene is created once; later prop updates go through the setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setOptions({ letters, gesture, reducedMotion: reduced, onTurn, onViewShift, onGesture, onPaint, paintFace, idle, turnMs });
  }, [letters, gesture, reduced, onTurn, onViewShift, onGesture, onPaint, paintFace, idle, turnMs]);

  useEffect(() => {
    sceneRef.current?.setFacelets(facelets);
  }, [facelets]);

  useEffect(() => {
    sceneRef.current?.setHighlight(highlight);
  }, [highlight]);

  useImperativeHandle(ref, () => ({
    animate: async (move: string, nextFacelets: string, durationMs?: number) => {
      const scene = sceneRef.current;
      if (!scene) return false;
      return scene.animateMove(move, nextFacelets, durationMs);
    },
    show: (next: string) => sceneRef.current?.setFacelets(next),
    cancel: () => sceneRef.current?.cancelAnimation(),
    resetView: () => sceneRef.current?.resetView(),
    setPaintFace: (face: Face | null) => sceneRef.current?.setPaintFace(face),
    lookAt: (theta: number, phi: number, durationMs?: number) => sceneRef.current?.lookAt(theta, phi, durationMs) ?? Promise.resolve(),
  }));

  return (
    <canvas
      ref={canvasRef}
      className={`cube-canvas gesture-${gesture}`}
      role="img"
      aria-label={label}
    />
  );
});
