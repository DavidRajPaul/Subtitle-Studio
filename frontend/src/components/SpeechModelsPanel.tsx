// Not used by the web app yet: kept for the next stage, which connects it to speech
// recognition running in the browser (it was built for the Python backend in Phase 4).
import { useCallback, useEffect, useState } from "react";
import { messageOf } from "../api/http";
import { deleteModel, getSpeechInfo, type SpeechInfo, type SpeechModel } from "../api/speech";
import { ConfirmDialog } from "./ConfirmDialog";
import { ModelDownload } from "./ModelDownload";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${String(Math.max(1, Math.round(bytes / 1024 ** 2)))} MB`;
}

/** Settings: which speech models are installed, where, how big; download or remove them. */
export function SpeechModelsPanel() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; info: SpeechInfo }
  >({ kind: "loading" });
  const [refresh, setRefresh] = useState(0);
  const [toDelete, setToDelete] = useState<SpeechModel | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getSpeechInfo(controller.signal)
      .then((info) => {
        setState({ kind: "ready", info });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "error", message: messageOf(error) });
      });
    return () => {
      controller.abort();
    };
  }, [refresh]);

  const reload = useCallback(() => {
    setRefresh((n) => n + 1);
  }, []);

  if (state.kind === "loading") {
    return (
      <section className="panel" aria-labelledby="speech-models-heading" aria-busy="true">
        <h2 id="speech-models-heading">Speech models</h2>
        <p role="status">Checking speech models…</p>
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="panel panel--error" aria-labelledby="speech-models-heading">
        <h2 id="speech-models-heading">Speech models</h2>
        <p role="alert" className="inline-error">
          {state.message}
        </p>
        <button type="button" className="button" onClick={reload}>
          Try again
        </button>
      </section>
    );
  }

  const { engine, models, cache_dir: cacheDir } = state.info;
  return (
    <section className="panel" aria-labelledby="speech-models-heading">
      <h2 id="speech-models-heading">Speech models</h2>
      {engine.available ? (
        <p className="status--ok">faster-whisper {engine.version ?? ""} is installed.</p>
      ) : (
        <p className="warning">
          <span aria-hidden="true">⚠ </span>
          <strong>Speech recognition is not installed.</strong> {engine.detail}
        </p>
      )}
      <p className="muted">
        Models are stored in <code>{cacheDir}</code>. They are downloaded once from Hugging Face
        (MIT licence) and then used without the internet.
      </p>
      <ul className="tool-list">
        {models.map((m) => (
          <li key={m.name} className="tool-list__item model-row">
            <div>
              <span className="tool-list__name">{m.label}</span>{" "}
              <span className={m.installed ? "status--ok" : "muted"}>
                {m.installed
                  ? `Installed · ${formatBytes(m.size_on_disk_bytes)}`
                  : `Not installed · about ${String(m.approx_size_mb)} MB`}
              </span>
              <p className="muted model-row__desc">{m.description}</p>
            </div>
            {engine.available &&
              (m.installed ? (
                <button
                  type="button"
                  className="button button--secondary"
                  aria-label={`Remove the ${m.label} model`}
                  onClick={() => {
                    setDeleteError(null);
                    setToDelete(m);
                  }}
                >
                  Remove
                </button>
              ) : (
                <ModelDownload model={m} onChanged={reload} compact />
              ))}
          </li>
        ))}
      </ul>
      {toDelete && (
        <ConfirmDialog
          title={`Remove the ${toDelete.label} model?`}
          confirmLabel="Remove model"
          destructive
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            setToDelete(null);
          }}
          onConfirm={() => {
            setDeleting(true);
            deleteModel(toDelete.name)
              .then(() => {
                setToDelete(null);
                reload();
              })
              .catch((error: unknown) => {
                setDeleteError(messageOf(error, "The model could not be removed."));
              })
              .finally(() => {
                setDeleting(false);
              });
          }}
        >
          <p>
            This frees {formatBytes(toDelete.size_on_disk_bytes)}. Your projects are not affected;
            you can download the model again later.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
