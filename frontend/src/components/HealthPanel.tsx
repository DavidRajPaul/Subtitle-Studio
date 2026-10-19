import { useEffect, useState } from "react";
import { fetchHealth, type HealthResponse } from "../api/health";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; health: HealthResponse };

const TOOL_LABELS: Record<"ffmpeg" | "ffprobe", string> = {
  ffmpeg: "FFmpeg (video rendering)",
  ffprobe: "FFprobe (media inspection)",
};

export function HealthPanel() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = () => {
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    fetchHealth(controller.signal)
      .then((health) => {
        setState({ kind: "ready", health });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unknown error.";
        setState({ kind: "error", message });
      });
    return () => {
      controller.abort();
    };
  }, [attempt]);

  if (state.kind === "loading") {
    return (
      <section aria-labelledby="diagnostics-heading" className="panel" aria-busy="true">
        <h2 id="diagnostics-heading">Diagnostics</h2>
        <p role="status">Checking the local backend…</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section aria-labelledby="diagnostics-heading" className="panel panel--error">
        <h2 id="diagnostics-heading">Diagnostics</h2>
        <p role="alert">Could not reach the local backend. {state.message}</p>
        <p>
          Start it with <code>pnpm backend</code> from the project root, then retry.
        </p>
        <button type="button" className="button" onClick={retry}>
          Retry check
        </button>
      </section>
    );
  }

  const { health } = state;
  const allOk = health.status === "ok";

  return (
    <section aria-labelledby="diagnostics-heading" className="panel">
      <h2 id="diagnostics-heading">Diagnostics</h2>
      <p>
        Backend status:{" "}
        <strong className={allOk ? "status--ok" : "status--warn"}>
          {allOk ? "Ready" : "Needs attention"}
        </strong>{" "}
        <span className="muted">v{health.version}</span>
      </p>
      <ul className="tool-list">
        {(Object.keys(TOOL_LABELS) as Array<keyof typeof TOOL_LABELS>).map((key) => {
          const tool = health.tools[key];
          return (
            <li key={key} className="tool-list__item">
              <span className="tool-list__name">{TOOL_LABELS[key]}</span>
              {tool.available ? (
                <span className="status--ok">Available · {tool.version}</span>
              ) : (
                <span className="status--warn">
                  Missing. {tool.detail ?? "Install it and retry."}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="button" onClick={retry}>
        Re-check
      </button>
    </section>
  );
}
