import { useEffect, useId, useRef, useState } from "react";
import { messageOf } from "../api/http";
import { importMedia, MediaImportError, removeMedia, validateVideoFile, type ImportedMedia } from "../api/media";
import type { LoadedProject } from "../api/projects";
import {
  cancelJob,
  getSpeechInfo,
  startTranscription,
  type SpeechInfo,
  type TranscriptionResult,
} from "../api/speech";
import { parseText, validateTxtFile } from "../api/subtitles";
import { JobProgress } from "../components/JobProgress";
import { ModelDownload } from "../components/ModelDownload";
import { VideoPreview } from "../components/VideoPreview";
import { DEFAULT_SETTINGS } from "../engine/timing";
import { useJob } from "../hooks/useJob";
import { segmentsFromTyped, timeSegments } from "../lib/easyText";
import { createProject } from "../lib/newProject";
import { getLanguage, lastStyle, setLanguage } from "../lib/prefs";
import { formatTimecode } from "../lib/timecode";
import { VIDEO_ACCEPT, VIDEO_FORMATS_LABEL } from "../lib/videoFormats";

interface Props {
  onBack: () => void;
  onCreated: (project: LoadedProject) => void;
}

type Video =
  | { kind: "empty" }
  | { kind: "reading"; file: File }
  | { kind: "error"; file: File; message: string }
  | { kind: "ready"; media: ImportedMedia; url: string };

type Source = "voice" | "type" | "txt";

/** Picks the model: Small for non-English when it is installed, otherwise Base. */
function chooseModel(info: SpeechInfo, language: string): string {
  const small = info.models.find((m) => m.name === "small");
  if (language !== "en" && small?.installed) return "small";
  return info.default_model;
}

