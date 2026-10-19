import { useCallback, useEffect, useState } from "react";
import { messageOf } from "../api/http";
import { deleteProject, listProjects, type ProjectSummary } from "../api/projects";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { Workflow } from "../types";

interface Props {
  onStart: (workflow: Workflow) => void;
  onOpen: (projectId: string) => void;
}

type ListState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; projects: ProjectSummary[] };

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function RecentProjects({ onOpen }: { onOpen: (id: string) => void }) {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listProjects(controller.signal)
      .then((projects) => {
        setState({ kind: "ready", projects });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "error", message: messageOf(error) });
      });
    return () => {
      controller.abort();
    };
  }, [attempt]);

  const confirmDelete = useCallback(() => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    deleteProject(toDelete.id)
      .then(() => {
        setState((s) =>
          s.kind === "ready"
            ? { kind: "ready", projects: s.projects.filter((p) => p.id !== toDelete.id) }
            : s,
        );
        setToDelete(null);
      })
      .catch((error: unknown) => {
        setDeleteError(messageOf(error, "The project could not be deleted."));
      })
      .finally(() => {
        setDeleting(false);
      });
  }, [toDelete]);

  if (state.kind === "loading") {
    return (
      <p role="status" aria-busy="true" className="muted">
        Looking for saved projects…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="panel" aria-labelledby="recent-heading">
        <h2 id="recent-heading">Your projects</h2>
        <p role="alert" className="inline-error">
          Saved projects could not be loaded. {state.message}
        </p>
        <button
          type="button"
          className="button"
          onClick={() => {
            setState({ kind: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </section>
    );
  }
  if (state.projects.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading">
      <h2 id="recent-heading">Your projects</h2>
      <ul className="project-list">
        {state.projects.map((project) => (
          <li key={project.id} className="project-row">
            <div className="project-row__info">
              <strong>{project.name}</strong>
              <span className="muted">
                {project.cue_count} {project.cue_count === 1 ? "subtitle" : "subtitles"} ·{" "}
                {project.media_filename}
                {formatWhen(project.updated_at) && ` · ${formatWhen(project.updated_at)}`}
              </span>
              {!project.media_available && (
                <span className="warning">
                  <span aria-hidden="true">⚠ </span>
                  <strong>Video missing:</strong> you can choose it again after opening.
                </span>
              )}
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button"
                aria-label={`Open ${project.name}`}
                onClick={() => {
                  onOpen(project.id);
                }}
              >
                Open
              </button>
              <button
                type="button"
                className="button button--secondary"
                aria-label={`Delete ${project.name}`}
                onClick={() => {
                  setDeleteError(null);
                  setToDelete(project);
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {toDelete && (
        <ConfirmDialog
          title="Delete this project?"
          confirmLabel="Delete project"
          destructive
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            setToDelete(null);
          }}
          onConfirm={confirmDelete}
        >
          <p>
            <strong>{toDelete.name}</strong> and its saved subtitles will be removed from this
            device. Your original video file is not touched.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

export function HomeScreen({ onStart, onOpen }: Props) {
  return (
    <>
      <h1>Create a subtitle project</h1>
      <p className="muted">
        Video, audio and text stay on this device. Nothing is uploaded to the internet.
      </p>
      <div className="workflow-list">
        <article className="workflow-card" aria-labelledby="wf-speech">
          <h2 id="wf-speech">Transcribe speech</h2>
          <p>Create editable subtitles from speech in an MP4 or a separate MP3.</p>
          <button
            type="button"
            className="button"
            aria-describedby="wf-speech"
            onClick={() => {
              onStart("speech");
            }}
          >
            Start
          </button>
        </article>
        <article className="workflow-card" aria-labelledby="wf-text">
          <h2 id="wf-text">Create subtitles from text</h2>
          <p>Turn a TXT script into subtitles for a video, even if it has no voice.</p>
          <button
            type="button"
            className="button"
            aria-describedby="wf-text"
            onClick={() => {
              onStart("text");
            }}
          >
            Start
          </button>
        </article>
      </div>
      <RecentProjects onOpen={onOpen} />
    </>
  );
}
