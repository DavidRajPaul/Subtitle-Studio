import { useEffect, useId, useRef, useState } from "react";
import {
  importMedia,
  MediaImportError,
  removeMedia,
  validateVideoFile,
  type ImportedMedia,
} from "../api/media";
import type { LoadedProject } from "../api/projects";
import { createProject, type NewProjectContent } from "../lib/newProject";
import { DEFAULT_STYLE } from "../lib/style";
import { SpeechSetup } from "../components/SpeechSetup";
import { DEFAULT_SETTINGS } from "../engine/timing";
import { TextTimingSetup } from "../components/TextTimingSetup";
import { VideoPreview } from "../components/VideoPreview";
import { formatTimecode } from "../lib/timecode";
import { WORKFLOW_LABELS, type Workflow } from "../types";

interface Props {
  workflow: Workflow;
  onChangeWorkflow: (workflow: Workflow) => void;
  onBack: () => void;
  onOpenProject: (project: LoadedProject) => void;
}

type VideoState =
  | { kind: "empty" }
  | { kind: "inspecting"; file: File }
  | { kind: "error"; file: File; message: string }
  | { kind: "ready"; file: File; media: ImportedMedia; url: string };

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

export function ImportScreen({ workflow, onChangeWorkflow, onBack, onOpenProject }: Props) {
  const [video, setVideo] = useState<VideoState>({ kind: "empty" });
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fieldId = useId();

  const readyUrl = video.kind === "ready" ? video.url : null;
  const readyId = video.kind === "ready" ? video.media.id : null;
  useEffect(() => {
    return () => {
      if (readyUrl) URL.revokeObjectURL(readyUrl);
      if (readyId) void removeMedia(readyId);
    };
  }, [readyUrl, readyId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const choose = () => {
    inputRef.current?.click();
  };

  const handleFile = (file: File) => {
    abortRef.current?.abort();
    const problem = validateVideoFile(file);
    if (problem) {
      setVideo({ kind: "error", file, message: problem });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setVideo({ kind: "inspecting", file });
    importMedia(file, controller.signal)
      .then((media) => {
        setVideo({ kind: "ready", file, media, url: URL.createObjectURL(file) });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof MediaImportError
            ? error.message
            : "The video could not be imported. Try again or choose another file.";
        setVideo({ kind: "error", file, message });
      });
  };

  const cancel = () => {
    abortRef.current?.abort();
    setVideo({ kind: "empty" });
  };

  const remove = () => {
    setVideo({ kind: "empty" });
  };

  const createAndOpen = async (media: ImportedMedia, result: NewProjectContent): Promise<void> => {
    onOpenProject(await createProject(media, workflow, result, DEFAULT_STYLE));
  };

  const errorId = `${fieldId}-error`;
  const meta = video.kind === "ready" ? video.media.metadata : null;

  return (
    <>
      <div className="screen-header">
        <button type="button" className="button button--secondary" onClick={onBack}>
          ← Back
        </button>
        <span className="muted">Step 1 of 3</span>
      </div>
      <h1>Add your video</h1>
      <p className="muted">
        Workflow: <strong>{WORKFLOW_LABELS[workflow]}</strong>{" "}
        <button
          type="button"
          className="link-button"
          onClick={() => {
            onChangeWorkflow(workflow === "speech" ? "text" : "speech");
          }}
        >
          Switch to {WORKFLOW_LABELS[workflow === "speech" ? "text" : "speech"].toLowerCase()}
        </button>
      </p>

      <section className="panel" aria-labelledby={`${fieldId}-label`}>
        <h2 id={`${fieldId}-label`}>Video (MP4, required)</h2>
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,video/mp4"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) handleFile(file);
          }}
        />

        {video.kind === "empty" && (
          <>
            <p className="muted">No video selected yet. Your original file is never changed.</p>
            <button type="button" className="button" onClick={choose}>
              Select MP4
            </button>
          </>
        )}

        {video.kind === "inspecting" && (
          <>
            <p role="status" aria-busy="true">
              Inspecting <strong>{video.file.name}</strong>…
            </p>
            <button type="button" className="button button--secondary" onClick={cancel}>
              Cancel
            </button>
          </>
        )}

        {video.kind === "error" && (
          <>
            <p className="file-name">{video.file.name}</p>
            <p id={errorId} role="alert" className="inline-error">
              {video.message}
            </p>
            <button
              type="button"
              className="button"
              onClick={choose}
              aria-describedby={errorId}
            >
              Choose a different file
            </button>
          </>
        )}

        {video.kind === "ready" && meta && (
          <>
            <p className="file-name">{video.media.filename}</p>
            <dl className="meta-list" aria-label="Video details">
              <div>
                <dt>Duration</dt>
                <dd>{formatTimecode(meta.duration_ms)}</dd>
              </div>
              <div>
                <dt>Resolution</dt>
                <dd>
                  {meta.width}×{meta.height}
                  {meta.height > meta.width ? " (portrait)" : ""}
                </dd>
              </div>
              <div>
                <dt>Frame rate</dt>
                <dd>{meta.frame_rate ? `${String(meta.frame_rate)} fps` : "Unknown"}</dd>
              </div>
              <div>
                <dt>Audio</dt>
                <dd>{meta.has_audio ? "Audio track detected" : "No audio track"}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatSize(video.media.size_bytes)}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button type="button" className="button button--secondary" onClick={choose}>
                Replace video
              </button>
              <button type="button" className="button button--secondary" onClick={remove}>
                Remove
              </button>
            </div>
          </>
        )}
      </section>

      {video.kind === "ready" && meta && (
        <VideoPreview
          src={video.url}
          durationMs={meta.duration_ms}
          label={`Preview of ${video.media.filename}`}
          width={meta.width}
          height={meta.height}
        />
      )}

      {video.kind === "ready" && meta && workflow === "text" && (
        <TextTimingSetup
          durationMs={meta.duration_ms}
          onOpenEditor={(result) => createAndOpen(video.media, result)}
        />
      )}

      {video.kind === "ready" && meta && workflow === "speech" && (
        <SpeechSetup
          mediaId={video.media.id}
          videoHasAudio={meta.has_audio}
          videoDurationMs={meta.duration_ms}
          onSwitchToText={() => {
            onChangeWorkflow("text");
          }}
          onOpenEditor={(result) =>
            createAndOpen(video.media, {
              cues: result.cues,
              // Times came from the recogniser, so every subtitle is treated as explicitly timed.
              mode: "manual",
              segmentation: "line",
              settings: DEFAULT_SETTINGS,
            })
          }
        />
      )}
    </>
  );
}
