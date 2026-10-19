import { useEffect, useState } from "react";
import { messageOf } from "../api/http";
import { getJob, isFinished, type Job } from "../api/speech";

export const POLL_MS = 500;

export type JobView<R> =
  | { kind: "idle" }
  | { kind: "active"; job: Job<R> | null }
  | { kind: "done"; job: Job<R> }
  | { kind: "lost"; message: string };

/** Follows a backend job until it finishes. Pass null to stop following. */
export function useJob<R>(jobId: string | null): JobView<R> {
  const [view, setView] = useState<JobView<R>>({ kind: "idle" });
  useEffect(() => {
    if (!jobId) {
      setView({ kind: "idle" });
      return;
    }
    setView({ kind: "active", job: null });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const poll = () => {
      getJob<R>(jobId, controller.signal)
        .then((job) => {
          failures = 0;
          if (isFinished(job.status)) {
            setView({ kind: "done", job });
            return;
          }
          setView({ kind: "active", job });
          timer = setTimeout(poll, POLL_MS);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          failures += 1;
          // A brief hiccup is retried; a job the backend no longer knows is reported.
          if (failures >= 3) setView({ kind: "lost", message: messageOf(error) });
          else timer = setTimeout(poll, POLL_MS * 2);
        });
    };
    poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);
  return view;
}
