import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { applyFourString, fourMoveSpeech, invertFourMove, randomFourScramble, solvedFourString, validateFour } from "./cube/four";
import { applyFiveString, fiveMoveSpeech, randomFiveScramble, solvedFiveString, validateFive } from "./cube/five";
import { MEGA_COLORS, applyMegaString, megaMoveSpeech, randomMegaScramble, solvedMegaString } from "./megaminx/model";
import { MEGA_PAINT_ORDER, blankMegaPaint, filledOnMegaFace, firstBlankMegaFace, megaFacePose, megaGuide, megaPaintCount } from "./megaminx/paint";
import { validateMega } from "./megaminx/validate";
import { COLORS, type ColorName, applyMoves, centerColor, faceletsToString, moveDirection, mulberry32, randomScramble, solvedBytes, stringToFacelets } from "./cube/model";
import { MASTER_COLORS, MASTER_GUIDE, MASTER_HOLD, MASTER_PER_FACE, applyMasterMoves, blankMaster, masterFacePose, masterFilled, masterFirstBlank, masterMoveSpeech, masterStickerLabel, randomMasterScramble, solvedMasterString, validateMaster } from "./pyraminx/master";
import { PYRA_COLORS, PYRA_FACES, PYRA_GUIDE, PYRA_HOLD, applyPyraMoves, blankPyra, letterOfColor, pyraFacePose, pyraFilled, pyraFirstBlank, pyraMoveSpeech, pyraStickerLabel, randomPyraScramble, solvedPyraString, validatePyraminx } from "./pyraminx/model";
import { PAINT_FACES, PAINT_GUIDE, blankCount, blankMessage, blankPaint, faceAfterFailedDone, facePose, filledOnFace, faceletIndex, isCentre, paintableOnFace, paintErrorMessage } from "./view/paint";
import { playPaintError } from "./view/paintSound";
import { STICKER_MARK } from "./view/contrast";
import { PaletteToggle } from "./view/PaletteToggle";
import { validateFaceletString } from "./cube/validate";
import { solveInWorker, type SolveMethod } from "./solveClient";
import { DECLINED_KEY, SolveStopped, gullicubeBlocked, rememberGullicubeFailure, retryGullicube, solveShorter, type WorkerLike } from "./gullicube/client";
import { DownloadCancelled, cacheHasAll, downloadSolver, removeSolverCache, type SolverManifest } from "./gullicube/download";
import { PROBE_BYTES, SOLVE_SECONDS, SOLVE_TIMEOUT_MS, deviceMemoryHint } from "./gullicube/probe";
import { ShorterSolverBar, type SolverPhase } from "./view/ShorterSolverBar";
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

type Puzzle = 3 | 4 | 5 | "pyraminx" | "master" | "mega";

const SOLVED = faceletsToString(solvedBytes());
const STORAGE = "rubic-lesson-v1";
const ENTERED = "rubic-entered-v1";
const METHOD_KEY = "rubic-method-v1";
const SIZE_KEY = "rubic-size-v1";

