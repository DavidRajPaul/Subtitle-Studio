import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { messageOf, newId } from "../api/http";
import { importMedia, loadMediaUrl } from "../api/media";
import {
  getProject,
  validateCues,
  type LoadedProject,
  type Project,
  type ProjectCue,
  type SubtitleStyle,
} from "../api/projects";
import { generateTiming, type TimingIssue } from "../api/subtitles";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CueEditor, type BulkScope, type TimingEdit } from "../components/CueEditor";
import { CueList } from "../components/CueList";
import { CutPanel } from "../components/CutPanel";
import { ExportPanel } from "../components/ExportPanel";
import { SaveStatus } from "../components/SaveStatus";
import { Sheet } from "../components/Sheet";
import { StyleStudio } from "../components/style/StyleStudio";
import { SubtitleCanvas } from "../components/SubtitleCanvas";
import { Timeline } from "../components/Timeline";
import { VideoPreview, type VideoPreviewHandle } from "../components/VideoPreview";
import { useAutosave } from "../hooks/useAutosave";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  addCue,
  applyRegeneratedTiming,
  removeCue,
  setDuration,
  setDurationForRange,
  setEnd,
  setStart,
  setText,
  type EditResult,
} from "../lib/cueEdit";
import { cutDuration, cutLength, keptParts, partStarts } from "../lib/cuts";
import { formatTimecode } from "../lib/timecode";
import { activeCues } from "../lib/timeline";
import { VIDEO_ACCEPT } from "../lib/videoFormats";

