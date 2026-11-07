import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { COLORS, type ColorName, type Face, faceletsToString } from "../cube/model";
import { applyOrientation, validateBytes, type OrientationFix } from "../cube/validate";
import { propagateCentreNames } from "../scan/calibrate";
import {
  CANONICAL_RGB,
  FULL_DISTANCE_LIMIT,
  defaultFaceCrop,
  fullLabDistance,
  FACE_SAMPLE_MARGIN,
  nameFromCanonical,
  rgbToLab,
  sampleFaceGrid,
  warpQuad,
  type NormPoint,
  type Raster,
} from "../scan/color";
import { CAPTURES, reconstructCube } from "../scan/mapping";
import { CubeView } from "./CubeView";

interface DraftSticker {
  lab: { L: number; a: number; b: number };
  rgb: [number, number, number];
  name: ColorName;
  uncertain: boolean;
  confirmed: boolean;
  touched: boolean;
}

type Crop = [NormPoint, NormPoint, NormPoint, NormPoint];

interface Shot {
  url: string;
  image: ImageData;
  crop: Crop;
}

const EMPTY: Record<Face, DraftSticker[] | null> = { U: null, R: null, F: null, D: null, L: null, B: null };
const CORNERS = ["Top-left corner of the face", "Top-right corner of the face", "Bottom-right corner of the face", "Bottom-left corner of the face"];