export function EasyFlow({ onBack, onCreated }: Props) {
  const id = useId();
  const videoInput = useRef<HTMLInputElement>(null);
  const txtInput = useRef<HTMLInputElement>(null);
  const [video, setVideo] = useState<Video>({ kind: "empty" });
  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState<Source | null>(null);
  const [typed, setTyped] = useState("");
  const [txt, setTxt] = useState<File | null>(null);
  const [language, setLang] = useState(getLanguage);
  const [info, setInfo] = useState<SpeechInfo | null>(null);
  const [infoTick, setInfoTick] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const job = useJob<TranscriptionResult>(jobId);

  const readyUrl = video.kind === "ready" ? video.url : null;
  const readyId = video.kind === "ready" ? video.media.id : null;
  useEffect(
    () => () => {
      if (readyUrl) URL.revokeObjectURL(readyUrl);
      if (readyId) void removeMedia(readyId); // only forgets a video that was never saved
    },
    [readyUrl, readyId],
  );

  useEffect(() => {
    if (source !== "voice") return;
    let cancelled = false;
    getSpeechInfo()
      .then((i) => {
        if (!cancelled) setInfo(i);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [source, infoTick]);

  const pickVideo = (file: File) => {
    const problem = validateVideoFile(file);
    if (problem) {
      setVideo({ kind: "error", file, message: problem });
      return;
    }
    setVideo({ kind: "reading", file });
    importMedia(file)
      .then((media) => {
        setVideo({ kind: "ready", media, url: URL.createObjectURL(file) });
      })
      .catch((err: unknown) => {
        setVideo({
          kind: "error",
          file,
          message: err instanceof MediaImportError ? err.message : "This video could not be read. Try another file.",
        });
      });
  };

  const media = video.kind === "ready" ? video.media : null;

  const finish = async (content: Parameters<typeof createProject>[2], workflow: "speech" | "text") => {
    if (!media) return;
    onCreated(await createProject(media, workflow, content, await lastStyle()));
  };

  const finishRef = useRef(finish);
  finishRef.current = finish;

  // When recognition finishes, the project is created and the look step opens.
  useEffect(() => {
    if (job.kind !== "done" || job.job.status !== "succeeded" || !job.job.result) return;
    const result = job.job.result;
    setJobId(null);
    setBusy(true);
    finishRef
      .current({ cues: result.cues, mode: "manual", segmentation: "line", settings: DEFAULT_SETTINGS }, "speech")
      .catch((err: unknown) => {
        setError(messageOf(err, "The project could not be saved."));
        setBusy(false);
      });
  }, [job]);

  const jobFailure =
    job.kind === "done" && job.job.status === "failed"
      ? (job.job.error?.message ?? "Recognition failed.")
      : job.kind === "lost"
        ? job.message
        : null;
  const jobCancelled = job.kind === "done" && job.job.status === "cancelled";

  const makeFromText = async (segmentsPromise: Promise<string[]>) => {
    if (!media) return;
    setBusy(true);
    setError(null);
    try {
      const segments = await segmentsPromise;
      const { cues, mode } = timeSegments(segments, media.metadata.duration_ms);
      await finish({ cues, mode, segmentation: "line", settings: DEFAULT_SETTINGS }, "text");
    } catch (err) {
      setError(messageOf(err, "The subtitles could not be made from this text."));
      setBusy(false);
    }
  };

  const makeFromVoice = () => {
    if (!media || !info) return;
    setError(null);
    setCancelling(false);
    startTranscription({ media_id: media.id, audio_id: null, language, model: chooseModel(info, language) })
      .then(setJobId)
      .catch((err: unknown) => {
        setError(messageOf(err, "Recognition could not start."));
        setInfoTick((n) => n + 1);
      });
  };

  const model = info ? info.models.find((m) => m.name === chooseModel(info, language)) : undefined;
  const running = job.kind === "active";

  return (
    <>
      <div className="screen-header">
        <button
          type="button"
          className="button button--secondary"
          disabled={running || busy}
          onClick={step === 2 ? () => { setStep(1); } : onBack}
        >
          ← Back
        </button>
        <span className="muted">Step {step} of 3</span>
      </div>

      {step === 1 && (
        <section aria-labelledby={`${id}-video`}>
          <h1 id={`${id}-video`}>Choose your video</h1>
          <input
            ref={videoInput}
            type="file"
            accept={VIDEO_ACCEPT}
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) pickVideo(file);
            }}
          />
          {video.kind === "empty" && (
            <button type="button" className="button button--big" onClick={() => videoInput.current?.click()}>
              Pick a video
            </button>
          )}
          {video.kind === "empty" && (
            <p className="field__hint">{VIDEO_FORMATS_LABEL}. Your original file is never changed.</p>
          )}
          {video.kind === "reading" && (
            <p role="status" aria-busy="true" className="panel">
              Reading <strong>{video.file.name}</strong>…
            </p>
          )}
          {video.kind === "error" && (
            <div className="panel panel--error">
              <p className="file-name">{video.file.name}</p>
              <p role="alert" className="inline-error">
                {video.message}
              </p>
              <button type="button" className="button" onClick={() => videoInput.current?.click()}>
                Choose a different video
              </button>
            </div>
          )}
          {video.kind === "ready" && (
            <>
              <VideoPreview
                src={video.url}
                durationMs={video.media.metadata.duration_ms}
                label={`Preview of ${video.media.filename}`}
                width={video.media.metadata.width}
                height={video.media.metadata.height}
              />
              <p className="muted">
                {video.media.filename} · {formatTimecode(video.media.metadata.duration_ms)} ·{" "}
                {video.media.metadata.has_audio ? "has sound" : "no sound"}
              </p>
              <div className="button-row">
                <button type="button" className="button button--big" onClick={() => { setStep(2); }}>
                  Next: the words
                </button>
                <button type="button" className="button button--secondary" onClick={() => videoInput.current?.click()}>
                  Choose another video
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === 2 && media && (
        <section aria-labelledby={`${id}-words`}>
          <h1 id={`${id}-words`}>Where do the words come from?</h1>
          <div className="source-cards" role="radiogroup" aria-label="Where the words come from">
            <button
              type="button"
              role="radio"
              aria-checked={source === "voice"}
              className="source-card"
              disabled={!media.metadata.has_audio || running || busy}
              onClick={() => { setSource("voice"); }}
            >
              <span className="source-card__icon" aria-hidden="true">🎙</span>
              <span>
                <strong>From the voice in the video</strong>
                <span className="choice__help">
                  {media.metadata.has_audio
                    ? "Speech is recognised on this device."
                    : "This video has no sound. Type the words or use a TXT file."}
                </span>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={source === "type"} className="source-card" disabled={running || busy} onClick={() => { setSource("type"); }}>
              <span className="source-card__icon" aria-hidden="true">⌨</span>
              <span>
                <strong>Type or paste the words</strong>
                <span className="choice__help">Each line becomes one subtitle.</span>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={source === "txt"} className="source-card" disabled={running || busy} onClick={() => { setSource("txt"); }}>
              <span className="source-card__icon" aria-hidden="true">📄</span>
              <span>
                <strong>A TXT file</strong>
                <span className="choice__help">A script saved as UTF-8 text, one subtitle per line.</span>
              </span>
            </button>
          </div>

          {source === "voice" && (
            <div className="panel">
              <div className="field">
                <label className="field__label" htmlFor={`${id}-lang`}>
                  Spoken language
                </label>
                <select
                  id={`${id}-lang`}
                  className="text-input"
                  value={language}
                  disabled={running}
                  onChange={(e) => {
                    setLang(e.currentTarget.value);
                    setLanguage(e.currentTarget.value);
                  }}
                >
                  {(info?.languages ?? [{ code: "ta", name: "Tamil" }, { code: "en", name: "English" }]).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              {info && !info.engine.available && <p className="inline-error">{info.engine.detail}</p>}
              {model && !model.installed && (
                <div className="model-missing">
                  <p>
                    <strong>One-time download needed.</strong> The {model.label} speech model is
                    downloaded once and then works without the internet.
                    {language !== "en" && " For Tamil, Small (in Settings) is more accurate; Base is quicker on a phone."}
                  </p>
                  <ModelDownload key={model.name} model={model} onChanged={() => { setInfoTick((n) => n + 1); }} />
                </div>
              )}
              {running ? (
                <JobProgress
                  label="Recognising speech"
                  job={job.job}
                  cancelling={cancelling}
                  onCancel={() => {
                    if (!jobId) return;
                    setCancelling(true);
                    void cancelJob(jobId);
                  }}
                />
              ) : (
                <>
                  {jobFailure && (
                    <p role="alert" className="inline-error">
                      {jobFailure}
                    </p>
                  )}
                  {jobCancelled && <p role="status">Cancelled. Nothing was changed.</p>}
                  <button type="button" className="button button--big" disabled={!model?.installed || busy} onClick={makeFromVoice}>
                    {jobFailure ? "Try again" : "Make subtitles"}
                  </button>
                  <p className="field__hint">Keep this screen open while it works; it can take a few minutes on a phone.</p>
                </>
              )}
            </div>
          )}

          {source === "type" && (
            <div className="panel">
              <label className="field__label" htmlFor={`${id}-typed`}>
                The words
              </label>
              <textarea
                id={`${id}-typed`}
                className="text-input text-input--area easy-typed"
                rows={8}
                value={typed}
                placeholder={"வணக்கம் நண்பர்களே\nToday we will see…"}
                onChange={(e) => {
                  setTyped(e.currentTarget.value);
                }}
              />
              <p className="field__hint">One subtitle per line. A single paragraph is split into sentences.</p>
              <button
                type="button"
                className="button button--big"
                disabled={typed.trim() === "" || busy}
                onClick={() => void makeFromText(Promise.resolve().then(() => segmentsFromTyped(typed)))}
              >
                Make subtitles
              </button>
            </div>
          )}

          {source === "txt" && (
            <div className="panel">
              <input
                ref={txtInput}
                type="file"
                accept=".txt,text/plain"
                className="visually-hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (!file) return;
                  const problem = validateTxtFile(file);
                  setError(problem);
                  setTxt(problem ? null : file);
                }}
              />
              {txt && <p className="file-name">{txt.name}</p>}
              <div className="button-row">
                <button type="button" className={txt ? "button button--secondary" : "button"} onClick={() => txtInput.current?.click()}>
                  {txt ? "Choose another file" : "Pick a TXT file"}
                </button>
                {txt && (
                  <button
                    type="button"
                    className="button button--big"
                    disabled={busy}
                    onClick={() => void makeFromText(parseText(txt, "line").then((p) => p.segments))}
                  >
                    Make subtitles
                  </button>
                )}
              </div>
            </div>
          )}

          {busy && (
            <p role="status" aria-busy="true">
              Making your subtitles…
            </p>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </section>
      )}
    </>
  );
}
