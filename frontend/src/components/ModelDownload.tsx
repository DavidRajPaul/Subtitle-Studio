// Not used by the web app yet: kept for the next stage, which connects it to speech
// recognition running in the browser (it was built for the Python backend in Phase 4).
import { useEffect, useState } from "react";
import { messageOf } from "../api/http";
import { cancelJob, downloadModel, type SpeechModel } from "../api/speech";
import { useJob } from "../hooks/useJob";
import { JobProgress } from "./JobProgress";

interface Props {
  model: SpeechModel;
  onChanged: () => void;
  compact?: boolean;
}

/** One-time download of a speech model, with progress, cancel and a retry on failure. */
export function ModelDownload({ model, onChanged, compact = false }: Props) {
  const [jobId, setJobId] = useState<string | null>(model.download_job_id);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const view = useJob<{ name: string }>(jobId);

  useEffect(() => {
    if (view.kind === "done") {
      setJobId(null);
      setCancelling(false);
      if (view.job.status === "failed") setError(view.job.error?.message ?? "Download failed.");
      if (view.job.status === "cancelled") setError("Download cancelled. Nothing was kept.");
      onChanged();
    } else if (view.kind === "lost") {
      setJobId(null);
      setError(view.message);
      onChanged();
    }
  }, [view, onChanged]);

  const start = () => {
    setError(null);
    downloadModel(model.name)
      .then(setJobId)
      .catch((err: unknown) => {
        setError(messageOf(err, "The download could not be started."));
      });
  };

  if (jobId) {
    return (
      <JobProgress
        label={`Downloading the ${model.label} model`}
        job={view.kind === "active" ? view.job : null}
        cancelling={cancelling}
        onCancel={() => {
          setCancelling(true);
          void cancelJob(jobId).catch(() => {
            setCancelling(false);
          });
        }}
      />
    );
  }
  return (
    <div className="model-download">
      {!compact && (
        <p className="muted">
          Downloaded once from Hugging Face (about {model.approx_size_mb} MB, needs the internet).
          After that, transcription works without the internet.
        </p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <button type="button" className="button" onClick={start}>
        {error ? "Try the download again" : `Download ${model.label} (about ${String(model.approx_size_mb)} MB)`}
      </button>
    </div>
  );
}
