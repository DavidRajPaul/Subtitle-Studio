import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import type { StageSize } from "../lib/style";
import { formatTimecode, parseTimecode } from "../lib/timecode";

export interface VideoPreviewHandle {
  seekTo: (ms: number) => void;
  pause: () => void;
}

interface Props {
  src: string;
  durationMs: number;
  label: string;
  /** Pixel size of the video, used to size the stage so overlays line up with the picture. */
  width?: number;
  height?: number;
  onTimeChange?: (ms: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  /** Draws on top of the picture (subtitles). Receives the stage size in CSS pixels. */
  renderOverlay?: (size: StageSize) => ReactNode;
}

export const VideoPreview = forwardRef<VideoPreviewHandle, Props>(
  function VideoPreview(
    {
      src,
      durationMs,
      label,
      width,
      height,
      onTimeChange,
      onPlayingChange,
      renderOverlay,
    },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const [currentMs, setCurrentMs] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const [seekText, setSeekText] = useState("");
    const [seekError, setSeekError] = useState<string | null>(null);
    const [size, setSize] = useState<StageSize>({ w: 640, h: 360 });

    const timeCallback = useRef(onTimeChange);
    timeCallback.current = onTimeChange;
    const playingCallback = useRef(onPlayingChange);
    playingCallback.current = onPlayingChange;

    const reportTime = useCallback((ms: number) => {
      setCurrentMs(ms);
      timeCallback.current?.(ms);
    }, []);

    const setPlayingState = useCallback((value: boolean) => {
      setPlaying(value);
      playingCallback.current?.(value);
    }, []);

    useEffect(() => {
      reportTime(0);
      setPlayingState(false);
      setPlaybackError(null);
    }, [src, reportTime, setPlayingState]);

    // Keep the overlay scaled to the picture as the window or sheet changes size.
    useEffect(() => {
      const el = stageRef.current;
      if (!el) return;
      const measure = () => {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) setSize({ w: r.width, h: r.height });
      };
      measure();
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => {
        observer.disconnect();
      };
    }, []);

    // While playing, follow the video frame by frame (timeupdate alone is too coarse for subtitles).
    useEffect(() => {
      if (!playing) return;
      let raf = 0;
      let last = 0;
      const tick = (now: number) => {
        const video = videoRef.current;
        if (video && now - last >= 33) {
          last = now;
          reportTime(Math.round(video.currentTime * 1000));
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(raf);
      };
    }, [playing, reportTime]);

    const seekTo = useCallback(
      (ms: number) => {
        const clamped = Math.min(Math.max(0, Math.round(ms)), durationMs);
        const video = videoRef.current;
        if (video) video.currentTime = clamped / 1000;
        reportTime(clamped);
      },
      [durationMs, reportTime],
    );

    useImperativeHandle(
      ref,
      () => ({
        seekTo,
        pause: () => {
          const v = videoRef.current;
          if (v && !v.paused) v.pause();
        },
      }),
      [seekTo],
    );

    const togglePlay = () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) {
        video.play().catch(() => {
          // Keep a more specific format error from onError if one is already shown.
          setPlaybackError(
            (current) =>
              current ??
              "This browser could not play the video. Try another browser or file.",
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
        setSeekError(
          `That is past the end of the video (${formatTimecode(durationMs)}).`,
        );
        return;
      }
      setSeekError(null);
      seekTo(parsed.ms);
    };

    const ratio = width && height ? width / height : 16 / 9;
    const stageStyle = { "--ar": String(ratio) } as CSSProperties;

    return (
      <section className="panel preview" aria-label="Video preview">
        <div className="preview__frame">
          <div ref={stageRef} className="preview__stage" style={stageStyle}>
            <video
              ref={videoRef}
              src={src}
              className="preview__video"
              preload="metadata"
              playsInline
              aria-label={label}
              onTimeUpdate={(e) => {
                if (!playing)
                  reportTime(Math.round(e.currentTarget.currentTime * 1000));
              }}
              onSeeked={(e) => {
                reportTime(Math.round(e.currentTarget.currentTime * 1000));
              }}
              onPlay={() => {
                setPlayingState(true);
              }}
              onPause={() => {
                setPlayingState(false);
              }}
              onEnded={() => {
                setPlayingState(false);
              }}
              onError={() => {
                setPlaybackError(
                  "This device cannot play this video's format (for example HEVC from a newer " +
                    "iPhone in some Android browsers), so it cannot be previewed or exported here. " +
                    "Try Safari or Chrome on another device, or convert the video to MP4 (H.264).",
                );
              }}
            />
            {renderOverlay?.(size)}
          </div>
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
              aria-describedby={
                seekError ? "seek-hint seek-error" : "seek-hint"
              }
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
  },
);
