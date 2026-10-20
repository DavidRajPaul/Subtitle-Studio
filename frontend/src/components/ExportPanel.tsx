import { useEffect, useMemo, useRef, useState } from "react";
import { exportEngine, type ExportProgress, type ExportResult } from "../api/export";
import { messageOf } from "../api/http";
import { loadMediaBlob } from "../api/media";
import type { Project } from "../api/projects";
import { cuesToSrt } from "../engine/export/srt";
import { validateCues } from "../engine/timing";
import { canShareFile, downloadFile, exportName, shareFile } from "../lib/saveFile";

type State =
  | { kind: "choose" }
  | { kind: "working"; progress: ExportProgress; cancelling: boolean }
  | { kind: "done"; result: ExportResult; file: File; url: string }
  | { kind: "failed"; message: string }
  | { kind: "cancelled" };

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`;
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, "0")}`;
};

function SaveButtons({ file, primaryLabel }: { file: File; primaryLabel: string }) {
  const [note, setNote] = useState<string | null>(null);
  const share = canShareFile(file);
  return (
    <div className="export__actions">
      {share && (
        <button
          type="button"
          className="button"
          onClick={() => {
            shareFile(file)
              .then((r) => {
                setNote(r === "shared" ? "Shared." : null);
              })
              .catch(() => {
                setNote("Sharing did not work here. Use Download instead.");
              });
          }}
        >
          Share or save to Photos/Files
        </button>
      )}
      <button
        type="button"
        className={share ? "button button--secondary" : "button"}
        onClick={() => {
          downloadFile(file, file.name);
          setNote(`Downloading “${file.name}”. Look in your Downloads.`);
        }}
      >
        {primaryLabel}
      </button>
      {note && (
        <p role="status" className="field__hint">
          {note}
        </p>
      )}
    </div>
  );
}

