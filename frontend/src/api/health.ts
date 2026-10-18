export interface ToolHealth {
  available: boolean;
  version: string | null;
  detail: string | null;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  tools: Record<"ffmpeg" | "ffprobe", ToolHealth>;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch("/api/health", { signal });
  if (!response.ok) {
    throw new Error(`Backend responded with HTTP ${String(response.status)}.`);
  }
  return (await response.json()) as HealthResponse;
}
