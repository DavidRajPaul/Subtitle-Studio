import { useCallback, useEffect, useRef, useState } from "react";
import { messageOf } from "../api/http";
import { loadMediaUrl } from "../api/media";
import { getProject, type LoadedProject, type Project, type SubtitleStyle } from "../api/projects";
import { SaveStatus } from "../components/SaveStatus";
import { ExportPanel } from "../components/ExportPanel";
import { Sheet } from "../components/Sheet";
import { SubtitleCanvas } from "../components/SubtitleCanvas";
import { StyleStudio } from "../components/style/StyleStudio";
import { SavePresetBar } from "../components/style/Presets";
import { LooksTab } from "../components/style/tabs";
import { VideoPreview, type VideoPreviewHandle } from "../components/VideoPreview";
import { LOOKS } from "../engine/looks";
import { useAutosave } from "../hooks/useAutosave";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { setText } from "../lib/cueEdit";
import { rememberLook } from "../lib/prefs";
import { activeCues } from "../lib/timeline";

interface Props {
  projectId: string;
  initial: LoadedProject | null;
  fresh: boolean;
  onDone: () => void;
  onOpenInEditor: (projectId: string) => void;
}

function Inner({ initial, fresh, onDone, onOpenInEditor }: Omit<Props, "projectId" | "initial"> & { initial: LoadedProject }) {
  const { latest, status, markChanged, flush, retry } = useAutosave(initial);
  const [project, setProject] = useState<Project>(initial);
  const [url, setUrl] = useState<string | null>(null);
  const [mediaMissing, setMediaMissing] = useState(!initial.media_available);
  const [currentMs, setCurrentMs] = useState(0);
  const timeRef = useRef(0);
  timeRef.current = currentMs;
  const playingRef = useRef(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const previewRef = useRef<VideoPreviewHandle>(null);
  const wide = useMediaQuery("(min-width: 1000px)");

  useEffect(() => {
    if (mediaMissing) return;
    let cancelled = false;
    let made: string | null = null;
    void loadMediaUrl(initial.media.id).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      if (!u) setMediaMissing(true);
      made = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [initial.media.id, mediaMissing]);

  const update = useCallback(
    (fn: (p: Project) => Project) => {
      const next = fn(latest.current);
      setProject(next);
      markChanged(next);
    },
    [latest, markChanged],
  );

  /**
   * While paused, makes sure a subtitle is fully on screen when a look is chosen: not before
   * it, and not in the middle of its entrance or exit animation (which could look empty).
   */
  const showASubtitle = useCallback(
    (style: SubtitleStyle) => {
      if (playingRef.current) return;
      const cues = latest.current.cues;
      if (cues.length === 0) return;
      const t = timeRef.current;
      const cue = activeCues(cues, t).at(0) ?? cues[0];
      const span = cue.end_ms - cue.start_ms;
      const settledFrom = cue.start_ms + Math.min(style.animation.in_ms, span / 2) + 50;
      const settledUntil = cue.end_ms - Math.min(style.animation.out_ms, span / 2) - 50;
      if (t >= settledFrom && t <= settledUntil && t >= cue.start_ms) return;
      previewRef.current?.seekTo(Math.min(cue.end_ms - 1, Math.max(cue.start_ms, settledFrom)));
    },
    [latest],
  );

  const showRef = useRef(showASubtitle);
  showRef.current = showASubtitle;
  // Once the video is ready, start on a moment where a subtitle is showing.
  useEffect(() => {
    if (url) showRef.current(latest.current.style);
  }, [url, latest]);

  const setStyle = (style: SubtitleStyle) => {
    const look = LOOKS.find((l) => JSON.stringify(l.style) === JSON.stringify(style));
    if (look) rememberLook(look.id);
    update((p) => ({ ...p, style }));
    showASubtitle(style);
  };

  const leave = async (then: () => void) => {
    await flush();
    then();
  };

  const studio = <StyleStudio style={project.style} onChange={setStyle} initialTab="font" />;

  return (
    <div className="easy-project">
      <div className="screen-header">
        <button type="button" className="button button--secondary" onClick={() => void leave(onDone)}>
          ← Projects
        </button>
        <SaveStatus state={status} onRetry={() => void retry()} />
      </div>
      <h1>{fresh ? "Pick a look" : project.name}</h1>
      {fresh && <p className="muted">Step 3 of 3 · Your subtitles are ready. Tap a look; you can change it any time.</p>}

      {mediaMissing ? (
        <section className="panel panel--warn">
          <h2>The video for this project is not on this device</h2>
          <p>Your subtitles are safe. Open the project in Editor mode to choose the video again.</p>
          <button type="button" className="button" onClick={() => void leave(() => { onOpenInEditor(initial.id); })}>
            Open in Editor mode
          </button>
        </section>
      ) : !url ? (
        <p role="status" aria-busy="true" className="panel">
          Loading the video…
        </p>
      ) : (
        <VideoPreview
          ref={previewRef}
          src={url}
          durationMs={project.media.duration_ms}
          label={`Preview of ${project.media.filename}`}
          width={project.media.width}
          height={project.media.height}
          onTimeChange={setCurrentMs}
          onPlayingChange={(p) => {
            playingRef.current = p;
          }}
          renderOverlay={(size) => <SubtitleCanvas cues={project.cues} tMs={currentMs} style={project.style} size={size} />}
        />
      )}

      <section className="panel" aria-labelledby="easy-looks">
        <div className="panel__head">
          <h2 id="easy-looks">Looks</h2>
          {!wide && (
            <button type="button" className="button button--secondary" onClick={() => { setStudioOpen(true); }}>
              More styling
            </button>
          )}
        </div>
        {!wide && <SavePresetBar style={project.style} />}
        <LooksTab style={project.style} onChange={setStyle} />
      </section>

      {wide && (
        <section className="panel" aria-label="More styling">
          {studio}
        </section>
      )}

      <details className="panel easy-words">
        <summary className="summary-button">Fix words ({project.cues.length} subtitles)</summary>
        <p className="muted">Change any wrong word here. Timing stays as it is; use Editor mode to change times.</p>
        <ol className="easy-word-list">
          {project.cues.map((cue, i) => (
            <li key={cue.id}>
              <label className="visually-hidden" htmlFor={`easy-cue-${cue.id}`}>
                Subtitle {i + 1}
              </label>
              <textarea
                id={`easy-cue-${cue.id}`}
                className="text-input text-input--area"
                rows={2}
                value={cue.text}
                onFocus={() => previewRef.current?.seekTo(cue.start_ms + Math.min(500, (cue.end_ms - cue.start_ms) / 2))}
                onChange={(e) => {
                  const text = e.currentTarget.value;
                  update((p) => ({ ...p, cues: setText(p.cues, cue.id, text) }));
                }}
              />
            </li>
          ))}
        </ol>
      </details>

      <div className="easy-actions">
        <button type="button" className="button button--big" onClick={() => void leave(onDone)}>
          Done
        </button>
        <button type="button" className="button button--secondary" onClick={() => void leave(() => { onOpenInEditor(initial.id); })}>
          Edit timing in Editor mode
        </button>
        <button
          type="button"
          className="button"
          disabled={mediaMissing || project.cues.length === 0}
          onClick={() => {
            previewRef.current?.pause();
            void flush();
            setExportOpen(true);
          }}
        >
          Export video
        </button>
      </div>

      {exportOpen && (
        <Sheet
          title="Export"
          onClose={() => {
            setExportOpen(false);
          }}
        >
          <ExportPanel project={project} />
        </Sheet>
      )}

      {studioOpen && !wide && (
        <Sheet
          title="Style"
          onClose={() => {
            setStudioOpen(false);
          }}
        >
          {studio}
        </Sheet>
      )}
    </div>
  );
}

/** Easy mode's project screen: preview, looks, more styling, quick word fixes. */
export function EasyProjectScreen({ projectId, initial, fresh, onDone, onOpenInEditor }: Props) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; project: LoadedProject }
  >(initial ? { kind: "ready", project: initial } : { kind: "loading" });
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    getProject(projectId)
      .then((project) => {
        if (!cancelled) setState({ kind: "ready", project });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: "error", message: messageOf(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, initial]);
  if (state.kind === "loading") {
    return (
      <p role="status" aria-busy="true">
        Opening project…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="panel panel--error">
        <h1>This project could not be opened</h1>
        <p role="alert" className="inline-error">
          {state.message}
        </p>
        <button type="button" className="button" onClick={onDone}>
          Back to projects
        </button>
      </section>
    );
  }
  return <Inner key={state.project.id} initial={state.project} fresh={fresh} onDone={onDone} onOpenInEditor={onOpenInEditor} />;
}
