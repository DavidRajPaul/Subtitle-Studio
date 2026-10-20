/**
 * Collects the licence of every npm package whose code ends up in the published site (main
 * bundle and the speech worker), and writes them, with their full texts, to
 * THIRD_PARTY_LICENSES.txt next to the app. Fonts carry their own licence files in /fonts/.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

interface Pkg {
  name: string;
  version: string;
  license: string;
  url: string;
  text: string;
}

const found = new Map<string, string>(); // package name → its folder
const PKG = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;

function remember(id: string) {
  const clean = id.replace(/^\0/, "").split("?")[0];
  // The innermost node_modules entry is the package that owns this file.
  const parts = clean.split(/[\\/]node_modules[\\/]/);
  if (parts.length < 2) return;
  const m = PKG.exec(clean.slice(0, clean.lastIndexOf("node_modules")) + "node_modules/" + parts[parts.length - 1]);
  if (!m) return;
  const dir = m[1];
  const pj = join(dir, "package.json");
  if (!existsSync(pj)) return;
  const name = (JSON.parse(readFileSync(pj, "utf8")) as { name?: string }).name;
  if (name && !found.has(name)) found.set(name, dir);
}

// Copyright holders for packages that publish no licence file (taken from their repositories).
const HOLDERS: Record<string, string> = {
  "onnxruntime-web": "Microsoft Corporation",
  "onnxruntime-common": "Microsoft Corporation",
};

const TEMPLATES: Record<string, (holder: string) => string> = {
  MIT: (h) =>
    `MIT License\n\nCopyright (c) ${h}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,
  ISC: (h) =>
    `ISC License\n\nCopyright (c) ${h}\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,
};

function describe(dir: string): Pkg {
  const pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    name: string;
    version: string;
    license?: string;
    homepage?: string;
    repository?: string | { url?: string };
    author?: string | { name?: string };
  };
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)/i.test(f));
  let text = files.map((f) => readFileSync(join(dir, f), "utf8").trim()).join("\n\n");
  const template = pj.license ? TEMPLATES[pj.license] : undefined;
  if (!text && template) {
    const author = typeof pj.author === "string" ? pj.author : (pj.author?.name ?? "the package authors");
    text = `[The package ships no licence file; standard ${pj.license ?? ""} text with its copyright holder.]\n\n${template(HOLDERS[pj.name] ?? author)}`;
  }
  const repo = typeof pj.repository === "string" ? pj.repository : (pj.repository?.url ?? "");
  return { name: pj.name, version: pj.version, license: pj.license ?? "UNKNOWN", url: pj.homepage ?? repo, text };
}

/** A package folder: hoisted, or inside pnpm's store (newest version wins). */
function findPackage(name: string): string | null {
  const direct = join("node_modules", name);
  if (existsSync(join(direct, "package.json"))) return direct;
  const store = join("node_modules", ".pnpm");
  const prefix = `${name.replace("/", "+")}@`;
  const hits = readdirSync(store).filter((d) => d.startsWith(prefix)).sort();
  const last = hits.at(-1);
  return last ? join(store, last, "node_modules", name) : null;
}

/** Also counts files copied into the site by scripts (the speech runtime under /ort/). */
export function licenses(extraPackages: string[] = []): { collect: () => Plugin; write: () => Plugin } {
  return {
    collect: () => ({
      name: "collect-licenses",
      apply: "build",
      moduleParsed(info) {
        remember(info.id);
      },
    }),
    write: () => ({
      name: "write-licenses",
      apply: "build",
      generateBundle() {
        for (const name of extraPackages) {
          if (found.has(name)) continue;
          const dir = findPackage(name);
          if (!dir) this.error(`Package ${name} not found for the licence list`);
          found.set(name, dir);
        }
        const pkgs = [...found.values()].map(describe).sort((a, b) => a.name.localeCompare(b.name));
        const missing = pkgs.filter((p) => p.license === "UNKNOWN");
        if (missing.length) this.error(`No licence declared by: ${missing.map((p) => p.name).join(", ")}`);
        const header = [
          "Subtitle Studio — third-party software included in this web app",
          "",
          "The app itself: licence not chosen yet (see README).",
          "Fonts: each font's licence is in fonts/<font>/LICENSE (SIL Open Font License 1.1 or Apache-2.0).",
          "Speech models (OpenAI Whisper, MIT) are downloaded by the user from Hugging Face and are not part of this site.",
          "",
          "mediabunny is used unmodified under the Mozilla Public License 2.0; its source code is",
          "available at https://github.com/Vanilagy/mediabunny and in the npm package mediabunny.",
          "",
          "Packages:",
          ...pkgs.map((p) => `  ${p.name} ${p.version} — ${p.license}${p.url ? ` — ${p.url.replace(/^git\+/, "")}` : ""}`),
          "",
        ].join("\n");
        const body = pkgs
          .map((p) => `${"=".repeat(78)}\n${p.name} ${p.version} (${p.license})\n${"=".repeat(78)}\n\n${p.text || `Licence: ${p.license} (no licence file in the package)`}\n`)
          .join("\n");
        this.emitFile({ type: "asset", fileName: "THIRD_PARTY_LICENSES.txt", source: `${header}\n${body}` });
      },
    }),
  };
}
