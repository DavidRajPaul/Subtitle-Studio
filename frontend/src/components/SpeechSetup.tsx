// Not used by the web app yet: kept for the next stage, which connects it to speech
// recognition running in the browser (it was built for the Python backend in Phase 4).
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { messageOf } from "../api/http";
import {
  cancelJob,
  getSpeechInfo,
  importAudio,
  removeAudio,
  startTranscription,
  validateMp3File,
  type ImportedAudio,
  type SpeechInfo,
  type TranscriptionResult,
} from "../api/speech";
import { useJob } from "../hooks/useJob";
import { isHostedTest } from "../lib/hosted";
import { formatTimecode } from "../lib/timecode";
import { JobProgress } from "./JobProgress";
import { ModelDownload } from "./ModelDownload";

interface Props {
  mediaId: string;
  videoHasAudio: boolean;
  videoDurationMs: number;
  onSwitchToText: () => void;
  /** Creates the project and opens the editor. Rejects with an ApiError if saving fails. */
  onOpenEditor: (result: TranscriptionResult) => Promise<void>;
}

type InfoState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; info: SpeechInfo };

type Mp3State =
  | { kind: "none" }
  | { kind: "checking"; file: File }
  | { kind: "error"; file: File; message: string }
  | { kind: "ready"; audio: ImportedAudio };

const LANG_STORAGE = "subtitle-studio.speech.language";
const MODEL_STORAGE = "subtitle-studio.speech.model";

function remembered(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A convenience only.
  }
}