export function App() {
  const [entered, setEntered] = useState(() => readEntered());
  const [lesson, setLesson] = useState<Lesson>(() => loadLesson());
  const [letters, setLetters] = useState(true);
  const [mode, setMode] = useState<"cube" | "paint">("cube");
  const [paintCells, setPaintCells] = useState(SOLVED);
  const [paintColor, setPaintColor] = useState("white");
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
  const modeRef = useRef<"cube" | "paint">("cube");
  const runToken = useRef(0);
  const shakeTimer = useRef(0);
  const lessonRef = useRef(lesson);
  const [turnMs, setTurnMs] = useState(750);
  const [method, setMethod] = useState<SolveMethod>(readMethod);
  const [size, setSize] = useState<Puzzle>(readSize);
  const [loadingNote, setLoadingNote] = useState("Preparing the solution… you can keep looking at the cube.");
  const [solverPhase, setSolverPhase] = useState<SolverPhase>("idle");
  const [solverProgress, setSolverProgress] = useState({ received: 0, total: 0 });
  const [solverNote, setSolverNote] = useState<string | null>(null);
  const [solverReason, setSolverReason] = useState<string | null>(null);
  const [solverBlocked, setSolverBlocked] = useState(() => {
    const storage = browserStorage();
    return storage ? gullicubeBlocked(storage) : false;
  });
  const [downloadAttempt, setDownloadAttempt] = useState(0);
  const prepareAbort = useRef<AbortController | null>(null);
  const manifestRef = useRef<SolverManifest | null>(null);
  const solverFiles = useRef<{ name: string; url: string; bytes: number }[]>([]);
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
    try {
      localStorage.setItem(SIZE_KEY, String(size));
    } catch {
      // The choice still applies for this visit.
    }
    if (size !== 3 && method !== "expert") setMethod("expert");
  }, [size, method]);

  useEffect(() => {
    if (size !== 5) {
      setSolverPhase("idle");
      return;
    }
    const controller = new AbortController();
    let gone = false;
    void (async () => {
      try {
        const manifestUrl = new URL("gullicube/manifest.json", assetBase());
        const response = await fetch(manifestUrl, { signal: controller.signal });
        if (!response.ok) throw new Error("The shorter solver list could not be loaded.");
        const manifest = await response.json() as SolverManifest;
        if (gone) return;
        manifestRef.current = manifest;
        const folder = new URL("./", manifestUrl);
        const files = manifest.files.map((file) => ({ name: file.name, bytes: file.bytes, url: new URL(file.name, folder).href }));
        solverFiles.current = files;
        const existing = await caches.keys();
        await Promise.all(existing.filter((name) => name.startsWith("rubic-gullicube-") && name !== manifest.cache).map((name) => caches.delete(name)));
        const cache = await caches.open(manifest.cache);
        const store = {
          match: (url: string) => cache.match(url),
          put: (url: string, body: Response) => cache.put(url, body),
          keys: async () => (await cache.keys()).map((key) => key.url),
        };
        const total = manifest.bytes;
        if (await cacheHasAll(store, files.map((file) => file.url))) {
          if (!gone) {
            setSolverProgress({ received: total, total });
            setSolverPhase("ready");
          }
          return;
        }
        if (browserStorage()?.getItem(DECLINED_KEY) === "1") {
          if (!gone) {
            setSolverProgress({ received: 0, total });
            setSolverPhase("declined");
          }
          return;
        }
        if (!gone) setSolverPhase("downloading");
        let reported = 0;
        await downloadSolver({
          files,
          cache: store,
          signal: controller.signal,
          onProgress: (progress) => {
            const now = Date.now();
            if (progress.received < progress.total && now - reported < 200) return;
            reported = now;
            if (!gone) setSolverProgress(progress);
          },
        });
        if (!gone) setSolverPhase("ready");
      } catch (error) {
        if (gone || controller.signal.aborted || error instanceof DownloadCancelled) return;
        if (!gone) setSolverPhase("failed");
      }
    })();
    return () => {
      gone = true;
      controller.abort();
    };
  }, [size, downloadAttempt]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

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

  async function load(start: string, notice: string | null = null, chosen: SolveMethod = method, fromPaint = false) {
    setLoading(true);
    setError(null);
    try {
      const solution = await prepareSolution(start, chosen);
      setEntered(true);
      setLesson((current) => withSolution({ ...current, history: [] }, start, solution, notice));
      setCheckpoint(null);
      setMode("cube");
    } catch (caught) {
      if (caught instanceof SolveStopped) return;
      const message = caught instanceof Error ? caught.message : "The solution could not be prepared.";
      // A freshly painted 4×4/5×5 can still fail inside the solver when two
      // stickers are swapped in a way no cheap check can see (the wings
      // cannot be paired). That is a colouring problem, not a solver bug, so
      // send the user back to the paint screen with a plain message instead
      // of leaving them stuck on a solver error.
      if (fromPaint && modeRef.current === "paint" && /unpaired|real edge|real corner|did not finish|could not be solved/i.test(message)) {
        rejectPaint("These colours can't make a real cube — one or two stickers are probably swapped. Check the colours and try again.", "F");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function prepareSolution(start: string, chosen: SolveMethod) {
    if (start.length === 150 && start === solvedFiveString()) {
      setLoadingNote("Preparing the solution… you can keep looking at the cube.");
      return solveInWorker(start, "expert", setLoadingNote);
    }
    if (start.length === 150 && solverPhase === "ready" && !solverBlocked && solverFiles.current.length > 0) {
      const controller = new AbortController();
      prepareAbort.current = controller;
      try {
        const outcome = await solveShorter({
          request: {
            facelets: start,
            probeBytes: PROBE_BYTES,
            timeSec: SOLVE_SECONDS,
            files: solverFiles.current,
            deviceMemory: deviceMemoryHint(),
          },
          spawn: () => new Worker(new URL("./worker/gullicubeWorker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike,
          timeoutMs: SOLVE_TIMEOUT_MS,
          fallback: (text, progress) => solveInWorker(text, "expert", progress, controller.signal),
          signal: controller.signal,
          onProgress: setLoadingNote,
          remember: () => {
            const storage = browserStorage();
            if (storage) rememberGullicubeFailure(storage);
            setSolverBlocked(true);
          },
        });
        if (outcome.note) {
          setSolverNote(outcome.note);
          setSolverReason(outcome.reason);
        } else {
          setSolverNote(null);
          setSolverReason(null);
        }
        return outcome.solution;
      } finally {
        prepareAbort.current = null;
      }
    }
    setLoadingNote("Preparing the solution… you can keep looking at the cube.");
    return solveInWorker(start, start.length === 54 ? chosen : "expert", setLoadingNote);
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
    const move = direction === 1 ? nextMove! : invert(lesson.moves[lesson.cursor - 1] ?? "", size);
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
      const solution = await prepareSolution(next, method);
      setCheckpoint(null);
      setLesson((current) => endAnimation(branchFrom(current, next, solution, move, `${move} starts a new solution. ${invertMove(move)} returns to the previous one.`)));
    } catch (caught) {
      setLesson((current) => endAnimation(current));
      if (!(caught instanceof SolveStopped)) {
        setError(caught instanceof Error ? caught.message : "That turn could not be used.");
        await cubeRef.current?.animate("", facelets);
      }
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
    if (lesson.cursor === 0) await cubeRef.current?.animate(invert(move, size), facelets);
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
    prepareAbort.current?.abort();
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

  function cancelDownload() {
    const storage = browserStorage();
    if (storage) storage.setItem(DECLINED_KEY, "1");
    setSolverPhase("declined");
    setDownloadAttempt((value) => value + 1);
  }

  function requestDownload() {
    const storage = browserStorage();
    if (storage) storage.removeItem(DECLINED_KEY);
    setDownloadAttempt((value) => value + 1);
  }

  function retryShorter() {
    const storage = browserStorage();
    if (storage) retryGullicube(storage);
    setSolverBlocked(false);
    setSolverNote(null);
  }

  async function removeCachedSolver() {
    const name = manifestRef.current?.cache;
    if (name) await removeSolverCache(name);
    const storage = browserStorage();
    if (storage) storage.setItem(DECLINED_KEY, "1");
    setSolverPhase("declined");
    setSolverProgress({ received: 0, total: solverProgress.total });
  }

  function chooseSize(next: Puzzle) {
    setSize(next);
    if (next !== 3) setMethod("expert");
    setEntered(false);
    setCheckpoint(null);
    setError(null);
    setMode("cube");
    setLesson(emptyLesson(solvedFor(next)));
  }

  function startPaint() {
    setPaintCells(entered ? facelets : blankFor(size));
    setPaintColor(size === "pyraminx" || size === "master" ? "yellow" : "white");
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
    setPaintCells(blankFor(size));
    setPaintError(null);
    setPaintStep(0);
  }

  function scramblePaint() {
    setPaintCells(applyScramble(size));
    setPaintError(null);
    const faces = size === "mega" ? MEGA_PAINT_ORDER.length : size === "pyraminx" || size === "master" ? PYRA_FACES.length : PAINT_FACES.length;
    setPaintStep(faces - 1);
  }

  function newCube() {
    setEntered(false);
    setCheckpoint(null);
    setLesson(emptyLesson(solvedFor(size)));
    setError(null);
    setMode("cube");
    cubeRef.current?.resetView();
  }

  function paintSticker(index: number) {
    if (paintCells.length === 132) {
      const face = MEGA_PAINT_ORDER[paintStep];
      if (!face || index % 11 === 0 || Math.floor(index / 11) !== ["U", "L", "F", "R", "BR", "BL", "DR", "B", "DL", "FL", "FR", "D"].indexOf(face)) return;
      const letter = MEGA_COLORS.find((color) => color.id === paintColor)?.letter;
      if (!letter) return;
      setPaintCells((current) => current.slice(0, index) + letter + current.slice(index + 1));
      return;
    }
    if (paintCells.length === 36 || paintCells.length === 64) {
      const stride = paintCells.length === 64 ? MASTER_PER_FACE : 9;
      if (Math.floor(index / stride) !== paintStep) return;
      const letter = letterOfColor(paintColor as ColorName);
      setPaintCells((current) => current.slice(0, index) + letter + current.slice(index + 1));
      return;
    }
    const face = PAINT_FACES[paintStep];
    const order: 3 | 4 | 5 = paintCells.length === 150 ? 5 : paintCells.length === 96 ? 4 : 3;
    const stride = order === 5 ? 25 : order === 4 ? 16 : 9;
    if (!face || isCentre(index, order) || Math.floor(index / stride) !== "URFDLB".indexOf(face)) return;
    const letter = { white: "w", yellow: "y", red: "r", orange: "o", blue: "b", green: "g" }[paintColor];
    setPaintCells((current) => current.slice(0, index) + letter + current.slice(index + 1));
  }

  function rejectPaint(message: string, face: string) {
    playPaintError();
    setPaintError(message);
    const mega = paintCells.length === 132;
    const tetra = paintCells.length === 36 || paintCells.length === 64;
    const order = mega ? MEGA_PAINT_ORDER : tetra ? PYRA_FACES : PAINT_FACES;
    setPaintStep(Math.max(0, order.indexOf(face as "F")));
    const pose = mega
      ? megaFacePose(face as "F")
      : tetra && (face === "F" || face === "R" || face === "L" || face === "D")
        ? (paintCells.length === 64 ? masterFacePose(face) : pyraFacePose(face))
        : facePose(face as "F");
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
      const face = paintCells.length === 132
        ? firstBlankMegaFace(paintCells)
        : paintCells.length === 64
          ? masterFirstBlank(paintCells)
          : paintCells.length === 36
            ? pyraFirstBlank(paintCells)
            : faceAfterFailedDone(paintCells);
      rejectPaint(blankMessage(blankCount(paintCells)), face);
      return;
    }
    if (paintCells.length === 64) {
      const master = validateMaster(paintCells);
      if (!master.ok) {
        rejectPaint(master.message, masterFirstBlank(paintCells));
        return;
      }
      const cells = paintCells;
      setEntered(true);
      leavePaint();
      void load(cells, "Solution started from the colours you entered.");
      return;
    }
    if (paintCells.length === 36) {
      const pyraminx = validatePyraminx(paintCells);
      if (!pyraminx.ok) {
        rejectPaint(pyraminx.message, pyraFirstBlank(paintCells));
        return;
      }
      const cells = paintCells;
      setEntered(true);
      leavePaint();
      void load(cells, "Solution started from the colours you entered.");
      return;
    }
    if (paintCells.length === 132) {
      const mega = validateMega(paintCells);
      if (!mega.ok) {
        rejectPaint(mega.issues[0]?.message ?? "This colouring is not a solvable megaminx.", firstBlankMegaFace(paintCells));
        return;
      }
      void load(paintCells, "Solution started from the colours you entered.");
      return;
    }
    if (paintCells.length === 150 || paintCells.length === 96) {
      const checked = paintCells.length === 150 ? validateFive(paintCells) : validateFour(paintCells);
      if (!checked.ok) {
        rejectPaint(checked.message, "F");
        return;
      }
      void load(paintCells, null, method, true);
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
    if (paintCells.length === 132) {
      const face = MEGA_PAINT_ORDER[paintStep] ?? "F";
      const pose = megaFacePose(face);
      cubeRef.current?.setPaintFace(face);
      void cubeRef.current?.lookAt(pose.theta, pose.phi, 680);
      return;
    }
    const tetra = paintCells.length === 36 || paintCells.length === 64;
    const face = (tetra ? PYRA_FACES : PAINT_FACES)[paintStep] ?? "F";
    const pose = tetra ? (paintCells.length === 64 ? masterFacePose : pyraFacePose)(face === "F" || face === "R" || face === "L" || face === "D" ? face : "F") : facePose(face);
    cubeRef.current?.setPaintFace(face);
    void cubeRef.current?.lookAt(pose.theta, pose.phi, 680);
  }, [mode, paintStep]);

  const finished = !nextMove && !lesson.pending;
  const solving = !finished && lesson.moves.length > 0;
  const modeName = method === "beginner" ? "Beginner" : "Expert";
  const headline = solving
    ? solvingHeadline(method, labels.step, Math.min(lesson.cursor + 1, lesson.moves.length), lesson.moves.length)
    : labels.step;
  const moveLine = solving && nextMove ? plainMove(nextMove, size) : "";

  const headerSlot = document.getElementById("header-slot");
  const tools = mode !== "paint" ? (
    <div className="header-tools">
      {!entered ? (
        <select aria-label="Cube size" value={size} onChange={(event) => chooseSize(readPuzzle(event.target.value))}>
          <option value={3}>3×3</option>
          <option value={4}>4×4</option>
          <option value={5}>5×5</option>
          <option value="pyraminx">Pyraminx</option>
          <option value="master">Master Pyraminx</option>
          <option value="mega">Megaminx</option>
        </select>
      ) : null}
      {entered && mode === "cube" ? (
        <nav aria-label="Primary">
          <button type="button" className="text-button" onClick={startPaint}>Edit colours</button>
        </nav>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      {headerSlot && tools ? createPortal(tools, headerSlot) : null}
      <main>
        <section className={mode === "paint" ? "stage-column is-paint" : entered ? "stage-column" : "stage-column is-empty"} aria-labelledby="cube-title">
          {size === 5 ? (
            <ShorterSolverBar
              phase={solverPhase}
              progress={solverProgress}
              blocked={solverBlocked}
              onCancel={cancelDownload}
              onDownload={requestDownload}
              onRetry={retryShorter}
            />
          ) : null}
          <div className="hero">
            <div className={shaking ? "cube-frame is-shaking" : "cube-frame"} data-facelets={mode === "paint" ? paintCells : facelets}>
              <CubeView
                ref={cubeRef}
                facelets={mode === "paint" ? paintCells : facelets}
                letters={letters}
                gesture="view"
                label={mode === "paint" ? paintLabel(paintStep, size) : cubeLabel(facelets, finished ? undefined : nextMove)}
                onPaint={paintSticker}
                paintFace={mode === "paint" ? (paintCells.length === 132 ? MEGA_PAINT_ORDER[paintStep] ?? null : paintCells.length === 36 || paintCells.length === 64 ? PYRA_FACES[paintStep] ?? null : PAINT_FACES[paintStep] ?? null) : null}
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
            <p id="cube-title" className="empty-prompt" data-testid="empty-prompt">{size === "master" ? "Enter your Master Pyraminx's colours to get step-by-step help." : size === "pyraminx" ? "Enter your Pyraminx's colours to get step-by-step help." : size === "mega" ? "Enter your Megaminx's colours to get step-by-step help." : "Enter your cube's colours to get step-by-step help."}</p>
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
              onNext={() => { setPaintError(null); setPaintStep((value) => Math.min((paintCells.length === 132 ? MEGA_PAINT_ORDER.length : paintCells.length === 36 || paintCells.length === 64 ? PYRA_FACES.length : PAINT_FACES.length) - 1, value + 1)); }}
              onDone={finishPaint}
              onClear={clearPaint}
              onScramble={scramblePaint}
              onCancel={() => leavePaint()}
            />
          ) : entered ? (
          <div className="controls">
            <button type="button" className="back" onClick={() => void run(() => go(-1))} disabled={running || lesson.busy || loading || (lesson.cursor === 0 && lesson.history.length === 0 && !lesson.pending)}>Back</button>
            <button type="button" className="primary" onClick={() => void run(() => go(1))} disabled={running || lesson.busy || loading || (!nextMove && lesson.pending?.intent !== "do") || lesson.pending?.intent === "undo"}>Next{lesson.pending?.intent === "do" ? ` · ${lesson.pending.move}` : nextMove ? ` · ${nextMove}` : ""}</button>
            <button type="button" className="fast" data-testid="solve-fast" onClick={() => void solveFast()} disabled={running || lesson.busy || loading || !advanceLesson(lesson)}>Solve 3×</button>
            <button type="button" className={running || loading ? "stop" : "stop is-quiet"} data-testid="stop-solve" onClick={stopSolve} disabled={!(running || loading)} aria-hidden={!(running || loading)} tabIndex={running || loading ? 0 : -1}>Stop</button>
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
          {solverNote ? <p className="notice" data-testid="solver-note" data-reason={solverReason ?? ""} role="status">{solverNote}</p> : null}
          {loading ? <p className="quiet" role="status">{loadingNote}</p> : null}
          {loading && size !== 3 && !entered ? <button type="button" className="text-button" onClick={stopSolve}>Stop</button> : null}
          {entered && mode !== "paint" && reduced ? <p className="quiet">Reduced motion is on. Moves jump to the next state, and the move letter is still announced above.</p> : null}
          {entered && mode !== "paint" && <Disclosure className="options-panel" show="Options" hide="Hide options" controls="options-panel">
            <label className="speed-label">
              Solution
              <select aria-label="Solution method" value={size === 3 ? method : "expert"} disabled={size !== 3} onChange={(event) => {
                const chosen = event.target.value === "beginner" ? "beginner" : "expert";
                setMethod(chosen);
                void load(facelets, null, chosen);
              }}>
                <option value="expert">Expert</option>
                {size === 3 ? <option value="beginner">Beginner</option> : null}
              </select>
            </label>
            <label className="speed-label">
              Cube
              <select aria-label="Cube size" value={size} onChange={(event) => chooseSize(readPuzzle(event.target.value))}>
                <option value={3}>3×3</option>
                <option value={4}>4×4</option>
                <option value={5}>5×5</option>
                <option value="pyraminx">Pyraminx</option>
                <option value="master">Master Pyraminx</option>
                <option value="mega">Megaminx</option>
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
              <button type="button" onClick={() => void load(applyScramble(size), null)} disabled={running || lesson.busy || loading}>Scramble</button>
              <button type="button" onClick={() => { setCheckpoint(null); setLesson(emptyLesson(solvedFor(size))); setError(null); }} disabled={running || lesson.busy}>Reset</button>
              <button type="button" onClick={newCube} disabled={running || lesson.busy || loading}>New cube</button>
              <button type="button" onClick={() => void run(() => replayMove())} disabled={running || lesson.busy || loading || (!nextMove && lesson.cursor === 0)}>Replay move</button>
              <button type="button" onClick={() => cubeRef.current?.resetView()}>Reset view</button>
            </div>
            <PaletteToggle />
            <label className="check">
              <input type="checkbox" checked={letters} onChange={(event) => setLetters(event.target.checked)} />
              Letter stickers (W Y R O B G) as well as colour
            </label>
            <p className="quiet">{size === "master" ? MASTER_HOLD : size === "pyraminx" ? PYRA_HOLD : size === "mega" ? "Hold the white centre on top, the grey centre on the bottom, and the green centre facing you. Right is red." : facelets.length === 150 ? "Hold the yellow centre on top, the white centre on the bottom, and the green centre facing you. Right is orange." : facelets.length === 54 ? holdLine(stringToFacelets(facelets)) : "Hold yellow on top, white on the bottom, and green in front. Right is orange."}</p>
            <p className="quiet">{size === "master"
              ? "Uw turns three layers around a tip. U turns the tip and the layer under it. A lowercase letter turns only the tip. Clockwise is as you look at the tip. Solve 3× plays the remaining moves at three times the selected speed."
              : size === "pyraminx"
              ? "A capital letter turns that tip and the layer under it. A lowercase letter turns only the tip. Clockwise is as you look at the tip. Solve 3× plays the remaining moves at three times the selected speed. Restore before solve returns to the Pyraminx as it was when that run started."
              : size === "mega"
              ? "R means the right face. A letter alone is 72° clockwise as you look at that face, and ' is 72° the other way. ++ is 144° clockwise and -- is 144° the other way. The same suffixes work on every face, including BR, BL and the lower faces. Solve 3× plays the remaining moves at three times the selected speed."
              : "R means the right face, not red. A letter alone is clockwise as you look at that face. 2 is a half turn. Solve 3× plays the remaining moves at three times the selected speed. Restore before solve returns to the cube as it was when that run started."}</p>
            <p className="quiet">{size === 5
              ? "5×5 is Expert only. The shorter solver is Tomas Rokicki’s gullicube (MPL-2.0). If it is not downloaded, or this device cannot run it, centres are solved first, then the edges, then the cube is reduced to a 3×3. A solution is correct, not a claim that no shorter one exists. White sits opposite yellow, red opposite orange, and blue opposite green."
              : size === 4
                ? "4×4 is Expert only. It has no fixed centre. Centres are solved first, then the edges, including the parity cases, then the cube is reduced to a 3×3. A solution is correct, not a claim that no shorter one exists."
              : size === "master"
                ? "Master Pyraminx is Expert only. Wings are paired with the midges, that Pyraminx is solved with wide turns, then the face centres are restored. Yellow is on the bottom, green in front, red on the right, and blue on the left."
              : size === "pyraminx"
                ? "Pyraminx is Expert only. There is no beginner lesson. Yellow is on the bottom, green in front, red on the right, and blue on the left. The layer turns are the shortest way to solve the edges and centres. Each tip is then turned into place, at most one turn."
              : size === "mega"
                ? "Megaminx is Expert only. White is opposite grey, red opposite orange, green opposite lime, yellow opposite cream, purple opposite pink, and blue opposite sky. Around white, clockwise from the front, the faces are green, purple, yellow, blue and red. A solution is correct, not a claim that no shorter one exists."
                : "Ordinary Western 3×3: white opposite yellow, red opposite orange, blue opposite green. Colours stay in this browser. Expert is a fast two-phase search. Beginner is the layer-by-layer lesson."}</p>
            {size === 5 && solverPhase === "ready" ? (
              <button type="button" onClick={() => void removeCachedSolver()}>Remove cached solver</button>
            ) : null}
          </Disclosure>}
          </div>
        </section>
      </main>
    </>
  );
}

function PaintStatus({ step, cells, error }: { step: number; cells: string; error: string | null }) {
  if (cells.length === 132) {
    const face = MEGA_PAINT_ORDER[step] ?? "F";
    const guide = megaGuide(face);
    return (
      <div className="status" aria-live="polite">
        <p id="cube-title" className="status-title" data-testid="paint-face">{guide.title} · {step + 1} of {MEGA_PAINT_ORDER.length}</p>
        <p className="quiet">{guide.turn}</p>
        <p className="quiet" data-testid="paint-progress">{filledOnMegaFace(cells, face)}/{megaPaintCount()} filled</p>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    );
  }
  const master = cells.length === 64;
  const pyra = cells.length === 36 || master;
  const face = (pyra ? PYRA_FACES : PAINT_FACES)[step] ?? "F";
  const guide = master ? MASTER_GUIDE[face as "F"] : pyra ? PYRA_GUIDE[face as "F"] : PAINT_GUIDE[face];
  const filled = master ? masterFilled(cells, face as "F") : pyra ? pyraFilled(cells, face as "F") : filledOnFace(cells, face);
  const total = master ? MASTER_PER_FACE : pyra ? 9 : paintableOnFace(cells.length === 150 ? 5 : cells.length === 96 ? 4 : 3);
  const steps = pyra ? PYRA_FACES.length : PAINT_FACES.length;
  return (
    <div className="status" aria-live="polite">
      <p id="cube-title" className="status-title" data-testid="paint-face">{guide.title} · {step + 1} of {steps}</p>
      <p className="quiet">{cells.length === 96 ? "A 4×4 has no fixed centre. Paint every sticker you see. The solution keeps yellow on top, white on the bottom, and green in front." : guide.turn}</p>
      <p className="quiet" data-testid="paint-progress">{filled}/{total} filled</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}

const STICKER_NAME: Record<string, string> = { w: "white", y: "yellow", r: "red", o: "orange", b: "blue", g: "green" };

function PaintControls({ step, cells, color, onColor, onPaint, onBack, onNext, onDone, onClear, onScramble, onCancel }: {
  step: number;
  cells: string;
  color: string;
  onColor: (color: string) => void;
  onPaint: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
  onDone: () => void;
  onClear: () => void;
  onScramble: () => void;
  onCancel: () => void;
}) {
  const master = cells.length === 64;
  const mega = cells.length === 132;
  const pyra = cells.length === 36 || master;
  const faces = mega ? MEGA_PAINT_ORDER : pyra ? PYRA_FACES : PAINT_FACES;
  const last = step === faces.length - 1;
  const face = faces[step] ?? "F";
  const guide = mega ? megaGuide(face as "F") : master ? MASTER_GUIDE[face as "F"] : pyra ? PYRA_GUIDE[face as "F"] : PAINT_GUIDE[face as "F"];
  const palette = mega ? MEGA_COLORS.map((entry) => entry.id) : master ? MASTER_COLORS : pyra ? PYRA_COLORS : COLORS;
  return (
    <div className="paint-bar">
      <div className={mega ? "palette paint-palette is-twelve" : "palette paint-palette"} role="group" aria-label="Paint colour">
        {palette.map((name) => (
          <button key={name} type="button" data-colour={name} aria-pressed={color === name} aria-label={name} onClick={() => onColor(name)}>{mega ? MEGA_COLORS.find((entry) => entry.id === name)?.mark : STICKER_MARK[name as ColorName]}</button>
        ))}
      </div>
      <div className="sr-only" role="group" aria-label={`${guide.title} stickers`}>
        {mega ? Array.from({ length: 10 }, (_, local) => {
          const index = ["U", "L", "F", "R", "BR", "BL", "DR", "B", "DL", "FL", "FR", "D"].indexOf(face) * 11 + local + 1;
          const current = cells[index] === "." ? "blank" : cells[index];
          return <button key={index} type="button" onClick={() => onPaint(index)} aria-label={`${guide.title} sticker ${local + 1}, ${current}`} />;
        }) : pyra ? Array.from({ length: master ? MASTER_PER_FACE : 9 }, (_, local) => {
          const stride = master ? MASTER_PER_FACE : 9;
          const index = step * stride + local;
          const current = cells[index] === "." ? "blank" : STICKER_NAME[cells[index] ?? ""] ?? "unknown";
          const label = master ? masterStickerLabel(PYRA_FACES[step]!, local) : pyraStickerLabel(PYRA_FACES[step]!, local);
          return (
            <button
              key={index}
              type="button"
              onClick={() => onPaint(index)}
              aria-label={`${label}, ${current}`}
            />
          );
        }) : Array.from({ length: cells.length === 150 ? 5 : cells.length === 96 ? 4 : 3 }, (_, row) => row).flatMap((row) => Array.from({ length: cells.length === 150 ? 5 : cells.length === 96 ? 4 : 3 }, (_, col) => {
          const order = cells.length === 150 ? 5 : cells.length === 96 ? 4 : 3;
          const index = faceletIndex(face as "F", row, col, order);
          const current = cells[index] === "." ? "blank" : STICKER_NAME[cells[index] ?? ""] ?? "unknown";
          const centre = isCentre(index, order);
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
      <div className="paint-row">
        <button type="button" className="paint-clear" onClick={onScramble}>Scramble</button>
        <button type="button" className="paint-clear" onClick={onClear}>Clear all</button>
      </div>
    </div>
  );
}

function assetBase(): string {
  const meta = import.meta as { env?: { BASE_URL?: string } };
  return new URL(meta.env?.BASE_URL ?? "/rubic/", window.location.href).href;
}

function browserStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function paintLabel(step: number, puzzle: Puzzle): string {
  if (puzzle === "mega") {
    const face = MEGA_PAINT_ORDER[step] ?? "F";
    const guide = megaGuide(face);
    return `Painting the ${guide.title.toLowerCase()} face. ${guide.turn}`;
  }
  if (puzzle === "master") {
    const face = PYRA_FACES[step] ?? "F";
    return `Painting the ${MASTER_GUIDE[face].title.toLowerCase()} face. ${MASTER_GUIDE[face].turn}`;
  }
  if (puzzle === "pyraminx") {
    const face = PYRA_FACES[step] ?? "F";
    return `Painting the ${PYRA_GUIDE[face].title.toLowerCase()} face. ${PYRA_GUIDE[face].turn}`;
  }
  const face = PAINT_FACES[step] ?? "F";
  return `Painting the ${PAINT_GUIDE[face].title.toLowerCase()} face. ${PAINT_GUIDE[face].turn}`;
}

function plainMove(move: string, cubeSize: Puzzle = 3): string {
  if (cubeSize === "mega") return `${move}. ${megaMoveSpeech(move)}`;
  if (cubeSize === "master") return `${move}. ${masterMoveSpeech(move)}`;
  if (cubeSize === "pyraminx") return `${move}. ${pyraMoveSpeech(move)}`;
  if (cubeSize === 5) return `${move}. ${fiveMoveSpeech(move)}`;
  if (cubeSize === 4) return `${move}. ${fourMoveSpeech(move)}`;
  if (move.endsWith("2")) {
    const face = move[0] ?? "";
    return `${move}. Half turn: ${moveDirection(face)} and then the same way again.`;
  }
  return `${move}. ${moveDirection(move)}.`;
}

function invert(move: string, cubeSize: Puzzle): string {
  if (cubeSize === 4) return invertFourMove(move);
  return invertMove(move);
}

function applyScramble(cubeSize: Puzzle): string {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  if (cubeSize === "mega") return applyMegaString(solvedMegaString(), randomMegaScramble(mulberry32(seed), 20));
  if (cubeSize === "master") return applyMasterMoves(solvedMasterString(), randomMasterScramble(mulberry32(seed)));
  if (cubeSize === "pyraminx") return applyPyraMoves(solvedPyraString(), randomPyraScramble(mulberry32(seed)));
  if (cubeSize === 5) return applyFiveString(solvedFiveString(), randomFiveScramble(mulberry32(seed), 40));
  if (cubeSize === 4) return applyFourString(solvedFourString(), randomFourScramble(mulberry32(seed), 40));
  return faceletsToString(applyMoves(solvedBytes(), randomScramble(mulberry32(seed), 22)));
}

function solvedFor(cubeSize: Puzzle): string {
  if (cubeSize === "mega") return solvedMegaString();
  if (cubeSize === "master") return solvedMasterString();
  if (cubeSize === "pyraminx") return solvedPyraString();
  if (cubeSize === 5) return solvedFiveString();
  if (cubeSize === 4) return solvedFourString();
  return faceletsToString(solvedBytes());
}

function readPuzzle(value: string | null): Puzzle {
  if (value === "4") return 4;
  if (value === "5") return 5;
  if (value === "mega") return "mega";
  if (value === "pyraminx") return "pyraminx";
  if (value === "master") return "master";
  return 3;
}

function blankFor(size: Puzzle): string {
  if (size === "mega") return blankMegaPaint();
  if (size === "master") return blankMaster();
  if (size === "pyraminx") return blankPyra();
  return blankPaint(size);
}

function holdLine(state: ReturnType<typeof stringToFacelets>): string {
  return `Hold the ${centerColor(state, "U")} centre on top, the ${centerColor(state, "D")} centre on the bottom, and the ${centerColor(state, "F")} centre facing you. Right is ${centerColor(state, "R")}.`;
}

function cubeLabel(facelets: string, move: string | undefined): string {
  if (facelets.length === 132) {
    const line = "Hold the white centre on top, the grey centre on the bottom, and the green centre facing you. Right is red.";
    return move ? `Megaminx. Next move ${move}. ${line}` : `Megaminx. ${line}`;
  }
  if (facelets.length === 64) {
    return move ? `Master Pyraminx. Next move ${move}. ${MASTER_HOLD}` : `Master Pyraminx. ${MASTER_HOLD}`;
  }
  if (facelets.length === 36) {
    return move ? `Pyraminx. Next move ${move}. ${PYRA_HOLD}` : `Pyraminx. ${PYRA_HOLD}`;
  }
  if (facelets.length === 96) {
    const line = "4×4 has no fixed centre. Yellow stays on top, white on the bottom, and green in front.";
    return move ? `Cube. Next move ${move}. ${line}` : `Cube. ${line}`;
  }
  if (facelets.length === 150) {
    const line = "Hold the yellow centre on top, the white centre on the bottom, and the green centre facing you. Right is orange.";
    return move ? `Cube. Next move ${move}. ${line}` : `Cube. ${line}`;
  }
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

function readSize(): Puzzle {
  try {
    return readPuzzle(localStorage.getItem(SIZE_KEY));
  } catch {
    return 3;
  }
}

function loadLesson(): Lesson {
  const solved = solvedFor(readSize());
  if (!readEntered()) return emptyLesson(solved);
  try {
    const raw = sessionStorage.getItem(STORAGE) || localStorage.getItem(STORAGE);
    if (!raw) return emptyLesson(solved);
    const saved = JSON.parse(raw) as Lesson;
    if (!saved.start || !Array.isArray(saved.moves) || saved.start.length !== solved.length) return emptyLesson(solved);
    return { ...emptyLesson(solved), ...saved, busy: false, arrivedBy: saved.arrivedBy ?? null, pending: saved.pending ?? null };
  } catch {
    return emptyLesson(solved);
  }
}
