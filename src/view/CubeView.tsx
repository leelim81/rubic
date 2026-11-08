import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CubeScene, type CubeGesture } from "./cubeScene";

export interface CubeHandle {
  animate: (move: string, nextFacelets: string) => Promise<void>;
  show: (facelets: string) => void;
  resetView: () => void;
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
  turnMs?: number;
}

export const CubeView = forwardRef<CubeHandle, Props>(function CubeView(
  { facelets, highlight = [], letters, gesture, label, onTurn, onViewShift, onGesture, turnMs = 750 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CubeScene | null>(null);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new CubeScene(canvas, { reducedMotion: reduced, letters, gesture, onTurn, onViewShift, onGesture, turnMs });
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
    sceneRef.current?.setOptions({ letters, gesture, reducedMotion: reduced, onTurn, onViewShift, onGesture, turnMs });
  }, [letters, gesture, reduced, onTurn, onViewShift, onGesture, turnMs]);

  useEffect(() => {
    sceneRef.current?.setFacelets(facelets);
  }, [facelets]);

  useEffect(() => {
    sceneRef.current?.setHighlight(highlight);
  }, [highlight]);

  useImperativeHandle(ref, () => ({
    animate: async (move: string, nextFacelets: string) => {
      const scene = sceneRef.current;
      if (!scene) return;
      await scene.animateMove(move, nextFacelets);
    },
    show: (next: string) => sceneRef.current?.setFacelets(next),
    resetView: () => sceneRef.current?.resetView(),
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