/** Export: a new MP4 with the subtitles in the picture, or an SRT file. The original is never changed. */
export function ExportPanel({ project, videoAvailable = true }: { project: Project; videoAvailable?: boolean }) {
  const [state, setState] = useState<State>({ kind: "choose" });
  const controller = useRef<AbortController | null>(null);
  const supported = exportEngine().supported();
  const issues = useMemo(
    () => validateCues(project.cues, project.media.duration_ms, project.timing.settings),
    [project.cues, project.media.duration_ms, project.timing.settings],
  );
  const srt = useMemo(() => cuesToSrt(project.cues), [project.cues]);
  const srtFile = useMemo(
    () => new File([srt.text], exportName(project.name, "srt"), { type: "application/x-subrip" }),
    [srt.text, project.name],
  );
  const working = state.kind === "working";

  // Free the preview URL, and stop any export when the panel closes.
  const doneUrl = state.kind === "done" ? state.url : null;
  useEffect(() => () => {
    if (doneUrl) URL.revokeObjectURL(doneUrl);
  }, [doneUrl]);
  useEffect(() => () => controller.current?.abort(), []);

  // Keep the screen awake and warn before leaving while the video is being made.
  useEffect(() => {
    if (!working) return;
    let lock: WakeLockSentinel | null = null;
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then(
        (l) => {
          lock = l;
        },
        () => undefined,
      );
    }
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void lock?.release();
    };
  }, [working]);

  const start = async () => {
    const abort = new AbortController();
    controller.current = abort;
    setState({ kind: "working", progress: { fraction: null, message: "Getting ready…" }, cancelling: false });
    try {
      const video = await loadMediaBlob(project.media.id);
      if (!video) throw new Error("The video for this project is missing on this device. Open it in Editor mode to find it again.");
      const result = await exportEngine().exportVideo({
        video,
        cues: project.cues,
        style: project.style,
        signal: abort.signal,
        onProgress: (progress) => {
          setState((s) => (s.kind === "working" ? { ...s, progress } : s));
        },
      });
      const file = new File([result.blob], exportName(project.name, "mp4"), { type: "video/mp4" });
      setState({ kind: "done", result, file, url: URL.createObjectURL(file) });
    } catch (error) {
      if (abort.signal.aborted) setState({ kind: "cancelled" });
      else setState({ kind: "failed", message: messageOf(error) });
    } finally {
      controller.current = null;
    }
  };

  const pct = working && state.progress.fraction !== null ? Math.round(state.progress.fraction * 100) : null;

  return (
    <div className="export">
      <p className="field__hint">Your original video is not changed. A new file is made on this device; nothing is uploaded.</p>
      {issues.length > 0 && (
        <p className="export__warn">
          {issues.length === 1 ? "1 timing warning" : `${String(issues.length)} timing warnings`} (for example: {issues[0].message}). You can still export, or fix them in Editor mode first.
        </p>
      )}

      <section className="export__block" aria-labelledby="export-video">
        <h3 id="export-video">Video with subtitles (MP4)</h3>
        {state.kind === "choose" || state.kind === "cancelled" || state.kind === "failed" ? (
          <>
            {state.kind === "cancelled" && <p role="status">Export cancelled. Nothing was saved.</p>}
            {state.kind === "failed" && (
              <p role="alert" className="export__error">
                {state.message}
              </p>
            )}
            {!videoAvailable ? (
              <p className="export__error">
                The video for this project is not on this device, so a video cannot be made. Choose it again in Editor mode. You can still save the subtitle file below.
              </p>
            ) : supported ? (
              <>
                <p className="field__hint">
                  Takes about as long as the video, sometimes longer on a phone. Keep this screen open until it finishes.
                </p>
                <button type="button" className="button" disabled={project.cues.length === 0} onClick={() => void start()}>
                  {state.kind === "choose" ? "Make video" : "Try again"}
                </button>
              </>
            ) : (
              <p className="export__error">
                This browser cannot make video files. Use Chrome on Android, Safari on iPhone (iOS 17 or later) or a computer. You can still save the subtitle file below.
              </p>
            )}
          </>
        ) : state.kind === "working" ? (
          <div className="job-progress">
            <p role="status" aria-live="polite">
              {state.cancelling ? "Cancelling…" : state.progress.message}
              {pct !== null && !state.cancelling && ` (${String(pct)}%)`}
            </p>
            <progress className="job-progress__bar" aria-label="Export progress" max={100} {...(pct === null ? {} : { value: pct })} />
            <p className="field__hint">Keep this screen open.</p>
            <button
              type="button"
              className="button button--secondary"
              disabled={state.cancelling}
              onClick={() => {
                setState({ ...state, cancelling: true });
                controller.current?.abort();
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <p role="status">
              ✓ Your video is ready and checked: {clock(state.result.durationMs)}, {String(state.result.width)}×{String(state.result.height)}, {mb(state.file.size)}
              {state.result.hasAudio ? ", with sound." : ", no sound."}
            </p>
            {state.result.notes.map((n) => (
              <p key={n} className="export__warn">
                {n}
              </p>
            ))}
            <video className="export__preview" src={state.url} controls playsInline aria-label="The new video" />
            <SaveButtons file={state.file} primaryLabel="Download video" />
            <button type="button" className="button button--secondary" onClick={() => { setState({ kind: "choose" }); }}>
              Make it again
            </button>
          </>
        )}
      </section>

      <section className="export__block" aria-labelledby="export-srt">
        <h3 id="export-srt">Subtitle file (SRT)</h3>
        <p className="field__hint">
          For YouTube, VLC or other editors. Text and timing only; the look is not included.
          {srt.skipped > 0 && ` ${String(srt.skipped)} empty or broken subtitles are left out.`}
        </p>
        {srt.written === 0 ? (
          <p className="export__error">There are no subtitles to save yet.</p>
        ) : (
          <SaveButtons file={srtFile} primaryLabel="Download SRT" />
        )}
      </section>
    </div>
  );
}
