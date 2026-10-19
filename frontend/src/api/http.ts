export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  detail?: { code?: string; message?: string } | unknown[];
}

/** JSON request to the local backend (127.0.0.1) with actionable errors. */
export async function send<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(
      "backend_unreachable",
      "The local backend is not running. Start it, then try again.",
    );
  }
  if (!response.ok) {
    let body: ErrorBody = {};
    try {
      body = (await response.json()) as ErrorBody;
    } catch {
      // use the generic message below
    }
    const detail = body.detail;
    if (detail && !Array.isArray(detail) && detail.message) {
      throw new ApiError(detail.code ?? "request_failed", detail.message);
    }
    throw new ApiError("request_failed", "That request was not accepted. Check your settings.");
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}

export function messageOf(error: unknown, fallback = "Something went wrong. Try again."): string {
  return error instanceof ApiError ? error.message : fallback;
}
