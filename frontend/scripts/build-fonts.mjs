// Builds the font library from @fontsource packages (Google Fonts, OFL-1.1 / Apache-2.0):
// copies two weights per font for the Latin, Tamil and Devanagari subsets into public/fonts/,
// with each font's licence, and writes src/engine/fonts/catalog.json (committed, deterministic).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONTS = [
  // Tamil first: the main user writes Tamil.
  "noto-sans-tamil", "mukta-malar", "catamaran", "hind-madurai", "baloo-thambi-2", "anek-tamil",
  "arima", "meera-inimai", "pavanam", "kavivanar", "noto-serif-tamil", "tiro-tamil",
  "noto-sans-devanagari", "mukta", "hind",
  "inter", "poppins", "montserrat", "roboto", "open-sans", "lato", "nunito", "raleway", "noto-sans",
  "bricolage-grotesque", "oswald", "bebas-neue", "anton", "archivo-black",
  "bangers", "luckiest-guy", "lilita-one", "titan-one", "fredoka", "baloo-2", "righteous", "bungee",
  "black-ops-one", "monoton", "permanent-marker", "lobster", "pacifico",
  "kaushan-script", "dancing-script", "great-vibes", "satisfy", "caveat", "sacramento",
  "playfair-display", "merriweather", "lora", "abril-fatface", "dm-serif-display", "space-mono",
];
const SUBSETS = ["latin", "latin-ext", "tamil", "devanagari"];
const GROUP = { "sans-serif": "Sans", display: "Display", handwriting: "Script", serif: "Serif", monospace: "Mono" };

function pickWeights(available) {
  const want = [400, 700].filter((w) => available.includes(w));
  if (want.length > 0) return want;
  const nearest = [...available].sort((a, b) => Math.abs(a - 400) - Math.abs(b - 400))[0];
  return [nearest];
}

const catalog = [];
for (const id of FONTS) {
  const pkg = join(root, "node_modules", "@fontsource", id);
  const meta = JSON.parse(readFileSync(join(pkg, "metadata.json"), "utf8"));
  const weights = pickWeights(meta.weights);
  const subsets = SUBSETS.filter((s) => meta.subsets.includes(s));
  const outDir = join(root, "public", "fonts", id);
  mkdirSync(outDir, { recursive: true });
  const faces = [];
  for (const weight of weights) {
    const css = readFileSync(join(pkg, `${weight}.css`), "utf8");
    for (const block of css.split("@font-face").slice(1)) {
      const file = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
      const subset = SUBSETS.find((s) => file && file.startsWith(`${id}-${s}-${weight}-`));
      if (!file || !subset || !subsets.includes(subset)) continue;
      const range = block.match(/unicode-range:\s*([^;]+);/)?.[1].trim() ?? null;
      const target = `${subset}-${weight}.woff2`;
      copyFileSync(join(pkg, "files", file), join(outDir, target));
      faces.push({ weight, subset, file: `${id}/${target}`, unicodeRange: range });
    }
  }
  if (existsSync(join(pkg, "LICENSE"))) copyFileSync(join(pkg, "LICENSE"), join(outDir, "LICENSE.txt"));
  catalog.push({
    id,
    family: meta.family,
    group: subsets.includes("tamil") ? "Tamil" : (GROUP[meta.category] ?? "Sans"),
    scripts: [...new Set(subsets.map((s) => (s.startsWith("latin") ? "latin" : s)))],
    weights,
    license: meta.license?.type ?? "OFL-1.1",
    faces,
  });
}
writeFileSync(join(root, "src", "engine", "fonts", "catalog.json"), JSON.stringify(catalog, null, 1) + "\n");
const files = catalog.reduce((n, f) => n + f.faces.length, 0);
console.log(`fonts: ${String(catalog.length)} families, ${String(files)} files -> public/fonts/`);
