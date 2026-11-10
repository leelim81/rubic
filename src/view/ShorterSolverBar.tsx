import { formatDownload, type DownloadProgress } from "../gullicube/download";

export type SolverPhase = "idle" | "downloading" | "ready" | "declined" | "failed";

export function ShorterSolverBar(props: {
  phase: SolverPhase;
  progress: DownloadProgress;
  blocked: boolean;
  onCancel: () => void;
  onDownload: () => void;
  onRetry: () => void;
}) {
  if (props.phase === "idle" && !props.blocked) return null;
  const percent = props.progress.total > 0 ? Math.min(100, Math.round((props.progress.received / props.progress.total) * 100)) : 0;
  return (
    <div className="solver-download" data-testid="solver-download">
      {props.phase === "downloading" ? (
        <>
          <div className="solver-row">
            <p role="status">Shorter solver · {formatDownload(props.progress)}</p>
            <button type="button" onClick={props.onCancel}>Cancel</button>
          </div>
          <div className="solver-meter" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
          <p className="solver-warning">Cancelling means 5×5 solutions will use many more turns (about 320 instead of about 120–170).</p>
        </>
      ) : null}
      {props.phase === "ready" ? <p role="status">Shorter solver ready</p> : null}
      {props.phase === "failed" ? <p role="status">The shorter solver could not be downloaded.</p> : null}
      {props.phase === "declined" || props.phase === "failed" ? (
        <button type="button" onClick={props.onDownload}>Download shorter solver</button>
      ) : null}
      {props.blocked ? (
        <button type="button" onClick={props.onRetry}>Try the shorter solver again</button>
      ) : null}
    </div>
  );
}
