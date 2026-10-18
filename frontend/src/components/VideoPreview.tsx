import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatTimecode, parseTimecode } from "../lib/timecode";

interface Props {
  src: string;
  durationMs: number;
  label: string;
}

export function VideoPreview({ src, durationMs, label }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [seekText, setSeekText] = useState("");
  const [seekError, setSeekError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentMs(0);
    setPlaying(false);
    setPlaybackError(null);
  }, [src]);

  const seekTo = (ms: number) => {
    const clamped = Math.min(Math.max(0, ms), durationMs);
    const video = videoRef.current;
    if (video) video.currentTime = clamped / 1000;
    setCurrentMs(clamped);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {
        // Keep a more specific format error from onError if one is already shown.
        setPlaybackError(
          (current) =>
            current ?? "This browser could not play the video. Try another browser or file.",
        );
      });
    } else {
      video.pause();
    }
  };

  const onSeekSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseTimecode(seekText);
    if (!parsed.ok) {
      setSeekError(parsed.error);
      return;
    }
    if (parsed.ms > durationMs) {
      setSeekError(`That is past the end of the video (${formatTimecode(durationMs)}).`);
      return;
    }
    setSeekError(null);
    seekTo(parsed.ms);
  };

  return (
    <section className="panel preview" aria-label="Video preview">
      <div className="preview__frame">
        <video
          ref={videoRef}
          src={src}
          className="preview__video"
          preload="metadata"
          playsInline
          aria-label={label}
          onTimeUpdate={(e) => {
            setCurrentMs(Math.round(e.currentTarget.currentTime * 1000));
          }}
          onPlay={() => {
            setPlaying(true);
          }}
          onPause={() => {
            setPlaying(false);
          }}
          onEnded={() => {
            setPlaying(false);
          }}
          onError={() => {
            setPlaybackError(
              "This browser cannot play this video's format. The file was inspected successfully, " +
                "so it can still be used for export; try Chrome or Edge to preview it.",
            );
          }}
        />
      </div>
      {playbackError && (
        <p role="alert" className="inline-error">
          {playbackError}
        </p>
      )}
      <div className="preview__controls">
        <button
          type="button"
          className="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="preview__time" aria-live="off">
          <span aria-label="Current time">{formatTimecode(currentMs)}</span>
          {" / "}
          <span aria-label="Duration">{formatTimecode(durationMs)}</span>
        </span>
      </div>
      <label className="field">
        <span className="field__label">Position</span>
        <input
          type="range"
          className="preview__scrubber"
          min={0}
          max={durationMs}
          step={10}
          value={currentMs}
          aria-valuetext={formatTimecode(currentMs)}
          onChange={(e) => {
            seekTo(Number(e.currentTarget.value));
          }}
        />
      </label>
      <form className="seek-form" onSubmit={onSeekSubmit} noValidate>
        <label className="field" htmlFor="seek-input">
          <span className="field__label">Go to time</span>
          <span className="field__hint" id="seek-hint">
            For example 00:00:05.200 or 5.2
          </span>
        </label>
        <div className="seek-form__row">
          <input
            id="seek-input"
            className="text-input"
            inputMode="decimal"
            autoComplete="off"
            value={seekText}
            placeholder="00:00:00.000"
            aria-describedby={seekError ? "seek-hint seek-error" : "seek-hint"}
            aria-invalid={seekError ? true : undefined}
            onChange={(e) => {
              setSeekText(e.currentTarget.value);
            }}
          />
          <button type="submit" className="button button--secondary">
            Go
          </button>
        </div>
        {seekError && (
          <p id="seek-error" className="inline-error" role="alert">
            {seekError}
          </p>
        )}
      </form>
    </section>
  );
}
