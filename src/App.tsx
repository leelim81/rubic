import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COLORS, type ColorName, applyMoves, centerColor, faceletsToString, moveDirection, mulberry32, randomScramble, solvedBytes, stringToFacelets } from "./cube/model";
import { PAINT_FACES, PAINT_GUIDE, blankCount, blankMessage, blankPaint, faceAfterFailedDone, facePose, filledOnFace, faceletIndex, isCentre, paintErrorMessage } from "./view/paint";
import { playPaintError } from "./view/paintSound";
import { STICKER_MARK } from "./view/contrast";
import { validateFaceletString } from "./cube/validate";
import { solveInWorker, type SolveMethod } from "./solveClient";
import {
  advanceLesson,
  applyUserMove,
  beginAnimation,
  branchFrom,
  cloneLesson,
  currentFacelets,
  commitTurn,
  decideTurn,
  emptyLesson,
  endAnimation,
  invertMove,
  progressLabel,
  solvingHeadline,
  stepBack,
  stepForward,
  withSolution,
  type Lesson,
} from "./state/lesson";
import { CubeView, type CubeHandle } from "./view/CubeView";
import { Disclosure } from "./view/Disclosure";

const SOLVED = faceletsToString(solvedBytes());
const STORAGE = "rubic-lesson-v1";
const ENTERED = "rubic-entered-v1";
const METHOD_KEY = "rubic-method-v1";