/** Validates the current cues with the same engine that generated them (debounced). */
function useIssues(project: Project): TimingIssue[] {
  const [issues, setIssues] = useState<TimingIssue[]>([]);
  const { cues, timing } = project;
  const length = cutLength(project);
  useEffect(() => {
    if (cues.length === 0) {
      setIssues([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      validateCues(cues, length, timing.settings, controller.signal)
        .then(setIssues)
        .catch(() => {
          // Warnings are advisory; keep the last known set if the check cannot run.
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cues, length, timing.settings]);
  return issues;
}

type Panel = "subtitle" | "style" | "cut";

function Editor({ initial, onExit }: { initial: LoadedProject; onExit: () => void }) {
  const { latest, status, markChanged, flush, retry } = useAutosave(initial);
  const [project, setProject] = useState<Project>(initial);
  const [mediaOk, setMediaOk] = useState(initial.media_available);
  const [selectedId, setSelectedId] = useState<string | null>(initial.cues[0]?.id ?? null);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sequential, setSequential] = useState(false);
  const [panel, setPanel] = useState<Panel>("subtitle");
  const [sheet, setSheet] = useState<Panel | null>(null);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(initial.name);
  const [relinkNote, setRelinkNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [relinkBusy, setRelinkBusy] = useState(false);
  const previewRef = useRef<VideoPreviewHandle>(null);
  const relinkInput = useRef<HTMLInputElement>(null);
  const wide = useMediaQuery("(min-width: 1000px)");

  const update = useCallback(
    (fn: (p: Project) => Project) => {
      const next = fn(latest.current);
      setProject(next);
      markChanged(next);
    },
    [latest, markChanged],
  );

  const editCues = (fn: (cues: ProjectCue[]) => EditResult): string | null => {
    const result = fn(latest.current.cues);
    if (!result.ok) return result.error;
    update((p) => ({ ...p, cues: result.cues }));
    return null;
  };

  // The video's working copy is read from this browser's storage when the editor opens.
  const mediaId = project.media.id;
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!mediaOk) return;
    let cancelled = false;
    let url: string | null = null;
    void loadMediaUrl(mediaId).then((loaded) => {
      if (cancelled) {
        if (loaded) URL.revokeObjectURL(loaded);
        return;
      }
      if (!loaded) {
        setMediaOk(false);
        return;
      }
      url = loaded;
      setVideoUrl(loaded);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setVideoUrl(null);
    };
  }, [mediaId, mediaOk]);

  const issues = useIssues(project);
  const issuesByCue = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const issue of issues) {
      if (issue.cue_number === null) continue;
      map.set(issue.cue_number, [...(map.get(issue.cue_number) ?? []), issue.message]);
    }
    return map;
  }, [issues]);

  const { cues, media, style } = project;
  // Everything on screen uses the cut video's timeline (see lib/cuts.ts).
  const parts = useMemo(() => keptParts(project), [project]);
  const durationMs = cutDuration(parts);
  const selectedIndex = cues.findIndex((c) => c.id === selectedId);
  const selected = selectedIndex >= 0 ? cues[selectedIndex] : null;
  const activeIds = useMemo(
    () => new Set(activeCues(cues, currentMs).map((c) => c.id)),
    [cues, currentMs],
  );

  useEffect(() => {
    if (status.kind === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [status.kind]);

  // On a phone the sheet covers the lower half; keep the picture above it so edits are visible.
  useEffect(() => {
    if (sheet === null) return;
    const preview = document.querySelector(".preview");
    if (preview && typeof preview.scrollIntoView === "function") {
      preview.scrollIntoView({ block: "start" });
    }
  }, [sheet]);

  const seek = useCallback((ms: number) => {
    if (previewRef.current) previewRef.current.seekTo(ms);
    else setCurrentMs(ms);
  }, []);

  const selectCue = useCallback(
    (id: string) => {
      setSelectedId(id);
      const cue = latest.current.cues.find((c) => c.id === id);
      if (cue) seek(cue.start_ms);
    },
    [latest, seek],
  );

  /** Style changes are only visible while a subtitle is on screen, so jump to one first. */
  const showSubtitleForStyling = () => {
    if (selected && activeIds.size === 0) seek(selected.start_ms);
  };

  const addAtPlayhead = () => {
    const cue: ProjectCue = { id: newId(), text: "", start_ms: currentMs, end_ms: currentMs + 2000 };
    update((p) => ({ ...p, cues: addCue(p.cues, cue) }));
    setSelectedId(cue.id);
    setPanel("subtitle");
    if (!wide) setSheet("subtitle");
  };

  const deleteSelected = () => {
    if (!selected) return;
    const next = removeCue(latest.current.cues, selected.id);
    update((p) => ({ ...p, cues: next }));
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id ?? null);
  };

  const onTiming = (kind: TimingEdit, ms: number): string | null => {
    if (!selected) return "Select a subtitle first.";
    return editCues((list) =>
      kind === "start"
        ? setStart(list, selected.id, ms, sequential)
        : kind === "end"
          ? setEnd(list, selected.id, ms, sequential)
          : setDuration(list, selected.id, ms, sequential),
    );
  };

  const onBulk = (scope: BulkScope, from: number, to: number, ms: number): string | null => {
    const a = scope === "selected" ? selectedIndex : scope === "all" ? 0 : from - 1;
    const b = scope === "selected" ? selectedIndex : scope === "all" ? cues.length - 1 : to - 1;
    return editCues((list) => setDurationForRange(list, a, b, ms, sequential));
  };

  const onRegenerate = async (mode: "equal" | "readable" | "fit"): Promise<string | null> => {
    try {
      const current = latest.current;
      const result = await generateTiming({
        segments: current.cues.map((c) => c.text),
        mode,
        duration_ms: cutLength(current),
        settings: current.timing.settings,
      });
      update((p) => ({
        ...p,
        cues: applyRegeneratedTiming(p.cues, result.cues),
        timing: { ...p.timing, mode },
      }));
      return null;
    } catch (error) {
      return messageOf(error);
    }
  };

  const commitName = () => {
    const name = nameDraft.trim();
    if (name === "" || name === project.name) {
      setNameDraft(project.name);
      return;
    }
    update((p) => ({ ...p, name }));
  };

  const relink = async (file: File) => {
    setRelinkBusy(true);
    setRelinkNote(null);
    try {
      const imported = await importMedia(file);
      const m = imported.metadata;
      update((p) => ({
        ...p,
        media: {
          id: imported.id,
          filename: imported.filename,
          duration_ms: m.duration_ms,
          width: m.width,
          height: m.height,
          has_audio: m.has_audio,
        },
      }));
      setMediaOk(true);
      const diff = m.duration_ms - project.media.duration_ms;
      if (Math.abs(diff) > 1000) {
        setRelinkNote({
          ok: false,
          text: `This video is ${formatTimecode(Math.abs(diff))} ${diff > 0 ? "longer" : "shorter"} than the original. Your subtitles kept their times, so check them.`,
        });
      }
    } catch (error) {
      setRelinkNote({ ok: false, text: messageOf(error, "That video could not be used.") });
    } finally {
      setRelinkBusy(false);
    }
  };

  const leave = async () => {
    if (await flush()) onExit();
    else setLeaveAsk(true);
  };

  const setStyle = (next: SubtitleStyle) => {
    update((p) => ({ ...p, style: next }));
  };

  const subtitlePanel = (
    <CueEditor
      cue={selected}
      number={selectedIndex + 1}
      cueCount={cues.length}
      warnings={selectedIndex >= 0 ? (issuesByCue.get(selectedIndex + 1) ?? []) : []}
      sequential={sequential}
      onSequentialChange={setSequential}
      onText={(id, text) => {
        update((p) => ({ ...p, cues: setText(p.cues, id, text) }));
      }}
      onTiming={onTiming}
      onBulk={onBulk}
      onDelete={deleteSelected}
      currentMode={project.timing.mode}
      fromSpeech={project.workflow === "speech"}
      onRegenerate={onRegenerate}
    />
  );
  const stylePanel = <StyleStudio style={style} onChange={setStyle} />;
  const cutPanel = (
    <CutPanel
      parts={parts}
      originalMs={media.duration_ms}
      cues={cues}
      currentMs={currentMs}
      onSeek={seek}
      onChange={(next) => {
        update((p) => ({ ...p, parts: next.parts, cues: next.cues }));
        if (selectedId && !next.cues.some((c) => c.id === selectedId)) setSelectedId(next.cues[0]?.id ?? null);
      }}
    />
  );

  return (
    <div className={wide ? "editor editor--wide" : "editor"}>
      <div className="editor__bar">
        <button type="button" className="button button--secondary" onClick={() => void leave()}>
          ← Projects
        </button>
        <label className="visually-hidden" htmlFor="project-name">
          Project name
        </label>
        <input
          id="project-name"
          className="text-input editor__name"
          value={nameDraft}
          maxLength={120}
          onChange={(e) => {
            setNameDraft(e.currentTarget.value);
          }}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <SaveStatus state={status} onRetry={() => void retry()} />
        <button
          type="button"
          className="button"
          disabled={project.cues.length === 0}
          onClick={() => {
            previewRef.current?.pause();
            void flush();
            setExportOpen(true);
          }}
        >
          Export
        </button>
      </div>

      <div className="editor__main">
        {!mediaOk ? (
          <section className="panel panel--warn" aria-labelledby="missing-media">
            <h2 id="missing-media">The video for this project is missing</h2>
            <p>
              Your subtitles are safe. Choose <strong>{media.filename}</strong> again to see them
              over the picture.
            </p>
            <input
              ref={relinkInput}
              type="file"
              accept={VIDEO_ACCEPT}
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) void relink(file);
              }}
            />
            <button
              type="button"
              className="button"
              disabled={relinkBusy}
              onClick={() => relinkInput.current?.click()}
            >
              {relinkBusy ? "Checking the video…" : "Choose the video again"}
            </button>
            {relinkNote && (
              <p role="alert" className="inline-error">
                {relinkNote.text}
              </p>
            )}
          </section>
        ) : !videoUrl ? (
          <p role="status" aria-busy="true" className="panel">
            Loading the video…
          </p>
        ) : (
          <>
            <VideoPreview
              ref={previewRef}
              src={videoUrl}
              durationMs={durationMs}
              parts={parts}
              label={`Preview of ${media.filename}`}
              width={media.width}
              height={media.height}
              onTimeChange={setCurrentMs}
              onPlayingChange={setPlaying}
              renderOverlay={(size) => (
                <SubtitleCanvas cues={cues} tMs={currentMs} style={style} size={size} />
              )}
            />
            {relinkNote && (
              <p role="alert" className="warning">
                <span aria-hidden="true">⚠ </span>
                <strong>Warning:</strong> {relinkNote.text}
              </p>
            )}
          </>
        )}

        <Timeline
          cues={cues}
          durationMs={durationMs}
          currentMs={currentMs}
          selectedId={selectedId}
          sequential={sequential}
          playing={playing}
          onSeek={seek}
          onSelect={selectCue}
          onApply={(next) => {
            update((p) => ({ ...p, cues: next }));
          }}
          joins={partStarts(parts).slice(1)}
        />
        <CueList
          cues={cues}
          selectedId={selectedId}
          activeIds={activeIds}
          issuesByCue={issuesByCue}
          playing={playing}
          onSelect={selectCue}
          onAdd={addAtPlayhead}
        />
      </div>

      {wide ? (
        <aside className="editor__side" aria-label="Subtitle and style settings">
          <div className="button-row">
            <button
              type="button"
              className="button button--secondary toggle"
              aria-pressed={panel === "subtitle"}
              onClick={() => {
                setPanel("subtitle");
              }}
            >
              Subtitle
            </button>
            <button
              type="button"
              className="button button--secondary toggle"
              aria-pressed={panel === "style"}
              onClick={() => {
                showSubtitleForStyling();
                setPanel("style");
              }}
            >
              Style
            </button>
            <button
              type="button"
              className="button button--secondary toggle"
              aria-pressed={panel === "cut"}
              onClick={() => {
                setPanel("cut");
              }}
            >
              Cut video
            </button>
          </div>
          {panel === "subtitle" ? subtitlePanel : panel === "style" ? stylePanel : cutPanel}
        </aside>
      ) : (
        <>
          <div className="editor__actions">
            <button type="button" className="button button--secondary" onClick={addAtPlayhead}>
              + Add
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setSheet("subtitle");
              }}
            >
              Edit subtitle
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                showSubtitleForStyling();
                setSheet("style");
              }}
            >
              Style
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setSheet("cut");
              }}
            >
              Cut video
            </button>
          </div>
          {sheet === "cut" && (
            <Sheet
              title="Cut video"
              onClose={() => {
                setSheet(null);
              }}
            >
              {cutPanel}
            </Sheet>
          )}
          {sheet === "subtitle" && (
            <Sheet
              title="Edit subtitle"
              onClose={() => {
                setSheet(null);
              }}
            >
              {subtitlePanel}
            </Sheet>
          )}
          {sheet === "style" && (
            <Sheet
              title="Subtitle style"
              onClose={() => {
                setSheet(null);
              }}
            >
              {stylePanel}
            </Sheet>
          )}
        </>
      )}

      {exportOpen && (
        <Sheet
          title="Export"
          onClose={() => {
            setExportOpen(false);
          }}
        >
          <ExportPanel project={project} videoAvailable={mediaOk} />
        </Sheet>
      )}

      {leaveAsk && (
        <ConfirmDialog
          title="Your latest changes were not saved"
          confirmLabel="Leave anyway"
          cancelLabel="Stay and retry"
          destructive
          onCancel={() => {
            setLeaveAsk(false);
            void retry();
          }}
          onConfirm={onExit}
        >
          <p>
            They could not be saved on this device ({status.kind === "error" ? status.message : "unknown reason"}). If you
            leave now, the changes since the last save will be lost.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

interface Props {
  projectId: string;
  initial: LoadedProject | null;
  onExit: () => void;
}

export function EditorScreen({ projectId, initial, onExit }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; project: LoadedProject }
  >(initial ? { kind: "ready", project: initial } : { kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    setState({ kind: "loading" });
    getProject(projectId, controller.signal)
      .then((project) => {
        setState({ kind: "ready", project });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "error", message: messageOf(error) });
      });
    return () => {
      controller.abort();
    };
  }, [projectId, initial, attempt]);

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
        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={() => {
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
          <button type="button" className="button button--secondary" onClick={onExit}>
            Back to projects
          </button>
        </div>
      </section>
    );
  }
  return <Editor key={state.project.id} initial={state.project} onExit={onExit} />;
}