export function ScanFlow({ onCancel, onAccept }: { onCancel: () => void; onAccept: (facelets: string) => void }) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"capture" | "viewfinder" | "edit" | "review">("capture");
  const [draft, setDraft] = useState(EMPTY);
  const [shot, setShot] = useState<Shot | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [confirmedLook, setConfirmedLook] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => stopCamera(streamRef.current), []);
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (phase !== "viewfinder" || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => setStreamError("The camera preview could not start. Go back and upload a photo."));
  }, [phase]);

  const capture = CAPTURES[step]!;
  const current = draft[capture.face];
  const confirmName = step === CAPTURES.length - 1 ? "Review cube" : "Confirm colours & next face";

  async function startCamera() {
    setStreamError(null);
    stopCamera(streamRef.current);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setPhase("viewfinder");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStreamError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Camera permission was denied. Upload a photo instead, or enter the colours by hand."
          : "No camera is available on this device. Upload a photo, or enter the colours by hand.",
      );
      setPhase("capture");
    }
  }

  function shootFromVideo() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setStreamError("The camera has not produced a frame yet. Wait a moment, or go back and upload a photo.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0);
    storeFace(context.getImageData(0, 0, canvas.width, canvas.height));
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0);
      storeFace(context.getImageData(0, 0, canvas.width, canvas.height));
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setStreamError("That image could not be read. Try another photo.");
    };
    image.src = url;
  }

  function sample(image: ImageData, crop: Crop, previous: DraftSticker[] | null): DraftSticker[] {
    const warped = warpQuad(image as Raster, crop);
    const patches = sampleFaceGrid(warped, { x: 0, y: 0, width: warped.width, height: warped.height });
    return patches.map((patch, index) => {
      const kept = previous?.[index];
      if (kept?.touched) return kept;
      const named = nameFromCanonical(patch.lab);
      const full = fullLabDistance(patch.lab, rgbToLab(...CANONICAL_RGB[named.name]));
      const uncertain = named.confidence < 0.2 || named.distance > 0.45 || full > FULL_DISTANCE_LIMIT;
      return {
        lab: patch.lab,
        rgb: patch.rgb,
        name: named.name,
        uncertain,
        confirmed: !uncertain,
        touched: false,
      };
    });
  }

  function storeFace(image: ImageData) {
    const crop = defaultFaceCrop();
    setShot({ url: rasterUrl(image), crop, image });
    setDraft((value) => ({ ...value, [capture.face]: sample(image, crop, null) }));
    setSelected(0);
    setPhase("edit");
    stopCamera(streamRef.current);
    streamRef.current = null;
  }

  function moveCrop(next: Crop) {
    if (!shot) return;
    const image = shot.image;
    setShot({ ...shot, crop: next });
    setDraft((value) => ({ ...value, [capture.face]: sample(image, next, value[capture.face]) }));
  }

  function paint(index: number, name: ColorName) {
    setDraft((value) => {
      const face = value[capture.face];
      if (!face) return value;
      const next = face.slice();
      const sticker = next[index];
      if (!sticker) return value;
      next[index] = { ...sticker, name, confirmed: true, touched: true, uncertain: false };
      const updated = { ...value, [capture.face]: next };
      return index === 4 ? propagateCentreNames(updated) : updated;
    });
  }

  function acceptFace() {
    if (!current || current.some((sticker) => sticker.uncertain && !sticker.confirmed)) return;
    if (step < CAPTURES.length - 1) {
      setStep(step + 1);
      setPhase("capture");
      setShot(null);
      return;
    }
    setDraft((value) => propagateCentreNames(value));
    setPhase("review");
    setConfirmedLook(false);
  }

  const review = phase === "review" ? buildReview(draft) : null;
  const blocked = Boolean(current?.some((sticker) => sticker.uncertain && !sticker.confirmed));

  return (
    <section className="scan" aria-labelledby="scan-title">
      <header className="panel-head">
        <p className="eyebrow">{phase === "review" ? "Scan · review" : `Face ${step + 1} of 6`}</p>
        <h2 id="scan-title">{phase === "review" ? "Check the cube" : capture.title}</h2>
        <button type="button" className="ghost" onClick={() => { stopCamera(streamRef.current); onCancel(); }}>Close</button>
      </header>
      {phase === "capture" ? (
        <div className="scan-copy">
          <p className="lead">{capture.instruction}</p>
          <p>{capture.detail}</p>
          <p className="quiet">Centres are this cube&apos;s colour references. White is opposite yellow, red opposite orange, blue opposite green. Photos stay in this browser.</p>
          {streamError ? <p className="error" role="alert">{streamError}</p> : null}
          <div className="row">
            <button type="button" className="primary" onClick={() => void startCamera()}>Capture photo</button>
          </div>
          <div className="row">
            <label className="file">
              Upload a photo
              <input data-testid="scan-upload" type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} />
            </label>
            {step > 0 ? <button type="button" className="ghost" onClick={() => setStep(step - 1)}>Previous face</button> : null}
          </div>
        </div>
      ) : null}
      {phase === "viewfinder" ? (
        <div className="camera-wrap">
          <div className="viewfinder">
            <video ref={videoRef} playsInline muted aria-label="Camera preview" />
            <div className="grid" aria-hidden="true" />
          </div>
          <p>Fill the frame with this one face. The top of the cube is the top of the photo.</p>
          {streamError ? <p className="error" role="alert">{streamError}</p> : null}
          <div className="row">
            <button type="button" className="primary" onClick={shootFromVideo}>Take photo</button>
            <button type="button" className="ghost" onClick={() => { stopCamera(streamRef.current); setPhase("capture"); }}>Back</button>
          </div>
        </div>
      ) : null}
      {phase === "edit" && current && shot ? (
        <div className="edit-layout">
          <div>
            <p className="lead">Drag the corners onto the face, then tap any sticker that is wrong.</p>
            <FaceCrop url={shot.url} crop={shot.crop} onChange={moveCrop} />
          </div>
          <div>
            <p>Tap a sticker, then choose its colour. Dashed stickers are uncertain and block the next step. The centre counts too.</p>
            <StickerGrid stickers={current} selected={selected} onSelect={setSelected} />
            <Palette onPick={(name) => paint(selected, name)} />
            {blocked ? <p className="error" role="status">Choose a colour for each dashed sticker before continuing.</p> : null}
            <div className="row">
              <button type="button" className="primary" onClick={acceptFace} disabled={blocked}>{confirmName}</button>
            </div>
            <div className="row">
              <button type="button" className="ghost" onClick={() => setPhase("capture")}>Retake</button>
            </div>
          </div>
        </div>
      ) : null}
      {phase === "review" && review ? (
        <Review
          draft={draft}
          message={review.message}
          fixes={review.fixes}
          facelets={review.facelets}
          solvable={review.solvable}
          confirmedLook={confirmedLook}
          onConfirmLook={setConfirmedLook}
          onRotate={(face) => setDraft((value) => rotateDraftFace(value, face))}
          onRetake={(face) => {
            const index = CAPTURES.findIndex((item) => item.face === face);
            setStep(index);
            setPhase("capture");
          }}
          onRestart={() => {
            setDraft(EMPTY);
            setStep(0);
            setPhase("capture");
            setConfirmedLook(false);
          }}
          onAccept={() => review.facelets && review.solvable && onAccept(review.facelets)}
        />
      ) : null}
    </section>
  );
}

