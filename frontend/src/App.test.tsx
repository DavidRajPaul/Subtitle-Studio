import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { HealthResponse } from "./api/health";

const okResponse: HealthResponse = {
  status: "ok",
  version: "0.1.0",
  tools: {
    ffmpeg: { available: true, version: "ffmpeg version 6.1.1", detail: null },
    ffprobe: { available: true, version: "ffprobe version 6.1.1", detail: null },
  },
};

describe("App diagnostics", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loading status before the backend responds", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => undefined));
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking the local backend");
  });

  it("reports ready when FFmpeg and FFprobe are available", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(okResponse), { status: 200 }),
    );
    render(<App />);
    expect(await screen.findByText("Ready")).toBeInTheDocument();
    expect(screen.getByText(/ffmpeg version 6.1.1/)).toBeInTheDocument();
  });

  it("explains a missing tool with an actionable detail", async () => {
    const degraded = structuredClone(okResponse);
    degraded.status = "degraded";
    degraded.tools.ffmpeg = {
      available: false,
      version: null,
      detail: "'ffmpeg' was not found on PATH. Install FFmpeg or set its path.",
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(degraded), { status: 200 }));
    render(<App />);
    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText(/Install FFmpeg or set its path/)).toBeInTheDocument();
  });

  it("shows an error with a retry action when the backend is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the local backend");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(okResponse), { status: 200 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    await waitFor(() => {
      expect(screen.getByText("Ready")).toBeInTheDocument();
    });
  });
});
