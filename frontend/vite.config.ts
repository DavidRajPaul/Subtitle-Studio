/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { licenses } from "./scripts/licenses-plugin";

// ONNX Runtime references other WebAssembly builds that this app never loads (it serves
// ort/ort-wasm-simd-threaded.wasm itself); leave them out of the published site.
const dropUnusedOrtWasm = (): Plugin => ({
  name: "drop-unused-ort-wasm",
  generateBundle(_options, bundle) {
    for (const name of Object.keys(bundle)) {
      if (/ort-wasm-simd-threaded\.(asyncify|jsep|jspi)[^/]*\.wasm$/.test(name)) Reflect.deleteProperty(bundle, name);
    }
  },
});

// The backend is local-only (127.0.0.1). The dev server proxies /api so the
// browser never makes cross-origin requests during development.
const BACKEND_URL = process.env.SUBTITLE_STUDIO_BACKEND ?? "http://127.0.0.1:8000";

// Local default is loopback only. The hosted-test Codespace sets SUBTITLE_STUDIO_FRONTEND_HOST so
// GitHub's port forwarder can reach the UI; the backend itself always stays on 127.0.0.1.
const FRONTEND_HOST = process.env.SUBTITLE_STUDIO_FRONTEND_HOST ?? "127.0.0.1";

// GitHub Pages serves the app from /<repository>/; the deploy workflow sets this.
const BASE = process.env.SUBTITLE_STUDIO_BASE ?? "/";

// Code that reaches the site without passing through the bundler as separate modules: the speech
// runtime under /ort/ (copied from onnxruntime-web by scripts/copy-ort.mjs) and libraries that
// transformers.js and onnxruntime-web compile into their own files.
const thirdParty = licenses([
  "onnxruntime-web",
  "@huggingface/jinja",
  "@huggingface/tokenizers",
  "flatbuffers",
  "guid-typescript",
  "long",
  "platform",
  "protobufjs",
  "@protobufjs/aspromise",
  "@protobufjs/base64",
  "@protobufjs/codegen",
  "@protobufjs/eventemitter",
  "@protobufjs/fetch",
  "@protobufjs/float",
  "@protobufjs/path",
  "@protobufjs/pool",
  "@protobufjs/utf8",
]);

export default defineConfig({
  base: BASE,
  plugins: [react(), dropUnusedOrtWasm(), thirdParty.collect(), thirdParty.write()],
  worker: { format: "es", plugins: () => [dropUnusedOrtWasm(), thirdParty.collect()] },
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
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