function FaceCrop({ url, crop, onChange }: { url: string; crop: Crop; onChange: (crop: Crop) => void }) {
  const stageRef = useRef<HTMLDivElement>(null);

  function setCorner(index: number, x: number, y: number) {
    const next = crop.map((point, item) => (item === index ? { x: clamp01(x), y: clamp01(y) } : point)) as Crop;
    onChange(next);
  }

  function pointer(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Keyboard and dispatched events still move the corner.
    }
    const move = (next: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      setCorner(index, (next.clientX - rect.left) / rect.width, (next.clientY - rect.top) / rect.height);
    };
    const stop = () => {
      event.currentTarget.removeEventListener("pointermove", move);
      event.currentTarget.removeEventListener("pointerup", stop);
    };
    event.currentTarget.addEventListener("pointermove", move);
    event.currentTarget.addEventListener("pointerup", stop);
  }

  function keys(index: number, event: ReactKeyboardEvent<HTMLButtonElement>) {
    const step = 0.02;
    const point = crop[index]!;
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") setCorner(index, point.x - step, point.y);
    if (event.key === "ArrowRight") setCorner(index, point.x + step, point.y);
    if (event.key === "ArrowUp") setCorner(index, point.x, point.y - step);
    if (event.key === "ArrowDown") setCorner(index, point.x, point.y + step);
  }

  const polygon = crop.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");
  return (
    <div className="crop-stage" ref={stageRef}>
      <img src={url} alt="Photo of this face. The corners show the area that is read." />
      <svg className="crop-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polygon points={polygon} />
      </svg>
      {crop.map((point, index) => (
        <button
          key={CORNERS[index]}
          type="button"
          className="crop-handle"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          aria-label={CORNERS[index]}
          onPointerDown={(event) => pointer(index, event)}
          onKeyDown={(event) => keys(index, event)}
        />
      ))}
      <p className="quiet">Arrow keys nudge a selected corner. The default crop leaves a {Math.round(FACE_SAMPLE_MARGIN * 100)}% border.</p>
    </div>
  );
}

function Review({
  draft,
  message,
  fixes,
  facelets,
  solvable,
  confirmedLook,
  onConfirmLook,
  onRotate,
  onRetake,
  onRestart,
  onAccept,
}: {
  draft: Record<Face, DraftSticker[] | null>;
  message: string;
  fixes: OrientationFix[];
  facelets: string | null;
  solvable: boolean;
  confirmedLook: boolean;
  onConfirmLook: (value: boolean) => void;
  onRotate: (face: Face) => void;
  onRetake: (face: Face) => void;
  onRestart: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="review">
      <p role="status">{message}</p>
      <p className="sr-only" data-testid="scan-facelets">{facelets ?? ""}</p>
      {facelets ? (
        <div className="preview-stage">
          <CubeView facelets={facelets} letters gesture="off" label="Reconstructed cube. Compare it with the physical cube before solving." />
        </div>
      ) : null}
      <div className="review-grid">
        {CAPTURES.map((capture) => (
          <div key={capture.face} className="review-face">
            <h3>{capture.title}</h3>
            <StickerGrid stickers={draft[capture.face] ?? []} selected={-1} onSelect={() => undefined} />
            <div className="row">
              <button type="button" className="ghost" onClick={() => onRotate(capture.face)}>Rotate this photo</button>
              <button type="button" className="ghost" onClick={() => onRetake(capture.face)}>Retake</button>
            </div>
          </div>
        ))}
      </div>
      {fixes.length > 1 ? <p>Several photo rotations would each look legal. None is applied automatically. Rotate or retake the face that looks wrong.</p> : null}
      {solvable ? (
        <label className="check">
          <input type="checkbox" checked={confirmedLook} onChange={(event) => onConfirmLook(event.target.checked)} />
          The preview matches my cube
        </label>
      ) : (
        <p>This colouring cannot be solved. Correct a face, or restart the scan. Nothing was guessed into a legal cube.</p>
      )}
      <div className="row">
        <button type="button" className="primary" disabled={!facelets || !solvable || !confirmedLook} onClick={onAccept}>Start solving</button>
      </div>
      <div className="row">
        <button type="button" className="ghost" onClick={onRestart}>Restart scan</button>
      </div>
    </div>
  );
}

