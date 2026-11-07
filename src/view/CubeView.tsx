import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CubeScene } from "./cubeScene";

export interface CubeHandle {
  animate: (move: string, nextFacelets: string) => Promise<void>;
  resetView: () => void;
}

interface Props {
  facelets: string;
  highlight?: number[];
  letters: boolean;
  turns: boolean;
  label: string;
  onTurn?: (move: string) => void;
  onViewShift?: (shifted: boolean) => void;
}

export const CubeView = forwardRef<CubeHandle, Props>(function CubeView(
  { facelets, highlight = [], letters, turns, label, onTurn, onViewShift },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CubeScene | null>(null);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new CubeScene(canvas, { reducedMotion: reduced, letters, turns, onTurn, onViewShift });
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
    sceneRef.current?.setOptions({ letters, turns, reducedMotion: reduced, onTurn, onViewShift });
  }, [letters, turns, reduced, onTurn, onViewShift]);

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
      await scene.animateMove(move);
      scene.setFacelets(nextFacelets);
    },
    resetView: () => sceneRef.current?.resetView(),
  }));

  return (
    <canvas
      ref={canvasRef}
      className="cube-canvas"
      role="img"
      aria-label={label}
    />
  );
});
