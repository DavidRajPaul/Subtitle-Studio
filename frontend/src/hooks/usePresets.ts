import { useEffect, useState } from "react";
import { listPresets, subscribePresets, type Preset } from "../api/presets";

/** The saved presets, kept up to date everywhere they are shown. null while loading. */
export function usePresets(): { presets: Preset[] | null; error: boolean } {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    const off = subscribePresets((p) => {
      if (live) setPresets(p);
    });
    listPresets().then(
      (p) => {
        if (live) setPresets(p);
      },
      () => {
        if (live) setError(true);
      },
    );
    return () => {
      live = false;
      off();
    };
  }, []);
  return { presets, error };
}
