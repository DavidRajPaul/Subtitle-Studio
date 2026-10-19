// Copies the ONNX Runtime WebAssembly files that speech recognition needs into public/ort/,
// so the published site serves them itself instead of loading them from a third-party CDN.
import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// pnpm links packages; resolve from transformers.js's real folder to find its onnxruntime-web.
const transformers = realpathSync(join(here, "..", "node_modules", "@huggingface", "transformers", "package.json"));
// .../node_modules/@huggingface/transformers/package.json -> .../node_modules/onnxruntime-web/dist
const ortDist = join(dirname(transformers), "..", "..", "onnxruntime-web", "dist");
const out = join(here, "..", "public", "ort");
mkdirSync(out, { recursive: true });
const wanted = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];
for (const name of wanted) {
  if (!existsSync(join(ortDist, name))) {
    console.error(`missing ${name} in ${ortDist}: ${readdirSync(ortDist).join(", ")}`);
    process.exit(1);
  }
  copyFileSync(join(ortDist, name), join(out, name));
}
console.log(`copied ${wanted.join(", ")} -> public/ort/`);
