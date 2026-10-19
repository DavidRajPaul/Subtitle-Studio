/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The backend is local-only (127.0.0.1). The dev server proxies /api so the
// browser never makes cross-origin requests during development.
const BACKEND_URL = process.env.SUBTITLE_STUDIO_BACKEND ?? "http://127.0.0.1:8000";

// Local default is loopback only. The hosted-test Codespace sets SUBTITLE_STUDIO_FRONTEND_HOST so
// GitHub's port forwarder can reach the UI; the backend itself always stays on 127.0.0.1.
const FRONTEND_HOST = process.env.SUBTITLE_STUDIO_FRONTEND_HOST ?? "127.0.0.1";

export default defineConfig({
  plugins: [react()],
  server: {
    host: FRONTEND_HOST,
    port: 5173,
    // Vite rejects unknown Host headers; allow only GitHub Codespaces' forwarded addresses.
    allowedHosts: [".app.github.dev"],
    // Nobody edits code in the hosted test, and a hot-reload socket through GitHub's forwarder
    // can cause reload loops, so it is switched off there.
    hmr: process.env.SUBTITLE_STUDIO_FRONTEND_HOST ? false : undefined,
    proxy: {
      "/api": { target: BACKEND_URL, changeOrigin: false },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
