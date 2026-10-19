import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeScreen } from "./HomeScreen";

vi.mock("../api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/projects")>()),
  listProjects: vi.fn().mockResolvedValue([]),
}));

const hosted = vi.hoisted(() => ({ value: true }));
vi.mock("../lib/hosted", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/hosted")>()),
  isHostedTest: () => hosted.value,
}));

describe("Home in a hosted test", () => {
  it("does not claim files stay on the device", () => {
    hosted.value = true;
    render(<HomeScreen onStart={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByRole("note")).toHaveTextContent("temporary cloud computer");
    expect(screen.queryByText(/stay on this device/)).not.toBeInTheDocument();
  });

  it("keeps the local-only wording on the owner's own computer", () => {
    hosted.value = false;
    render(<HomeScreen onStart={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText(/stay on this device/)).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