export function SpeechSetup({
  mediaId,
  videoHasAudio,
  videoDurationMs,
  onSwitchToText,
  onOpenEditor,
}: Props) {
  const id = useId();
  const mp3Input = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<InfoState>({ kind: "loading" });
  const [refresh, setRefresh] = useState(0);
  const [mp3, setMp3] = useState<Mp3State>({ kind: "none" });
  const [language, setLanguage] = useState(() => remembered(LANG_STORAGE) ?? "auto");
  const [modelName, setModelName] = useState<string | null>(() => remembered(MODEL_STORAGE));
  const [jobId, setJobId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const job = useJob<TranscriptionResult>(jobId);
  const hosted = isHostedTest();

  useEffect(() => {
    const controller = new AbortController();
    getSpeechInfo(controller.signal)
      .then((loaded) => {
        setInfo({ kind: "ready", info: loaded });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setInfo({ kind: "error", message: messageOf(error) });
      });
    return () => {
      controller.abort();
    };
  }, [refresh]);

  const reload = useCallback(() => {
    setRefresh((n) => n + 1);
  }, []);

  // The MP3 copy belongs to this screen: remove it when it is replaced or the screen closes.
  const audioId = mp3.kind === "ready" ? mp3.audio.id : null;
  useEffect(
    () => () => {
      if (audioId) void removeAudio(audioId);
    },
    [audioId],
  );

  useEffect(() => {
    if (job.kind === "done" || job.kind === "lost") setCancelling(false);
  }, [job.kind]);

  const chooseMp3 = (file: File) => {
    const problem = validateMp3File(file);
    if (problem) {
      setMp3({ kind: "error", file, message: problem });
      return;
    }
    setMp3({ kind: "checking", file });
    importAudio(file)
      .then((audio) => {
        setMp3({ kind: "ready", audio });
      })
      .catch((error: unknown) => {
        setMp3({ kind: "error", file, message: messageOf(error, "This MP3 could not be used.") });
      });
  };

  if (info.kind === "loading") {
    return (
      <p role="status" aria-busy="true" className="panel">
        Checking speech recognition…
      </p>
    );
  }
  if (info.kind === "error") {
    return (
      <section className="panel panel--error">
        <h2>Speech recognition could not be checked</h2>
        <p role="alert" className="inline-error">
          {info.message}
        </p>
        <button type="button" className="button" onClick={reload}>
          Try again
        </button>
      </section>
    );
  }

  const { engine, models, languages } = info.info;
  if (!engine.available) {
    return (
      <section className="panel panel--error">
        <h2>Speech recognition is not installed</h2>
        <p>{engine.detail}</p>
        <div className="button-row">
          <button type="button" className="button" onClick={reload}>
            Check again
          </button>
          <button type="button" className="button button--secondary" onClick={onSwitchToText}>
            Use a text file instead
          </button>
        </div>
      </section>
    );
  }

  const model =
    models.find((m) => m.name === modelName) ??
    models.find((m) => m.name === info.info.default_model) ??
    models.at(0);
  if (!model) {
    return (
      <section className="panel panel--error">
        <h2>No speech models are offered</h2>
        <p>The backend did not list any speech models. Restart it and try again.</p>
        <button type="button" className="button" onClick={reload}>
          Check again
        </button>
      </section>
    );
  }
  const hasSource = mp3.kind === "ready" || videoHasAudio;
  const running = job.kind === "active";
  const result = job.kind === "done" && job.job.status === "succeeded" ? job.job.result : null;
  const failure =
    job.kind === "done" && job.job.status === "failed"
      ? (job.job.error?.message ?? "Transcription failed.")
      : job.kind === "lost"
        ? job.message
        : null;
  const nonEnglish = language !== "auto" && language !== "en";
  const weakModel = model.name === "tiny" || model.name === "base";
  const mp3Longer =
    mp3.kind === "ready" && mp3.audio.metadata.duration_ms > videoDurationMs + 1000;

  const transcribe = () => {
    if (mp3.kind === "checking") return;
    setStartError(null);
    setOpenError(null);
    startTranscription({
      media_id: mediaId,
      audio_id: mp3.kind === "ready" ? mp3.audio.id : null,
      language,
      model: model.name,
    })
      .then(setJobId)
      .catch((error: unknown) => {
        setStartError(messageOf(error, "Transcription could not be started."));
        reload();
      });
  };

  const openEditor = () => {
    if (!result) return;
    setOpening(true);
    setOpenError(null);
    onOpenEditor(result).catch((error: unknown) => {
      setOpenError(messageOf(error));
      setOpening(false);
    });
  };

  return (
    <>
      <section className="panel" aria-labelledby={`${id}-audio`}>
        <h2 id={`${id}-audio`}>Audio to transcribe</h2>
        <input
          ref={mp3Input}
          type="file"
          accept=".mp3,audio/mpeg"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) chooseMp3(file);
          }}
        />
        {mp3.kind === "none" &&
          (videoHasAudio ? (
            <p>The video&apos;s own audio will be used.</p>
          ) : (
            <p className="warning">
              <span aria-hidden="true">⚠ </span>
              <strong>This video has no audio.</strong> Choose an MP3 with the speech, or create
              subtitles from a text file instead.
            </p>
          ))}
        {mp3.kind === "checking" && (
          <p role="status" aria-busy="true">
            Checking <strong>{mp3.file.name}</strong>…
          </p>
        )}
        {mp3.kind === "error" && (
          <>
            <p className="file-name">{mp3.file.name}</p>
            <p role="alert" className="inline-error">
              {mp3.message}
            </p>
          </>
        )}
        {mp3.kind === "ready" && (
          <>
            <p className="file-name">{mp3.audio.filename}</p>
            <p>
              This MP3 ({formatTimecode(mp3.audio.metadata.duration_ms)}) will be used instead of
              the video&apos;s audio.
            </p>
            {mp3Longer && (
              <p className="warning">
                <span aria-hidden="true">⚠ </span>
                <strong>Warning:</strong> the MP3 is longer than the video, so some subtitles may
                start after the video ends.
              </p>
            )}
          </>
        )}
        <div className="button-row">
          <button
            type="button"
            className={!videoHasAudio && mp3.kind !== "ready" ? "button" : "button button--secondary"}
            disabled={running || mp3.kind === "checking"}
            onClick={() => mp3Input.current?.click()}
          >
            {mp3.kind === "ready" ? "Replace MP3" : "Select MP3 (optional)"}
          </button>
          {(mp3.kind === "ready" || mp3.kind === "error") && (
            <button
              type="button"
              className="button button--secondary"
              disabled={running}
              onClick={() => {
                setMp3({ kind: "none" });
              }}
            >
              {videoHasAudio ? "Use the video's audio" : "Remove MP3"}
            </button>
          )}
          {!videoHasAudio && mp3.kind !== "ready" && (
            <button type="button" className="button button--secondary" onClick={onSwitchToText}>
              Use a text file instead
            </button>
          )}
        </div>
      </section>

      <section className="panel" aria-labelledby={`${id}-settings`}>
        <h2 id={`${id}-settings`}>Speech recognition</h2>
        <p className="muted">
          {hosted
            ? "Speech is recognised on the test computer, not on your device."
            : "Speech is recognised on this computer. Nothing is sent anywhere; the internet is only needed once to download a model."}
        </p>
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
              setLanguage(e.currentTarget.value);
              remember(LANG_STORAGE, e.currentTarget.value);
            }}
          >
            <option value="auto">Detect automatically</option>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <span className="field__hint">
            Choosing the language is more reliable than detecting it, especially for short clips.
          </span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-model`}>
            Model
          </label>
          <select
            id={`${id}-model`}
            className="text-input"
            value={model.name}
            disabled={running}
            onChange={(e) => {
              setModelName(e.currentTarget.value);
              remember(MODEL_STORAGE, e.currentTarget.value);
            }}
          >
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.label} · about {m.approx_size_mb} MB · {m.installed ? "installed" : "not installed"}
              </option>
            ))}
          </select>
          <span className="field__hint">{model.description}</span>
        </div>
        {nonEnglish && weakModel && (
          <p className="warning">
            <span aria-hidden="true">ⓘ </span>
            For this language, <strong>Small</strong> is noticeably more accurate than{" "}
            {model.label}.
          </p>
        )}
        {!model.installed && (
          <div className="panel panel--info model-missing">
            <p>
              <strong>The {model.label} model is not installed yet.</strong>
            </p>
            <ModelDownload key={model.name} model={model} onChanged={reload} />
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby={`${id}-run`}>
        <h2 id={`${id}-run`}>Transcribe</h2>
        {running ? (
          <JobProgress
            label="Transcription progress"
            job={job.job}
            cancelling={cancelling}
            onCancel={() => {
              if (!jobId) return;
              setCancelling(true);
              void cancelJob(jobId).catch(() => {
                setCancelling(false);
              });
            }}
          />
        ) : (
          <>
            {!hasSource && <p className="muted">Choose an MP3 first: the video has no audio.</p>}
            {hasSource && !model.installed && (
              <p className="muted">Download the model above first.</p>
            )}
            {startError && (
              <p role="alert" className="inline-error">
                {startError}
              </p>
            )}
            {failure && (
              <p role="alert" className="inline-error">
                {failure}
              </p>
            )}
            {job.kind === "done" && job.job.status === "cancelled" && (
              <p role="status">Transcription cancelled. Nothing was changed.</p>
            )}
            <button
              type="button"
              className={result ? "button button--secondary" : "button"}
              disabled={!hasSource || !model.installed || mp3.kind === "checking"}
              onClick={transcribe}
            >
              {failure || result ? "Transcribe again" : "Transcribe"}
            </button>
            <p className="field__hint">
              Takes roughly as long as the audio, or longer with bigger models. You can cancel at
              any time.
            </p>
          </>
        )}
      </section>

      {result && (
        <section className="panel" aria-labelledby={`${id}-result`}>
          <h2 id={`${id}-result`}>Result</h2>
          <p role="status">
            <strong>
              {result.cues.length} {result.cues.length === 1 ? "subtitle" : "subtitles"}
            </strong>{" "}
            recognised
            {result.language_name ? ` in ${result.language_name}` : ""}
            {language === "auto" && result.language_probability !== null
              ? ` (detected, ${String(Math.round(result.language_probability * 100))}% sure)`
              : ""}
            . Check the text and timing in the editor: speech recognition makes mistakes.
          </p>
          <ol className="cue-list" aria-label="Recognised subtitles">
            {result.cues.slice(0, 5).map((cue, i) => (
              <li key={cue.id} className="cue-row">
                <div className="cue-row__head">
                  <span className="cue-row__num">{i + 1}</span>
                  <span className="cue-row__time">
                    {formatTimecode(cue.start_ms)} → {formatTimecode(cue.end_ms)}
                  </span>
                </div>
                <p className="cue-row__text">{cue.text}</p>
              </li>
            ))}
          </ol>
          {result.cues.length > 5 && (
            <p className="muted">…and {result.cues.length - 5} more in the editor.</p>
          )}
          {openError && (
            <p role="alert" className="inline-error">
              {openError}
            </p>
          )}
          <button type="button" className="button" disabled={opening} onClick={openEditor}>
            {opening ? "Creating the project…" : "Open in editor"}
          </button>
        </section>
      )}
    </>
  );
}
