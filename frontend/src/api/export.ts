/** Export entry points. The video engine (mediabunny) is loaded only when someone exports. */
import type { ProjectCue, SubtitleStyle } from "./projects";
import type { ExportProgress, ExportResult } from "../engine/export/videoExport";

export type { ExportProgress, ExportResult };

export interface ExportEngine {
  supported: () => boolean;
  exportVideo: (options: {
    video: Blob;
    cues: ProjectCue[];
    style: SubtitleStyle;
    onProgress: (p: ExportProgress) => void;
    signal: AbortSignal;
  }) => Promise<ExportResult>;
}

const realEngine: ExportEngine = {
  supported: () => typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined",
  exportVideo: async (options) => {
    const { exportBurnedIn } = await import("../engine/export/videoExport");
    return exportBurnedIn(options);
  },
};

let engine: ExportEngine = realEngine;

export function exportEngine(): ExportEngine {
  return engine;
}

export function setExportEngineForTests(next: ExportEngine | null): void {
  engine = next ?? realEngine;
}