export function App() {
  const [entered, setEntered] = useState(() => readEntered());
  const [lesson, setLesson] = useState<Lesson>(() => loadLesson());
  const [letters, setLetters] = useState(true);
  const [mode, setMode] = useState<"cube" | "paint">("cube");
  const [paintCells, setPaintCells] = useState(SOLVED);
  const [paintColor, setPaintColor] = useState<ColorName>("white");
  const [paintStep, setPaintStep] = useState(0);
  const [paintError, setPaintError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [checkpoint, setCheckpoint] = useState<Lesson | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gestureNote, setGestureNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cubeRef = useRef<CubeHandle>(null);
  const flight = useRef(false);
  const solvingRef = useRef(false);
  const runToken = useRef(0);
  const shakeTimer = useRef(0);
  const lessonRef = useRef(lesson);
  const [turnMs, setTurnMs] = useState(750);
  const [method, setMethod] = useState<SolveMethod>(readMethod);
  lessonRef.current = lesson;
  const facelets = currentFacelets(lesson);
  const nextMove = lesson.moves[lesson.cursor];
  const labels = progressLabel(lesson);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const onGesture = useCallback((message: string | null) => setGestureNote(message), []);

  useEffect(() => {
    const payload = JSON.stringify({ start: lesson.start, moves: lesson.moves, chunkOfMove: lesson.chunkOfMove, chunks: lesson.chunks, cursor: lesson.cursor, history: lesson.history });
    sessionStorage.setItem(STORAGE, payload);
    if (entered) {
      localStorage.setItem(ENTERED, "1");
      localStorage.setItem(STORAGE, payload);
    } else {
      localStorage.removeItem(ENTERED);
      localStorage.removeItem(STORAGE);
    }
  }, [lesson, entered]);

  useEffect(() => {
    try {
      localStorage.setItem(METHOD_KEY, method);
    } catch {
      // Private mode can block storage. The choice still applies for this visit.
    }
  }, [method]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mode === "paint") {
        leavePaint();
        return;
      }
      if (mode !== "cube") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.key === "n" || event.key === "N") void run(() => go(1));
      if (event.key === "p" || event.key === "P" || event.key === "Backspace") void run(() => go(-1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, lesson, loading, facelets, nextMove]);

  useLayoutEffect(() => {
    if (mode !== "cube") return;
    document.getElementById("cube-title")?.scrollIntoView({ block: "nearest" });
  }, [lesson.start, mode]);

  async function run(task: () => Promise<void>) {
    if (flight.current) return;
    flight.current = true;
    try {
      await task();
    } finally {
      flight.current = false;
    }
  }

  async function load(start: string, notice: string | null = null, chosen: SolveMethod = method) {
    setLoading(true);
    setError(null);
    try {
      const solution = await solveInWorker(start, chosen);
      setEntered(true);
      setLesson((current) => withSolution({ ...current, history: [] }, start, solution, notice));
      setCheckpoint(null);
      setMode("cube");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The solution could not be prepared.");
    } finally {
      setLoading(false);
    }
  }

  async function go(direction: 1 | -1) {
    if (lesson.busy || loading) return;
    if (lesson.pending && direction === 1 && lesson.pending.intent === "do") {
      await userTurn(lesson.pending.move);
      return;
    }
    if (lesson.pending && direction === -1) {
      await userTurn(invertMove(lesson.pending.move));
      return;
    }
    if (direction === 1 && !nextMove) return;
    if (direction === -1 && lesson.cursor === 0) {
      if (lesson.history.length) setLesson((current) => stepBack(current));
      return;
    }
    const move = direction === 1 ? nextMove! : invert(lesson.moves[lesson.cursor - 1] ?? "");
    if (!move) return;
    const nextFacelets = direction === 1
      ? applyUserMove(facelets, move)
      : currentFacelets(stepBack(lesson));
    setLesson((current) => beginAnimation(current));
    await cubeRef.current?.animate(move, nextFacelets);
    setLesson((current) => endAnimation(direction === 1 ? stepForward({ ...current, busy: false }) : stepBack({ ...current, busy: false })));
  }

  async function userTurn(move: string) {
    if (lesson.busy || loading) return;
    const choice = decideTurn(lesson, move);
    if (choice === "forward") {
      setGestureNote(null);
      await go(1);
      return;
    }
    if (choice === "back") {
      setGestureNote(null);
      if (lesson.cursor === 0) {
        const restored = stepBack(lesson);
        setLesson((current) => beginAnimation(current));
        await cubeRef.current?.animate(move, currentFacelets(restored));
        setLesson((current) => endAnimation(stepBack({ ...current, busy: false })));
        return;
      }
      await go(-1);
      return;
    }
    if (choice === "reject" || choice === "start-half" || choice === "start-undo" || choice === "finish-half" || choice === "finish-undo" || choice === "cancel-pending") {
      const result = commitTurn(lesson, move);
      if (!result.animate) {
        setLesson(result.lesson);
        return;
      }
      setGestureNote(null);
      setLesson((current) => beginAnimation(current));
      await cubeRef.current?.animate(result.animate, currentFacelets(result.lesson));
      setLesson(() => endAnimation(result.lesson));
      return;
    }
    const next = applyUserMove(facelets, move);
    setLesson((current) => beginAnimation(current));
    await cubeRef.current?.animate(move, next);
    setLoading(true);
    try {
      const solution = await solveInWorker(next, method);
      setCheckpoint(null);
      setLesson((current) => endAnimation(branchFrom(current, next, solution, move, `${move} starts a new solution. ${invertMove(move)} returns to the previous one.`)));
    } catch (caught) {
      setLesson((current) => endAnimation(current));
      setError(caught instanceof Error ? caught.message : "That turn could not be used.");
      await cubeRef.current?.animate("", facelets);
    } finally {
      setLoading(false);
    }
  }

  async function replayMove() {
    const move = lesson.cursor > 0 ? lesson.moves[lesson.cursor - 1] : nextMove;
    if (!move) return;
    const after = lesson.cursor > 0 ? facelets : applyUserMove(facelets, move);
    const before = lesson.cursor > 0 ? currentFacelets({ ...lesson, cursor: lesson.cursor - 1, pending: null, busy: false }) : facelets;
    setLesson((current) => beginAnimation(current));
    cubeRef.current?.show(before);
    await cubeRef.current?.animate(move, after);
    if (lesson.cursor === 0) await cubeRef.current?.animate(invert(move), facelets);
    setLesson((current) => endAnimation(current));
  }

  async function solveFast() {
    if (solvingRef.current || flight.current || loading) return;
    const start = lessonRef.current;
    if (!advanceLesson(start)) return;
    solvingRef.current = true;
    flight.current = true;
    const token = ++runToken.current;
    const snap = cloneLesson(start);
    setCheckpoint(snap);
    setRunning(true);
    const fast = Math.round(turnMs / 3);
    let current = snap;
    try {
      while (token === runToken.current) {
        const step = advanceLesson(current);
        if (!step) break;
        const ok = await cubeRef.current?.animate(step.move, currentFacelets(step.lesson), fast);
        if (token !== runToken.current || !ok) break;
        current = step.lesson;
        lessonRef.current = current;
        setLesson(current);
      }
    } finally {
      if (token === runToken.current) {
        solvingRef.current = false;
        flight.current = false;
        setRunning(false);
      }
    }
  }

  function stopSolve() {
    if (!solvingRef.current) return;
    runToken.current += 1;
    solvingRef.current = false;
    flight.current = false;
    setRunning(false);
    cubeRef.current?.cancel();
    cubeRef.current?.show(currentFacelets(lessonRef.current));
  }

  function restoreSolve() {
    if (!checkpoint) return;
    runToken.current += 1;
    solvingRef.current = false;
    flight.current = false;
    setRunning(false);
    cubeRef.current?.cancel();
    const restored = cloneLesson(checkpoint);
    lessonRef.current = restored;
    setLesson(restored);
    cubeRef.current?.show(currentFacelets(restored));
  }

  function startPaint() {
    setPaintCells(entered ? facelets : blankPaint());
    setPaintColor("white");
    setPaintStep(0);
    setPaintError(null);
    setMode("paint");
  }

  function leavePaint() {
    setMode("cube");
    setPaintError(null);
    cubeRef.current?.setPaintFace(null);
    cubeRef.current?.resetView();
  }

  function clearPaint() {
    setPaintCells(blankPaint());
    setPaintError(null);
    setPaintStep(0);
  }

  function newCube() {
    setEntered(false);
    setCheckpoint(null);
    setLesson(emptyLesson(SOLVED));
    setError(null);
    setMode("cube");
    cubeRef.current?.resetView();
  }

  function paintSticker(index: number) {
    const face = PAINT_FACES[paintStep];
    if (!face || isCentre(index) || Math.floor(index / 9) !== "URFDLB".indexOf(face)) return;
    const letter = { white: "w", yellow: "y", red: "r", orange: "o", blue: "b", green: "g" }[paintColor];
    setPaintCells((current) => current.slice(0, index) + letter + current.slice(index + 1));
  }

  function rejectPaint(message: string, face: "F" | "R" | "B" | "L" | "U" | "D") {
    playPaintError();
    setPaintError(message);
    setPaintStep(Math.max(0, PAINT_FACES.indexOf(face)));
    const pose = facePose(face);
    cubeRef.current?.setPaintFace(face);
    void cubeRef.current?.lookAt(pose.theta, pose.phi, 680);
    if (!reduced) {
      setShaking(true);
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShaking(false), 480);
    }
  }

  function finishPaint() {
    if (blankCount(paintCells) > 0) {
      rejectPaint(blankMessage(blankCount(paintCells)), faceAfterFailedDone(paintCells));
      return;
    }
    const verdict = validateFaceletString(paintCells);
    if (!verdict.ok) {
      rejectPaint(paintErrorMessage(verdict.issues), "F");
      return;
    }
    const cells = paintCells;
    setEntered(true);
    leavePaint();
    void load(cells, "Solution started from the colours you entered.");
  }

  useEffect(() => {
    if (mode !== "paint") return;
    const face = PAINT_FACES[paintStep] ?? "F";
    const pose = facePose(face);
    cubeRef.current?.setPaintFace(face);
    void cubeRef.current?.lookAt(pose.theta, pose.phi, 680);
  }, [mode, paintStep]);

  const finished = !nextMove && !lesson.pending;
  const solving = !finished && lesson.moves.length > 0;
  const modeName = method === "beginner" ? "Beginner" : "Expert";
  const headline = solving
    ? solvingHeadline(method, labels.step, Math.min(lesson.cursor + 1, lesson.moves.length), lesson.moves.length)
    : labels.step;
  const moveLine = solving && nextMove ? plainMove(nextMove) : "";

  return (
    <div className="app">
      <header className="top">
        <p className="mark">Rubic</p>
        {entered && mode === "cube" ? (
          <nav aria-label="Primary">
            <button type="button" className="text-button" onClick={startPaint}>Edit colours</button>
          </nav>
        ) : null}
      </header>
      <main>
        <section className={mode === "paint" ? "stage-column is-paint" : entered ? "stage-column" : "stage-column is-empty"} aria-labelledby="cube-title">
          <div className="hero">
            <div className={shaking ? "cube-frame is-shaking" : "cube-frame"}>
              <CubeView
                ref={cubeRef}
                facelets={mode === "paint" ? paintCells : facelets}
                letters={letters}
                gesture="view"
                label={mode === "paint" ? paintLabel(paintStep) : cubeLabel(facelets, finished ? undefined : nextMove)}
                onPaint={paintSticker}
                paintFace={mode === "paint" ? PAINT_FACES[paintStep] ?? null : null}
                idle={mode === "cube" && !entered}
                onGesture={onGesture}
                turnMs={turnMs}
              />
            </div>
          </div>
          <div className="rail">
          {mode === "paint" ? <PaintStatus step={paintStep} cells={paintCells} error={paintError} /> : entered ? (
            <div className="status" aria-live="polite">
              <p id="cube-title" className="status-title" data-testid="lesson-step">{solving ? <><span className="mode-chip">{modeName}</span>{" · "}{headline.slice(modeName.length + 3)}</> : headline}</p>
              {moveLine ? <p className="move-line" data-testid="move-line">{moveLine}</p> : null}
            </div>
          ) : (
            <p id="cube-title" className="empty-prompt" data-testid="empty-prompt">Enter your cube's colours to get step-by-step help.</p>
          )}
          <p className="sr-only" data-testid="lesson-facelets">{facelets}</p>
          {mode === "paint" ? <p className="sr-only" data-testid="paint-cells">{paintCells}</p> : null}
          {mode === "paint" ? (
            <PaintControls
              step={paintStep}
              cells={paintCells}
              color={paintColor}
              onColor={setPaintColor}
              onPaint={paintSticker}
              onBack={() => { setPaintError(null); setPaintStep((value) => Math.max(0, value - 1)); }}
              onNext={() => { setPaintError(null); setPaintStep((value) => Math.min(PAINT_FACES.length - 1, value + 1)); }}
              onDone={finishPaint}
              onClear={clearPaint}
              onCancel={() => leavePaint()}
            />
          ) : entered ? (
          <div className="controls">
            <button type="button" className="back" onClick={() => void run(() => go(-1))} disabled={running || lesson.busy || loading || (lesson.cursor === 0 && lesson.history.length === 0 && !lesson.pending)}>Back</button>
            <button type="button" className="primary" onClick={() => void run(() => go(1))} disabled={running || lesson.busy || loading || (!nextMove && lesson.pending?.intent !== "do") || lesson.pending?.intent === "undo"}>Next{lesson.pending?.intent === "do" ? ` · ${lesson.pending.move}` : nextMove ? ` · ${nextMove}` : ""}</button>
            <button type="button" className="fast" data-testid="solve-fast" onClick={() => void solveFast()} disabled={running || lesson.busy || loading || !advanceLesson(lesson)}>Solve 3×</button>
            <button type="button" className={running ? "stop" : "stop is-quiet"} data-testid="stop-solve" onClick={stopSolve} disabled={!running} aria-hidden={!running} tabIndex={running ? 0 : -1}>Stop</button>
            <button type="button" className={checkpoint ? "restore" : "restore is-quiet"} data-testid="restore-solve" onClick={restoreSolve} disabled={!checkpoint} aria-hidden={!checkpoint} tabIndex={checkpoint ? 0 : -1} aria-label="Restore before solve"><span className="restore-long">Restore before solve</span><span className="restore-short">Restore</span>            </button>
          </div>
          ) : (
            <div className="enter-hero">
              <button type="button" className="primary" onClick={startPaint}>Enter colours</button>
            </div>
          )}
          {gestureNote ? <p className="notice" role="status">{gestureNote}</p> : null}
          {lesson.notice ? <p className="notice" role="status">{lesson.notice}</p> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          {loading ? <p className="quiet" role="status">Preparing the solution… you can keep looking at the cube.</p> : null}
          {entered && mode !== "paint" && reduced ? <p className="quiet">Reduced motion is on. Moves jump to the next state, and the move letter is still announced above.</p> : null}
          {entered && mode !== "paint" && <Disclosure className="options-panel" show="Options" hide="Hide options" controls="options-panel">
            <label className="speed-label">
              Solution
              <select aria-label="Solution method" value={method} onChange={(event) => {
                const chosen = event.target.value === "beginner" ? "beginner" : "expert";
                setMethod(chosen);
                void load(facelets, null, chosen);
              }}>
                <option value="expert">Expert</option>
                <option value="beginner">Beginner</option>
              </select>
            </label>
            <label className="speed-label">
              Speed
              <select aria-label="Turn speed" value={turnMs} onChange={(event) => setTurnMs(Number(event.target.value))}>
                <option value={900}>Slow</option>
                <option value={750}>Normal</option>
                <option value={600}>Fast</option>
              </select>
            </label>
            <div className="row secondary-actions">
              <button type="button" onClick={() => void load(faceletsToString(applyScramble()), null)} disabled={running || lesson.busy || loading}>Scramble</button>
              <button type="button" onClick={() => { setCheckpoint(null); setLesson(emptyLesson(SOLVED)); setError(null); }} disabled={running || lesson.busy}>Reset</button>
              <button type="button" onClick={newCube} disabled={running || lesson.busy || loading}>New cube</button>
              <button type="button" onClick={() => void run(() => replayMove())} disabled={running || lesson.busy || loading || (!nextMove && lesson.cursor === 0)}>Replay move</button>
              <button type="button" onClick={() => cubeRef.current?.resetView()}>Reset view</button>
            </div>
            <label className="check">
              <input type="checkbox" checked={letters} onChange={(event) => setLetters(event.target.checked)} />
              Letter stickers (W Y R O B G) as well as colour
            </label>
            <p className="quiet">{holdLine(stringToFacelets(facelets))}</p>
            <p className="quiet">R means the right face, not red. A letter alone is clockwise as you look at that face. 2 is a half turn. Solve 3× plays the remaining moves at three times the selected speed. Restore before solve returns to the cube as it was when that run started.</p>
            <p className="quiet">Ordinary Western 3×3: white opposite yellow, red opposite orange, blue opposite green. Colours stay in this browser. Expert is a fast two-phase search. Beginner is the layer-by-layer lesson.</p>
          </Disclosure>}
          </div>
        </section>
      </main>
    </div>
  );
}