function StickerGrid({ stickers, selected, onSelect }: { stickers: DraftSticker[]; selected: number; onSelect: (index: number) => void }) {
  return (
    <div className="sticker-grid" role="grid" aria-label="Nine stickers">
      {stickers.map((sticker, index) => (
        <button
          key={index}
          type="button"
          role="gridcell"
          className={`sticker ${sticker.uncertain && !sticker.confirmed ? "uncertain" : ""} ${selected === index ? "selected" : ""}`}
          style={{ background: sticker.touched ? undefined : `rgb(${sticker.rgb.join(",")})` }}
          data-colour={sticker.name}
          aria-pressed={selected === index}
          aria-label={`${sticker.name}${index === 4 ? " centre" : ""}${sticker.uncertain && !sticker.confirmed ? ", uncertain, tap to confirm" : ""}`}
          onClick={() => onSelect(index)}
        >
          <span>{sticker.name[0]?.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}

function Palette({ onPick }: { onPick: (name: ColorName) => void }) {
  return (
    <div className="palette" role="group" aria-label="Colour palette">
      {COLORS.map((name) => (
        <button key={name} type="button" data-colour={name} onClick={() => onPick(name)}>
          {name}
        </button>
      ))}
    </div>
  );
}

function buildReview(draft: Record<Face, DraftSticker[] | null>): { facelets: string | null; solvable: boolean; message: string; fixes: OrientationFix[] } {
  if (CAPTURES.some((capture) => !draft[capture.face])) {
    return { facelets: null, solvable: false, message: "A face is missing. Retake it before solving.", fixes: [] };
  }
  const photos = Object.fromEntries(CAPTURES.map((capture) => [capture.face, draft[capture.face]!.map((sticker) => sticker.name)])) as Record<Face, ColorName[]>;
  let bytes = reconstructCube(photos);
  let verdict = validateBytes(bytes);
  const appliedFix = !verdict.ok && verdict.fixes.length === 1 ? verdict.fixes[0]! : null;
  if (appliedFix) {
    bytes = applyOrientation(bytes, appliedFix.quarters);
    verdict = validateBytes(bytes, { searchRotations: false });
  }
  if (!verdict.ok) {
    return {
      facelets: faceletsToString(bytes),
      solvable: false,
      message: verdict.issues.map((issue) => issue.message).join(" "),
      fixes: verdict.fixes,
    };
  }
  return {
    facelets: faceletsToString(bytes),
    solvable: true,
    message: appliedFix
      ? `One photo rotation makes a solvable cube (${appliedFix.summary}). Compare the preview with the cube in your hands, then start solving.`
      : "These colours can exist on a normal cube. Compare the preview with yours, then start solving.",
    fixes: [],
  };
}

function rotateDraftFace(draft: Record<Face, DraftSticker[] | null>, face: Face): Record<Face, DraftSticker[] | null> {
  const stickers = draft[face];
  if (!stickers) return draft;
  const ring = [0, 1, 2, 5, 8, 7, 6, 3];
  const next = stickers.slice();
  for (let i = 0; i < 8; i++) next[ring[(i + 2) % 8]!] = stickers[ring[i]!]!;
  return { ...draft, [face]: next };
}

function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function clamp01(value: number): number {
  return Math.max(0.02, Math.min(0.98, value));
}

function rasterUrl(image: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
