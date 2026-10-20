import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ProjectCue } from "../api/projects";
import { resizeStart, setEnd, setStart } from "../lib/cueEdit";
import { formatTimecode } from "../lib/timecode";
import { assignLanes, msToPx, pxToMs, snapMs, tickStepMs } from "../lib/timeline";

const LANE_HEIGHT = 48; // blocks are 44 px tall: comfortable to tap
const RULER_HEIGHT = 24;
const MIN_DURATION = 10;

type DragMode = "move" | "start" | "end";

interface Drag {
  id: string;
  mode: DragMode;
  startX: number;
  original: ProjectCue[];
  moved: boolean;
}

interface Props {
  cues: ProjectCue[];
  durationMs: number;
  currentMs: number;
  selectedId: string | null;
  sequential: boolean;
  playing: boolean;
  onSeek: (ms: number) => void;
  onSelect: (id: string) => void;
  /** Called with the full new list while dragging or nudging. */
  onApply: (cues: ProjectCue[]) => void;
}

/**
 * Timeline strip. Every action here has a numeric equivalent in the subtitle editor:
 * drag a block to move it, drag its edge handles (mouse) to change start/end, or select a
 * block and use the arrow keys (Shift = 1 s, Alt = move the end instead of the start).
 */
export function Timeline({
  cues,
  durationMs,
  currentMs,
  selectedId,
  sequential,
  playing,
  onSeek,
  onSelect,
  onApply,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [viewWidth, setViewWidth] = useState(600);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setViewWidth(el.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const fitPxPerSec = Math.max(4, (viewWidth - 4) / (durationMs / 1000));
  const pxPerSec = fitPxPerSec * zoom;
  const totalPx = Math.max(viewWidth - 4, msToPx(durationMs, pxPerSec));
  const lanes = useMemo(() => assignLanes(cues), [cues]);
  const laneCount = Math.max(1, ...lanes.map((l) => l + 1));
  const step = tickStepMs(pxPerSec);
  const ticks: number[] = [];
  for (let t = 0; t <= durationMs; t += step) ticks.push(t);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!playing || !el) return;
    const x = msToPx(currentMs, pxPerSec);
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 24) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
    }
  }, [playing, currentMs, pxPerSec]);

  const startDrag = (event: PointerEvent<HTMLButtonElement>, cue: ProjectCue) => {
    if (event.button !== 0) return;
    const handle = (event.target as HTMLElement).dataset.handle;
    const mode: DragMode = handle === "start" ? "start" : handle === "end" ? "end" : "move";
    drag.current = { id: cue.id, mode, startX: event.clientX, original: cues, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    const orig = d.original.find((c) => c.id === d.id);
    if (!orig) return;
    const delta = pxToMs(dx, pxPerSec);
    let result;
    if (d.mode === "move") {
      result = setStart(d.original, d.id, Math.max(0, snapMs(orig.start_ms + delta)), sequential);
    } else if (d.mode === "start") {
      const next = Math.min(Math.max(0, snapMs(orig.start_ms + delta)), orig.end_ms - MIN_DURATION);
      result = resizeStart(d.original, d.id, next);
    } else {
      result = setEnd(
        d.original,
        d.id,
        Math.max(orig.start_ms + MIN_DURATION, snapMs(orig.end_ms + delta)),
        sequential,
      );
    }
    if (result.ok) onApply(result.cues);
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) justDragged.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onBlockKey = (event: KeyboardEvent<HTMLButtonElement>, cue: ProjectCue) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const amount = (event.shiftKey ? 1000 : 100) * (event.key === "ArrowLeft" ? -1 : 1);
    const result = event.altKey
      ? setEnd(cues, cue.id, Math.max(cue.start_ms + MIN_DURATION, cue.end_ms + amount), sequential)
      : setStart(cues, cue.id, Math.max(0, cue.start_ms + amount), sequential);
    if (result.ok) onApply(result.cues);
  };

  const seekFromClick = (clientX: number) => {
    const rect = innerRef.current?.getBoundingClientRect();
    if (!rect) return;
    onSeek(Math.min(durationMs, Math.max(0, pxToMs(clientX - rect.left, pxPerSec))));
  };

  return (
    <section className="panel" aria-labelledby="timeline-heading">
      <div className="panel__head">
        <h2 id="timeline-heading">Timeline</h2>
        <div className="button-row">
          <button
            type="button"
            className="button button--secondary"
            aria-label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => {
              setZoom((z) => Math.max(1, z / 1.5));
            }}
          >
            −
          </button>
          <button
            type="button"
            className="button button--secondary"
            aria-label="Zoom in"
            disabled={zoom >= 40}
            onClick={() => {
              setZoom((z) => Math.min(40, z * 1.5));
            }}
          >
            +
          </button>
        </div>
      </div>
      <div className="timeline__scroll" ref={scrollRef}>
        <div
          ref={innerRef}
          className="timeline__inner"
          style={{ width: totalPx, height: RULER_HEIGHT + laneCount * LANE_HEIGHT + 6 }}
          onClick={(e) => {
            seekFromClick(e.clientX);
          }}
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="timeline__tick"
              style={{ left: msToPx(t, pxPerSec) }}
              aria-hidden="true"
            >
              {formatTimecode(t).slice(3, 8)}
            </span>
          ))}
          {cues.map((cue, i) => {
            if (cue.end_ms <= cue.start_ms) return null;
            return (
              <button
                key={cue.id}
                type="button"
                className="timeline__block"
                data-selected={cue.id === selectedId}
                title={`${String(i + 1)}. ${cue.text}`}
                aria-label={`Subtitle ${String(i + 1)}: ${cue.text.slice(0, 40)}. ${formatTimecode(cue.start_ms)} to ${formatTimecode(cue.end_ms)}`}
                style={{
                  left: msToPx(cue.start_ms, pxPerSec),
                  width: Math.max(8, msToPx(cue.end_ms - cue.start_ms, pxPerSec)),
                  top: RULER_HEIGHT + lanes[i] * LANE_HEIGHT,
                  height: LANE_HEIGHT - 4,
                }}
                onPointerDown={(e) => {
                  startDrag(e, cue);
                }}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => {
                  onBlockKey(e, cue);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (justDragged.current) {
                    justDragged.current = false;
                    return;
                  }
                  onSelect(cue.id);
                }}
              >
                <span className="timeline__handle timeline__handle--start" data-handle="start" aria-hidden="true" />
                <span className="timeline__label">{i + 1} {cue.text}</span>
                <span className="timeline__handle timeline__handle--end" data-handle="end" aria-hidden="true" />
              </button>
            );
          })}
          <div
            className="timeline__playhead"
            style={{ left: msToPx(Math.min(currentMs, durationMs), pxPerSec) }}
            aria-hidden="true"
          />
        </div>
      </div>
      <p className="muted timeline__help">
        Tap the strip to move the playhead, or a block to edit it. Arrow keys nudge a selected
        block by 0.1 s (Shift: 1 s, Alt: the end). Exact times are in the subtitle editor.
      </p>
    </section>
  );
}