function PaintStatus({ step, cells, error }: { step: number; cells: string; error: string | null }) {
  const face = PAINT_FACES[step] ?? "F";
  const guide = PAINT_GUIDE[face];
  return (
    <div className="status" aria-live="polite">
      <p id="cube-title" className="status-title" data-testid="paint-face">{guide.title} · {step + 1} of {PAINT_FACES.length}</p>
      <p className="quiet">{guide.turn}</p>
      <p className="quiet" data-testid="paint-progress">{filledOnFace(cells, face)}/8 filled</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}

const STICKER_NAME: Record<string, string> = { w: "white", y: "yellow", r: "red", o: "orange", b: "blue", g: "green" };

function PaintControls({ step, cells, color, onColor, onPaint, onBack, onNext, onDone, onClear, onCancel }: {
  step: number;
  cells: string;
  color: ColorName;
  onColor: (color: ColorName) => void;
  onPaint: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
  onDone: () => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const last = step === PAINT_FACES.length - 1;
  const face = PAINT_FACES[step] ?? "F";
  const guide = PAINT_GUIDE[face];
  return (
    <div className="paint-bar">
      <div className="palette paint-palette" role="group" aria-label="Paint colour">
        {COLORS.map((name) => (
          <button key={name} type="button" data-colour={name} aria-pressed={color === name} aria-label={name} onClick={() => onColor(name)}>{STICKER_MARK[name]}</button>
        ))}
      </div>
      <div className="sr-only" role="group" aria-label={`${guide.title} stickers`}>
        {[0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => {
          const index = faceletIndex(face, row, col);
          const current = cells[index] === "." ? "blank" : STICKER_NAME[cells[index] ?? ""] ?? "unknown";
          const centre = isCentre(index);
          return (
            <button
              key={index}
              type="button"
              disabled={centre}
              onClick={() => onPaint(index)}
              aria-label={centre ? `${guide.title} centre, ${current}, fixed` : `${guide.title} row ${row + 1} column ${col + 1}, ${current}`}
            />
          );
        }))}
      </div>
      <div className="paint-nav">
        <button type="button" onClick={onBack} disabled={step === 0}>Back</button>
        {last
          ? <button type="button" className="primary" onClick={onDone}>Done</button>
          : <button type="button" className="primary" onClick={onNext}>Next face</button>}
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
      <button type="button" className="paint-clear" onClick={onClear}>Clear all</button>
    </div>
  );
}

function paintLabel(step: number): string {
  const face = PAINT_FACES[step] ?? "F";
  return `Painting the ${PAINT_GUIDE[face].title.toLowerCase()} face. ${PAINT_GUIDE[face].turn}`;
}

function plainMove(move: string): string {
  if (move.endsWith("2")) {
    const face = move[0] ?? "";
    return `${move}. Half turn: ${moveDirection(face)} and then the same way again.`;
  }
  return `${move}. ${moveDirection(move)}.`;
}

function invert(move: string): string {
  if (!move) return "";
  if (move.endsWith("2")) return move;
  if (move.endsWith("'")) return move[0]!;
  return `${move}'`;
}

function applyScramble(): Uint8Array {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  return applyMoves(solvedBytes(), randomScramble(mulberry32(seed), 22));
}

function holdLine(state: ReturnType<typeof stringToFacelets>): string {
  return `Hold the ${centerColor(state, "U")} centre on top, the ${centerColor(state, "D")} centre on the bottom, and the ${centerColor(state, "F")} centre facing you. Right is ${centerColor(state, "R")}.`;
}

function cubeLabel(facelets: string, move: string | undefined): string {
  return move ? `Cube. Next move ${move}. ${holdLine(stringToFacelets(facelets))}` : `Cube. ${holdLine(stringToFacelets(facelets))}`;
}

function readMethod(): SolveMethod {
  try {
    return localStorage.getItem(METHOD_KEY) === "beginner" ? "beginner" : "expert";
  } catch {
    return "expert";
  }
}

function readEntered(): boolean {
  try {
    return localStorage.getItem(ENTERED) === "1";
  } catch {
    return false;
  }
}

function loadLesson(): Lesson {
  if (!readEntered()) return emptyLesson(SOLVED);
  try {
    const raw = sessionStorage.getItem(STORAGE) || localStorage.getItem(STORAGE);
    if (!raw) return emptyLesson(SOLVED);
    const saved = JSON.parse(raw) as Lesson;
    if (!saved.start || !Array.isArray(saved.moves)) return emptyLesson(SOLVED);
    return { ...emptyLesson(SOLVED), ...saved, busy: false, arrivedBy: saved.arrivedBy ?? null, pending: saved.pending ?? null };
  } catch {
    return emptyLesson(SOLVED);
  }
}
