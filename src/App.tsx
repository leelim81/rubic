import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COLORS, type ColorName, type Face, applyMoves, centerColor, faceletsToString, moveDirection, mulberry32, randomScramble, solvedBytes, stringToFacelets } from "./cube/model";
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
  stepBack,
  stepForward,
  withSolution,
  type Lesson,
} from "./state/lesson";
import { CubeView, type CubeHandle } from "./view/CubeView";
import { Disclosure } from "./view/Disclosure";

const SOLVED = faceletsToString(solvedBytes());
const STORAGE = "rubic-lesson-v1";

export function App() {
  const [lesson, setLesson] = useState<Lesson>(() => loadLesson());
  const [letters, setLetters] = useState(true);
  const [viewShift, setViewShift] = useState(false);
  const [mode, setMode] = useState<"cube" | "manual">("cube");
  const [checkpoint, setCheckpoint] = useState<Lesson | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gestureNote, setGestureNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cubeRef = useRef<CubeHandle>(null);
  const flight = useRef(false);
  const solvingRef = useRef(false);
  const runToken = useRef(0);
  const lessonRef = useRef(lesson);
  const [turnMs, setTurnMs] = useState(750);
  const [method, setMethod] = useState<SolveMethod>("beginner");
  lessonRef.current = lesson;
  const facelets = currentFacelets(lesson);
  const nextMove = lesson.moves[lesson.cursor];
  const labels = progressLabel(lesson);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const onViewShift = useCallback((shifted: boolean) => setViewShift(shifted), []);
  const onGesture = useCallback((message: string | null) => setGestureNote(message), []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE, JSON.stringify({ start: lesson.start, moves: lesson.moves, chunkOfMove: lesson.chunkOfMove, chunks: lesson.chunks, cursor: lesson.cursor, history: lesson.history }));
  }, [lesson]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (mode !== "cube") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.key === "n" || event.key === "N") void run(() => go(1));
      if (event.key === "p" || event.key === "P" || event.key === "Backspace") void run(() => go(-1));
      if (event.key === "Escape") setMode("cube");
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

  const finished = !nextMove && !lesson.pending;
  const moveLine = finished || !lesson.moves.length ? "" : `Move ${Math.min(lesson.cursor + 1, lesson.moves.length)} of ${lesson.moves.length}${nextMove ? ` · ${plainMove(nextMove)}` : ""}`;

  return (
    <div className="app">
      <header className="top">
        <p className="mark">Rubic</p>
        <nav aria-label="Primary">
          <button type="button" className="text-button" onClick={() => setMode("manual")}>Enter colours</button>
        </nav>
      </header>
      {mode === "manual" ? <ManualEntry onCancel={() => setMode("cube")} onAccept={(value) => void load(value, "Solution started from the colours you entered.")} /> : null}
      <main className={mode === "cube" ? "" : "hidden-mode"}>
        <section className="stage-column" aria-labelledby="cube-title">
          <div className="status" aria-live="polite">
            <p id="cube-title" className="status-title" data-testid="lesson-step">{labels.step}</p>
            {moveLine ? <p className="move-line" data-testid="move-line">{moveLine}</p> : null}
          </div>
          <div className="hero">
            <div className="cube-frame">
              <CubeView
                ref={cubeRef}
                facelets={facelets}
                letters={letters}
                gesture="view"
                label={cubeLabel(facelets, finished ? undefined : nextMove)}
                onViewShift={onViewShift}
                onGesture={onGesture}
                turnMs={turnMs}
              />
            </div>
          </div>
          <p className="sr-only" data-testid="lesson-facelets">{facelets}</p>
          {viewShift ? <p className="view-warning" role="status">The view has moved. Moves still follow the original hold. <button type="button" onClick={() => cubeRef.current?.resetView()}>Reset view</button></p> : null}
          <div className="controls">
            <button type="button" className="back" onClick={() => void run(() => go(-1))} disabled={running || lesson.busy || loading || (lesson.cursor === 0 && lesson.history.length === 0 && !lesson.pending)}>Back</button>
            <button type="button" className="primary" onClick={() => void run(() => go(1))} disabled={running || lesson.busy || loading || (!nextMove && lesson.pending?.intent !== "do") || lesson.pending?.intent === "undo"}>Next{lesson.pending?.intent === "do" ? ` · ${lesson.pending.move}` : nextMove ? ` · ${nextMove}` : ""}</button>
            <button type="button" className="fast" data-testid="solve-fast" onClick={() => void solveFast()} disabled={running || lesson.busy || loading || !advanceLesson(lesson)}>Solve 3×</button>
            <button type="button" className={running ? "stop" : "stop is-quiet"} data-testid="stop-solve" onClick={stopSolve} disabled={!running} aria-hidden={!running} tabIndex={running ? 0 : -1}>Stop</button>
            <button type="button" className={checkpoint ? "restore" : "restore is-quiet"} data-testid="restore-solve" onClick={restoreSolve} disabled={!checkpoint} aria-hidden={!checkpoint} tabIndex={checkpoint ? 0 : -1} aria-label="Restore before solve"><span className="restore-long">Restore before solve</span><span className="restore-short">Restore</span></button>
          </div>
          {gestureNote ? <p className="notice" role="status">{gestureNote}</p> : null}
          {lesson.notice ? <p className="notice" role="status">{lesson.notice}</p> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          {loading ? <p className="quiet" role="status">Preparing the solution… you can keep looking at the cube.</p> : null}
          {reduced ? <p className="quiet">Reduced motion is on. Moves jump to the next state, and the move letter is still announced above.</p> : null}
          <Disclosure className="options-panel" show="Options" hide="Hide options" controls="options-panel">
            <label className="speed-label">
              Solution
              <select aria-label="Solution method" value={method} onChange={(event) => {
                const chosen = event.target.value === "short" ? "short" : "beginner";
                setMethod(chosen);
                void load(facelets, null, chosen);
              }}>
                <option value="beginner">Beginner</option>
                <option value="short">Shortest</option>
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
              <button type="button" onClick={() => void run(() => replayMove())} disabled={running || lesson.busy || loading || (!nextMove && lesson.cursor === 0)}>Replay move</button>
              <button type="button" onClick={() => cubeRef.current?.resetView()}>Reset view</button>
            </div>
            <label className="check">
              <input type="checkbox" checked={letters} onChange={(event) => setLetters(event.target.checked)} />
              Letter stickers (W Y R O B G) as well as colour
            </label>
            <p className="quiet">{holdLine(stringToFacelets(facelets))}</p>
            <p className="quiet">R means the right face, not red. A letter alone is clockwise as you look at that face. 2 is a half turn. Solve 3× plays the remaining moves at three times the selected speed. Restore before solve returns to the cube as it was when that run started.</p>
            <p className="quiet">Ordinary Western 3×3: white opposite yellow, red opposite orange, blue opposite green. Colours stay in this browser. The solution is a two-phase search, not a claim of the shortest sequence.</p>
          </Disclosure>
        </section>
      </main>
    </div>
  );
}

