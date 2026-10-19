import "@testing-library/jest-dom/vitest";

// jsdom has no canvas: drawing is tested in a real browser; here it is quietly skipped.
if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: () => null, configurable: true });
}
