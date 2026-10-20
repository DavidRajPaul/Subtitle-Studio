import { useCallback, useEffect, useState } from "react";

interface DeviceInfo {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
  canPersist: boolean;
  h264: boolean;
  hevc: boolean;
  storage: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${String(Math.round(bytes / 1024 ** 2))} MB`;
  return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

async function readDevice(): Promise<DeviceInfo> {
  const storageApi = typeof navigator !== "undefined" ? navigator.storage : undefined;
  let usage: number | null = null;
  let quota: number | null = null;
  let persisted: boolean | null = null;
  try {
    const estimate = await storageApi?.estimate();
    usage = estimate?.usage ?? null;
    quota = estimate?.quota ?? null;
  } catch {
    // Not offered by this browser.
  }
  try {
    persisted = (await storageApi?.persisted()) ?? null;
  } catch {
    persisted = null;
  }
  const video = document.createElement("video");
  const can = (type: string) => {
    try {
      return video.canPlayType(type) !== "";
    } catch {
      return false;
    }
  };
  return {
    usage,
    quota,
    persisted,
    canPersist: typeof storageApi?.persist === "function",
    h264: can('video/mp4; codecs="avc1.42E01E"'),
    hevc: can('video/mp4; codecs="hvc1.1.6.L93.B0"'),
    storage: typeof indexedDB !== "undefined",
  };
}

/** Settings: what this browser offers and how safely projects are kept. */
export function DevicePanel() {
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void readDevice().then(setInfo);
  }, []);
  useEffect(refresh, [refresh]);

  const protect = () => {
    setNote(null);
    navigator.storage
      .persist()
      .then((granted) => {
        setNote(
          granted
            ? "Done. This browser will keep your projects even when space runs low."
            : "This browser did not agree. Adding Subtitle Studio to your Home Screen usually helps.",
        );
        refresh();
      })
      .catch(() => {
        setNote("This browser does not offer that option.");
      });
  };

  if (!info) {
    return (
      <section className="panel" aria-labelledby="device-heading" aria-busy="true">
        <h2 id="device-heading">This device</h2>
        <p role="status">Checking this browser…</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="device-heading">
      <h2 id="device-heading">This device</h2>
      <p>
        Subtitle Studio runs entirely in this browser. Videos and text are not uploaded; projects
        and their videos are saved in this browser on this device.
      </p>
      <ul className="tool-list">
        <li className="tool-list__item">
          <span className="tool-list__name">Saving projects</span>
          {info.storage ? (
            <span className="status--ok">Available</span>
          ) : (
            <span className="status--warn">
              Not available here. Turn off private browsing or use another browser.
            </span>
          )}
        </li>
        <li className="tool-list__item">
          <span className="tool-list__name">Space used</span>
          <span>
            {info.usage === null
              ? "Unknown"
              : `${formatBytes(info.usage)}${info.quota ? ` of about ${formatBytes(info.quota)}` : ""}`}
          </span>
        </li>
        <li className="tool-list__item">
          <span className="tool-list__name">Protected from automatic clean-up</span>
          <span className={info.persisted ? "status--ok" : "status--warn"}>
            {info.persisted === null ? "Unknown" : info.persisted ? "Yes" : "Not yet"}
          </span>
        </li>
        <li className="tool-list__item">
          <span className="tool-list__name">Plays H.264 video</span>
          <span className={info.h264 ? "status--ok" : "status--warn"}>{info.h264 ? "Yes" : "No"}</span>
        </li>
        <li className="tool-list__item">
          <span className="tool-list__name">Plays HEVC video (newer iPhones)</span>
          <span className={info.hevc ? "status--ok" : "muted"}>{info.hevc ? "Yes" : "No"}</span>
        </li>
      </ul>
      {!info.persisted && info.canPersist && (
        <button type="button" className="button" onClick={protect}>
          Keep my projects safe
        </button>
      )}
      {note && <p role="status">{note}</p>}
      <p className="muted">
        On iPhone and iPad, add Subtitle Studio to your Home Screen (Share → Add to Home Screen).
        Safari can otherwise delete saved projects from websites you have not opened for about a
        week. On Android, use the browser menu → Add to Home screen or Install app.
      </p>
    </section>
  );
}
