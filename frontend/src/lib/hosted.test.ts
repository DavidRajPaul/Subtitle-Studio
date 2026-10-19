import { describe, expect, it } from "vitest";
import { isHostedTest } from "./hosted";

describe("isHostedTest", () => {
  it("is true for GitHub Codespaces forwarded addresses", () => {
    expect(isHostedTest("fuzzy-space-12345-5173.app.github.dev")).toBe(true);
    expect(isHostedTest("Fuzzy-Space-12345-5173.APP.GITHUB.DEV")).toBe(true);
  });
  it("is false on the owner's own computer and look-alike hosts", () => {
    expect(isHostedTest("127.0.0.1")).toBe(false);
    expect(isHostedTest("localhost")).toBe(false);
    expect(isHostedTest("app.github.dev.evil.example")).toBe(false);
    expect(isHostedTest("evilapp.github.dev")).toBe(false);
  });
});
