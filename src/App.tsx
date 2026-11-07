import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS, type ColorName, type Face, applyMoves, faceletsToString, mulberry32, randomScramble, solvedBytes, stringToFacelets } from "./cube/model";
import { validateFaceletString } from "./cube/validate";
import { holdText } from "./solver/beginner";
import { solveInWorker } from "./solveClient";
import {
  applyUserMove,
  beginAnimation,
  currentFacelets,
  deviate,
  emptyLesson,
  endAnimation,
  progressLabel,
  stepBack,
  stepForward,
  upcoming,
  withSolution,
  type Lesson,
} from "./state/lesson";
import { CubeView, type CubeHandle } from "./view/CubeView";
import { ScanFlow } from "./view/ScanFlow";
import { TeachingPanel } from "./view/TeachingPanel";

const SOLVED = faceletsToString(solvedBytes());
const STORAGE = "rubic-lesson-v1";

export function App() {
  const [lesson, setLesson] = useState<Lesson>(() => loadLesson());
  const [letters, setLetters] = useState(true);
  const [gesture, setGesture] = useState<"view" | "turn">("view");
  const [viewShift, setViewShift] = useState(false);
  const [mode, setMode] = useState<"learn" | "scan" | "manual" | "primer">("learn");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cubeRef = useRef<CubeHandle>(null);
  const facelets = currentFacelets(lesson);
  const nextMove = lesson.moves[lesson.cursor];
  const labels = progressLabel(lesson);
  const demo = upcoming(lesson);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const onViewShift = useCallback((shifted: boolean) => setViewShift(shifted), []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE, JSON.stringify({ start: lesson.start, moves: lesson.moves, chunkOfMove: lesson.chunkOfMove, chunks: lesson.chunks, cursor: lesson.cursor, history: lesson.history }));
  }, [lesson]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (mode !== "learn") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
      if ("UDRLFB".includes(key) && key.length === 1) {
        event.preventDefault();
        void userTurn(event.shiftKey ? `${key}'` : key);
        return;
      }
      if (event.key === "n" || event.key === "N") void go(1);
      if (event.key === "p" || event.key === "P" || event.key === "Backspace") void go(-1);
      if (event.key === "?" ) setMode("primer");
      if (event.key === "Escape") setMode("learn");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, lesson, loading, facelets, nextMove]);

  async function load(start: string, notice: string | null = null) {
    setLoading(true);
    setError(null);
    try {
      const solution = await solveInWorker(start);
      setLesson((current) => withSolution({ ...current, history: [] }, start, solution, notice));
      setMode("learn");
      requestAnimationFrame(() => document.getElementById("cube-title")?.scrollIntoView({ block: "start" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The lesson could not be prepared.");
    } finally {
      setLoading(false);
    }
  }

  async function go(direction: 1 | -1) {
    if (lesson.busy || loading) return;
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
    if (move === nextMove) {
      await go(1);
      return;
    }
    const next = applyUserMove(facelets, move);
    setLesson((current) => beginAnimation(current));
    await cubeRef.current?.animate(move, next);
    setLoading(true);
    try {
      const solution = await solveInWorker(next);
      setLesson((current) => endAnimation(deviate(current, next, solution)));
    } catch (caught) {
      setLesson((current) => endAnimation(current));
      setError(caught instanceof Error ? caught.message : "That turn could not be used.");
    } finally {
      setLoading(false);
    }
  }

  const solved = faceletsIsSolved(facelets);

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="mark">Rubic</p>
          <p className="tag">Learn a 3×3 by understanding the layer in front of you.</p>
        </div>
        <nav aria-label="Primary">
          <button type="button" className={mode === "learn" ? "on" : ""} onClick={() => setMode("learn")}>Lesson</button>
          <button type="button" onClick={() => setMode("scan")}>Scan</button>
          <button type="button" onClick={() => setMode("manual")}>Enter colours</button>
          <button type="button" onClick={() => setMode("primer")}>Notation</button>
        </nav>
      </header>
      {mode === "scan" ? <ScanFlow onCancel={() => setMode("learn")} onAccept={(value) => void load(value, "Lesson started from your scan. Match the hold before the first move.")} /> : null}
      {mode === "manual" ? <ManualEntry onCancel={() => setMode("learn")} onAccept={(value) => void load(value, "Lesson started from the colours you entered.")} /> : null}
      {mode === "primer" ? <Primer onClose={() => setMode("learn")} /> : null}
      <main className={mode === "learn" ? "" : "hidden-mode"}>
        <section className="stage-column" aria-labelledby="cube-title">
          <div className="progress" aria-live="polite">
            <p id="cube-title">{labels.stage}</p>
            <p>{labels.move}</p>
            <p>{labels.remaining}</p>
          </div>
          <div className="gesture-toggle" role="group" aria-label="How a drag on the cube behaves">
            <button type="button" className={gesture === "view" ? "on" : ""} aria-pressed={gesture === "view"} onClick={() => setGesture("view")}>Rotate view</button>
            <button type="button" className={gesture === "turn" ? "on" : ""} aria-pressed={gesture === "turn"} onClick={() => setGesture("turn")}>Turn a face</button>
          </div>
          <p className="quiet" id="gesture-help">
            {gesture === "view"
              ? "Drag anywhere on the cube to look around. Pieces stay where they are."
              : "Drag a sticker the way that layer should slide. One piece cannot turn by itself."}
          </p>
          <div className="cube-frame">
            <CubeView
              ref={cubeRef}
              facelets={facelets}
              highlight={demo?.chunk.focus ?? []}
              letters={letters}
              gesture={gesture}
              label={cubeLabel(facelets, nextMove)}
              onTurn={(move) => void userTurn(move)}
              onViewShift={onViewShift}
            />
          </div>
          <p className="sr-only" data-testid="lesson-facelets">{facelets}</p>
          <p className="hold-banner">{holdText(stringToFacelets(facelets))}</p>
          {viewShift ? <p className="view-warning" role="status">The view has moved. Face buttons and lesson moves still use the hold above, not whichever side faces the screen. <button type="button" onClick={() => cubeRef.current?.resetView()}>Reset view</button></p> : null}
          <div className="controls">
            <button type="button" onClick={() => void go(-1)} disabled={lesson.busy || loading || (lesson.cursor === 0 && lesson.history.length === 0)}>Back</button>
            <button type="button" className="primary" onClick={() => void go(1)} disabled={lesson.busy || loading || !nextMove}>Next{nextMove ? ` · ${nextMove}` : ""}</button>
          </div>
          <div className="face-pad" role="group" aria-label="Turn a face. These follow the hold, not the camera.">
            {FACE_BUTTONS.map((button) => (
              <button key={button.move} type="button" onClick={() => void userTurn(button.move)} disabled={lesson.busy || loading} title={button.accessible}>
                {button.label} <span className="move-code">{button.move}</span>
              </button>
            ))}
          </div>
          {lesson.notice ? <p className="notice" role="status">{lesson.notice}</p> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          {loading ? <p className="quiet" role="status">Preparing the lesson… you can keep looking at the cube.</p> : null}
          {solved && lesson.moves.length === 0 ? <p className="lead">This cube is solved. Scramble it, or scan a physical cube, to start learning.</p> : null}
          {solved && lesson.cursor > 0 && lesson.cursor === lesson.moves.length ? <p className="lead">Solved. The last move finished the cube, and every centre matches its face.</p> : null}
          <div className="row secondary-actions">
            <button type="button" onClick={() => void load(faceletsToString(applyScramble()), null)} disabled={lesson.busy || loading}>Scramble</button>
            <button type="button" onClick={() => { setLesson(emptyLesson(SOLVED)); setError(null); }} disabled={lesson.busy}>Reset</button>
            <button type="button" onClick={() => setLesson((current) => ({ ...current, cursor: 0, notice: "Replaying from the start of this lesson." }))} disabled={lesson.busy || lesson.cursor === 0}>Replay lesson</button>
            <button type="button" onClick={() => cubeRef.current?.resetView()}>Reset view</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={letters} onChange={(event) => setLetters(event.target.checked)} />
            Letter stickers (W Y R O B G) as well as colour
          </label>
          {reduced ? <p className="quiet">Reduced motion is on. Moves jump to the next state, and the move letter is still announced above.</p> : null}
          <p className="quiet">Next does one lesson move. It cannot see your hands. A different face turn restarts the lesson from the cube as it is now.</p>
        </section>
        <TeachingPanel
          facelets={facelets}
          chunk={demo?.chunk ?? null}
          suffix={demo?.suffix ?? []}
          doneInChunk={demo?.doneInChunk ?? 0}
          solved={solved && (lesson.moves.length === 0 || lesson.cursor === lesson.moves.length)}
        />
      </main>
      <footer>
        <p>Ordinary Western 3×3 only: white opposite yellow, red opposite orange, blue opposite green, with red on the right when white is on top and green is in front. Photos and colours stay in this browser. No account, no upload, no claim that a short computer solution is optimal — this lesson teaches a beginner layer-by-layer method.</p>
      </footer>
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
      <p>Pick a colour, then tap stickers. Centres define the faces. This is the fallback when a camera is unavailable or a photo is too uncertain.</p>
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

function Primer({ onClose }: { onClose: () => void }) {
  return (
    <section className="primer" aria-labelledby="primer-title">
      <header className="panel-head">
        <h2 id="primer-title">Move letters</h2>
        <button type="button" className="ghost" onClick={onClose}>Close</button>
      </header>
      <p>A letter is a face, not a colour. R means the right face even when that face is orange. Hold the cube as the lesson says, then read the letter.</p>
      <ul>
        <li><strong>U D F B L R</strong> — up, down, front, back, left, right. A letter alone is a quarter turn clockwise as you look at that face.</li>
        <li><strong>'</strong> — the same face, anticlockwise. <strong>2</strong> — a half turn.</li>
        <li><strong>x y z</strong> — turn the whole cube, layers together. x tips the top away or toward you, y turns it as seen from above, z rolls it like a steering wheel.</li>
      </ul>
      <p>From the front, U sends the front edge of the top to the left. R sends the front edge of the right face upward. D sends the front edge of the bottom to the right. The demonstration arrow uses those same directions.</p>
      <p>Keyboard: U D F B L R, Shift for anticlockwise, N next, P back, arrows are not used so they do not fight the pointer. The lesson does not watch a camera to see whether you turned the physical cube.</p>
    </section>
  );
}

const FACE_BUTTONS: { move: string; label: string; accessible: string }[] = [
  { move: "U", label: "Top, front edge left", accessible: "Turn the top face so its front edge moves left. Notation U." },
  { move: "U'", label: "Top, front edge right", accessible: "Turn the top face so its front edge moves right. Notation U prime." },
  { move: "F", label: "Front, clockwise", accessible: "Turn the front face clockwise, so its top edge moves right. Notation F." },
  { move: "F'", label: "Front, anticlockwise", accessible: "Turn the front face anticlockwise, so its top edge moves left. Notation F prime." },
  { move: "R", label: "Right, front edge up", accessible: "Turn the right face so its front edge moves up. Notation R." },
  { move: "R'", label: "Right, front edge down", accessible: "Turn the right face so its front edge moves down. Notation R prime." },
  { move: "L", label: "Left, front edge down", accessible: "Turn the left face so its front edge moves down. Notation L." },
  { move: "L'", label: "Left, front edge up", accessible: "Turn the left face so its front edge moves up. Notation L prime." },
  { move: "D", label: "Bottom, front edge right", accessible: "Turn the bottom face so its front edge moves right. Notation D." },
  { move: "D'", label: "Bottom, front edge left", accessible: "Turn the bottom face so its front edge moves left. Notation D prime." },
  { move: "B", label: "Back, top edge left", accessible: "Turn the back face so its top edge, seen from the front, moves left. Notation B." },
  { move: "B'", label: "Back, top edge right", accessible: "Turn the back face so its top edge, seen from the front, moves right. Notation B prime." },
];

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

function faceletsIsSolved(facelets: string): boolean {
  const bytes = stringToFacelets(facelets);
  for (let face = 0; face < 6; face++) {
    const centre = bytes[face * 9 + 4];
    for (let i = 0; i < 9; i++) if (bytes[face * 9 + i] !== centre) return false;
  }
  return true;
}

function cubeLabel(facelets: string, move: string | undefined): string {
  return move ? `Lesson cube. Next move ${move}. ${holdText(stringToFacelets(facelets))}` : `Lesson cube. ${holdText(stringToFacelets(facelets))}`;
}

function loadLesson(): Lesson {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    if (!raw) return emptyLesson(SOLVED);
    const saved = JSON.parse(raw) as Lesson;
    if (!saved.start || !Array.isArray(saved.moves)) return emptyLesson(SOLVED);
    return { ...emptyLesson(SOLVED), ...saved, busy: false };
  } catch {
    return emptyLesson(SOLVED);
  }
}
