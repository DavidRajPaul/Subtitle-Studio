// Not used by the web app yet: kept for the next stage, which connects it to speech
// recognition running in the browser (it was built for the Python backend in Phase 4).
import type { Job } from "../api/speech";

interface Props {
  label: string;
  job: Job<unknown> | null;
  onCancel: () => void;
  cancelling: boolean;
}

/** Real progress when the backend knows it; otherwise an honest "working" state. */
export function JobProgress({ label, job, onCancel, cancelling }: Props) {
  const pct = job?.progress == null ? null : Math.round(job.progress * 100);
  return (
    <div className="job-progress">
      <p role="status" aria-live="polite">
        {cancelling ? "Cancelling…" : (job?.message ?? "Starting…")}
        {pct !== null && !cancelling && ` (${String(pct)}%)`}
      </p>
      <progress
        className="job-progress__bar"
        aria-label={label}
        max={100}
        {...(pct === null ? {} : { value: pct })}
      />
      <button
        type="button"
        className="button button--secondary"
        disabled={cancelling}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
