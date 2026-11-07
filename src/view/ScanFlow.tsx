import { useEffect, useRef, useState } from "react";
import { COLORS, type ColorName, type Face, faceletsToString } from "../cube/model";
import { FACE_SAMPLE_MARGIN, nameFromCanonical, sampleFaceGrid, type Lab, type Raster } from "../scan/color";
import { propagateCentreNames } from "../scan/calibrate";
import { CAPTURES, reconstructCube } from "../scan/mapping";
import { applyOrientation, validateBytes, type OrientationFix } from "../cube/validate";
import { CubeView } from "./CubeView";

interface DraftSticker {
  lab: Lab;
  rgb: [number, number, number];
  name: ColorName;
  uncertain: boolean;
  confirmed: boolean;
  touched: boolean;
}

const EMPTY: Record<Face, DraftSticker[] | null> = { U: null, R: null, F: null, D: null, L: null, B: null };

export function ScanFlow({ onCancel, onAccept }: { onCancel: () => void; onAccept: (facelets: string) => void }) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"intro" | "camera" | "fix" | "review">("intro");
  const [draft, setDraft] = useState(EMPTY);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [confirmedLook, setConfirmedLook] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => stopCamera(streamRef.current), []);

  const capture = CAPTURES[step]!;
  const current = draft[capture.face];

  async function startCamera() {
    setStreamError(null);
    stopCamera(streamRef.current);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("camera");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStreamError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Camera permission was denied. You can upload a photo instead, or enter the colours by hand."
          : "No camera is available on this device. Upload a photo, or enter the colours by hand.",
      );
      setPhase("camera");
    }
  }

  function shootFromVideo() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setStreamError("The camera has not produced a frame yet. Wait a moment, or upload a photo.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    storeFace(image);
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

  function storeFace(image: ImageData) {
    const margin = Math.round(Math.min(image.width, image.height) * FACE_SAMPLE_MARGIN);
    const patches = sampleFaceGrid(image as Raster, {
      x: margin,
      y: margin,
      width: image.width - margin * 2,
      height: image.height - margin * 2,
    });
    const stickers: DraftSticker[] = patches.map((patch) => {
      const named = nameFromCanonical(patch.lab);
      return {
        lab: patch.lab,
        rgb: patch.rgb,
        name: named.name,
        uncertain: named.confidence < 0.2,
        confirmed: named.confidence >= 0.2,
        touched: false,
      };
    });
    setDraft((value) => ({ ...value, [capture.face]: stickers }));
    setSelected(0);
    setPhase("fix");
    stopCamera(streamRef.current);
    streamRef.current = null;
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
      setPhase("intro");
      return;
    }
    setDraft((value) => propagateCentreNames(value));
    setPhase("review");
    setConfirmedLook(false);
  }

  const review = phase === "review" ? buildReview(draft) : null;

  return (
    <section className="scan" aria-labelledby="scan-title">
      <header className="panel-head">
        <p className="eyebrow">Scan · stays in this browser</p>
        <h2 id="scan-title">{phase === "review" ? "Check all six faces" : capture.title}</h2>
        <button type="button" className="ghost" onClick={() => { stopCamera(streamRef.current); onCancel(); }}>Close</button>
      </header>
      {phase === "intro" ? (
        <div className="scan-copy">
          <HoldDiagram step={step} />
          <p className="lead">{capture.instruction}</p>
          <p>{capture.detail}</p>
          <p className="quiet">Photograph all six faces. Three is not enough. Between photos, turn the whole cube as one block. Do not turn a layer. Centres on opposite faces are assumed to be the usual pairs: white opposite yellow, red opposite orange, blue opposite green.</p>
          <div className="row">
            <button type="button" onClick={() => void startCamera()}>Use camera</button>
            <label className="file">
              Upload a photo
              <input data-testid="scan-upload" type="file" accept="image/*" capture="environment" onChange={(event) => onFile(event.target.files?.[0])} />
            </label>
          </div>
        </div>
      ) : null}
      {phase === "camera" ? (
        <div className="camera-wrap">
          <div className="viewfinder">
            <video ref={videoRef} playsInline muted aria-label="Camera preview" />
            <div className="grid" aria-hidden="true" />
          </div>
          {streamError ? <p className="error" role="alert">{streamError}</p> : <p>Fill the frame with one face. The grid should sit on the stickers, not on the background.</p>}
          <div className="row">
            <button type="button" onClick={shootFromVideo} disabled={Boolean(streamError)}>Capture</button>
            <label className="file">
              Upload instead
              <input data-testid="scan-upload" type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} />
            </label>
            <button type="button" className="ghost" onClick={() => { stopCamera(streamRef.current); setPhase("intro"); }}>Back</button>
          </div>
        </div>
      ) : null}
      {phase === "fix" && current ? (
        <div>
          <p>Tap any sticker, including the centre, if the colour is wrong. Dashed stickers are uncertain and need a tap before you continue. Nothing is uploaded.</p>
          <p className="quiet">Centre stickers are this cube&apos;s colour references. Changing a centre&apos;s name renames every untouched sticker whose sampled colour is closest to that centre, including stickers on faces you already kept. Stickers you set yourself stay as you set them.</p>
          <StickerGrid stickers={current} selected={selected} onSelect={setSelected} />
          <Palette onPick={(name) => paint(selected, name)} />
          <div className="row">
            <button type="button" onClick={acceptFace} disabled={current.some((sticker) => sticker.uncertain && !sticker.confirmed)}>
              {step === CAPTURES.length - 1 ? "Review the cube" : "Keep this face"}
            </button>
            <button type="button" className="ghost" onClick={() => { setPhase("intro"); }}>Retake</button>
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
            setPhase("intro");
          }}
          onAccept={() => review.facelets && review.solvable && onAccept(review.facelets)}
        />
      ) : null}
    </section>
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
  onAccept: () => void;
}) {
  return (
    <div className="review">
      <p role="status">{message}</p>
      <p className="sr-only" data-testid="scan-facelets">{facelets ?? ""}</p>
      <div className="review-grid">
        {CAPTURES.map((capture) => (
          <div key={capture.face} className="review-face">
            <h3>{capture.title}</h3>
            <StickerGrid stickers={draft[capture.face] ?? []} selected={-1} onSelect={() => undefined} />
            <div className="row">
              <button type="button" className="ghost" onClick={() => onRotate(capture.face)}>Rotate photo</button>
              <button type="button" className="ghost" onClick={() => onRetake(capture.face)}>Retake</button>
            </div>
          </div>
        ))}
      </div>
      {facelets ? (
        <div className="preview-stage">
          <CubeView facelets={facelets} letters turns={false} label="Reconstructed cube. Confirm it matches the physical cube before solving." />
        </div>
      ) : null}
      {fixes.length > 1 ? <p>Several photo rotations would each look legal. None is applied automatically.</p> : null}
      <label className="check">
        <input type="checkbox" checked={confirmedLook} onChange={(event) => onConfirmLook(event.target.checked)} />
        The 3D cube matches the physical cube in my hands. A legal colouring can still be the wrong scan.
      </label>
      <button type="button" disabled={!facelets || !solvable || !confirmedLook} onClick={onAccept}>Start the lesson from this scan</button>
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

function HoldDiagram({ step }: { step: number }) {
  return (
    <svg className="hold-diagram" viewBox="0 0 220 120" role="img" aria-label={CAPTURES[step]?.title ?? "Hold diagram"}>
      <rect x="78" y="18" width="64" height="64" rx="6" className="diagram-cube" />
      <text x="110" y="54" textAnchor="middle">top</text>
      <path d="M156 50 H198" className="finger-arrow" markerEnd="url(#scan-arrow)" />
      <text x="110" y="104" textAnchor="middle">{step === 0 ? "Camera faces this side" : step < 4 ? "Turn the whole cube" : step === 4 ? "Tip the top toward you" : "Tip the bottom toward you"}</text>
      <defs>
        <marker id="scan-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
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
      ? `One photo rotation makes a solvable cube (${appliedFix.summary}). It is shown below. Accept it only if it matches the cube in your hands.`
      : "These colours can exist on a normal cube. That does not prove the photos were oriented correctly — compare the 3D cube with yours.",
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
