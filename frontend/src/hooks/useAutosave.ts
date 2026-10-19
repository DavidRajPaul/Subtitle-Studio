import { useCallback, useEffect, useRef, useState } from "react";
import { messageOf } from "../api/http";
import { saveProject, type Project } from "../api/projects";
import type { SaveState } from "../components/SaveStatus";

const SAVE_DELAY_MS = 700;

/** Autosave: debounced, always visible, and flushable before leaving. */
export function useAutosave(initial: Project) {
  const latest = useRef<Project>(initial);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveState>({ kind: "saved" });

  const saveNow = useCallback(async (): Promise<boolean> => {
    const v = version.current;
    if (v === savedVersion.current) {
      setStatus({ kind: "saved" });
      return true;
    }
    setStatus({ kind: "saving" });
    try {
      await saveProject(latest.current);
      savedVersion.current = Math.max(savedVersion.current, v);
      if (version.current === v) setStatus({ kind: "saved" });
      return true;
    } catch (error) {
      setStatus({
        kind: "error",
        message: messageOf(error, "The project could not be saved."),
      });
      return false;
    }
  }, []);

  const markChanged = useCallback(
    (project: Project) => {
      latest.current = project;
      version.current += 1;
      setStatus({ kind: "saving" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void saveNow();
      }, SAVE_DELAY_MS);
    },
    [saveNow],
  );

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    return saveNow();
  }, [saveNow]);

  // Leaving the screen with a save still waiting: send it now (best effort).
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void saveNow();
      }
    },
    [saveNow],
  );

  return { latest, status, markChanged, flush, retry: saveNow };
}