function ManualEntry({ onCancel, onAccept }: { onCancel: () => void; onAccept: (facelets: string) => void }) {
  const [cells, setCells] = useState<(ColorName | null)[]>(() => Array.from(stringToFacelets(SOLVED), (value) => COLORS[value]!));
  const [paint, setPaint] = useState<ColorName>("white");
  const [message, setMessage] = useState("The net starts solved. Repaint it to match your cube, or clear a face and start fresh.");
  function set(index: number) {
    setCells((current) => current.map((value, item) => (item === index ? paint : value)));
  }
  function submit() {
    if (cells.some((cell) => !cell)) {
      setMessage("Every sticker needs a colour, including the centres.");
      return;
    }
    const value = cells.map((cell) => ({ white: "w", yellow: "y", red: "r", orange: "o", blue: "b", green: "g" })[cell!]).join("");
    const verdict = validateFaceletString(value);
    if (!verdict.ok) {
      setMessage(verdict.issues.map((issue) => issue.message).join(" "));
      return;
    }
    onAccept(value);
  }
  return (
    <section className="manual" aria-labelledby="manual-title">
      <header className="panel-head">
        <h2 id="manual-title">Enter the colours yourself</h2>
        <button type="button" className="ghost" onClick={onCancel}>Close</button>
      </header>
      <p>Pick a colour, then tap stickers. Centres define the faces.</p>
      <PaletteChoice paint={paint} onPaint={setPaint} />
      <div className="net">
        {(["U", "R", "F", "D", "L", "B"] as Face[]).map((face, faceIndex) => (
          <div key={face} className={`net-face face-${face}`}>
            <h3>{face}</h3>
            <div className="sticker-grid">
              {Array.from({ length: 9 }, (_, index) => {
                const colour = cells[faceIndex * 9 + index];
                return (
                  <button key={index} type="button" className="sticker" data-colour={colour ?? "empty"} onClick={() => set(faceIndex * 9 + index)} aria-label={`${face} sticker ${index + 1}, ${colour ?? "empty"}`}>
                    {colour?.[0]?.toUpperCase() ?? "?"}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p role="status">{message}</p>
      <div className="row">
        <button type="button" onClick={submit}>Use these colours</button>
        <button type="button" className="ghost" onClick={() => setCells(Array(54).fill(null))}>Clear</button>
      </div>
    </section>
  );
}

function PaletteChoice({ paint, onPaint }: { paint: ColorName; onPaint: (name: ColorName) => void }) {
  return (
    <div className="palette" role="group" aria-label="Paint colour">
      {COLORS.map((name) => (
        <button key={name} type="button" data-colour={name} aria-pressed={paint === name} onClick={() => onPaint(name)}>{name}</button>
      ))}
    </div>
  );
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
  return `Hold ${centerColor(state, "U")} on top, ${centerColor(state, "D")} on the bottom, and ${centerColor(state, "F")} facing you. Right is ${centerColor(state, "R")}. Moves follow this hold, not the camera.`;
}

function cubeLabel(facelets: string, move: string | undefined): string {
  return move ? `Cube. Next move ${move}. ${holdLine(stringToFacelets(facelets))}` : `Cube. ${holdLine(stringToFacelets(facelets))}`;
}

function loadLesson(): Lesson {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    if (!raw) return emptyLesson(SOLVED);
    const saved = JSON.parse(raw) as Lesson;
    if (!saved.start || !Array.isArray(saved.moves)) return emptyLesson(SOLVED);
    return { ...emptyLesson(SOLVED), ...saved, busy: false, arrivedBy: saved.arrivedBy ?? null, pending: saved.pending ?? null };
  } catch {
    return emptyLesson(SOLVED);
  }
}
