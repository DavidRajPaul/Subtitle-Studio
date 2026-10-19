/** One-tap looks: complete styles built from the defaults. Picking one replaces the style. */
import type { SubtitleStyle } from "../api/projects";
import { DEFAULT_STYLE } from "../lib/style";

export interface Look {
  id: string;
  name: string;
  style: SubtitleStyle;
}

type Over = Omit<Partial<SubtitleStyle>, "background" | "animation"> & {
  background?: Partial<SubtitleStyle["background"]>;
  animation?: Partial<SubtitleStyle["animation"]>;
};

const make = (id: string, name: string, o: Over): Look => ({
  id,
  name,
  style: {
    ...DEFAULT_STYLE,
    font_family: "noto-sans-tamil",
    bold: true,
    ...o,
    background: { ...DEFAULT_STYLE.background, ...o.background },
    animation: { ...DEFAULT_STYLE.animation, ...o.animation },
  },
});

export const LOOKS: Look[] = [
  make("classic", "Classic", { outline_px: 3, shadow_blur_px: 6 }),
  make("bold-yellow", "Bold Yellow", { font_family: "mukta-malar", font_size: 56, text_color: "#FFD60A", outline_px: 4, animation: { in: "scale", in_ms: 300 } }),
  make("boxed", "Boxed", { font_family: "hind-madurai", outline_px: 0, shadow: false, background: { enabled: true, color: "#000000", opacity: 0.7, padding_px: 18, radius_px: 12 }, animation: { in: "fade", out: "fade" } }),
  make("karaoke", "Karaoke", { font_family: "baloo-thambi-2", font_size: 54, outline_px: 4, animation: { caption: "highlight", highlight_color: "#FFD60A" } }),
  make("pop", "Pop", { font_family: "baloo-thambi-2", font_size: 62, text_case: "upper", outline_px: 5, shadow_blur_px: 0, shadow_offset_px: 6, animation: { in: "scale", caption: "pop", highlight_color: "#7CFF6B", in_ms: 250 } }),
  make("neon", "Neon", { font_family: "righteous", bold: false, font_size: 54, text_color: "#FFFFFF", outline_px: 0, shadow_color: "#00E5FF", shadow_opacity: 1, shadow_blur_px: 22, shadow_offset_px: 0, animation: { in: "fade", loop: "pulse" } }),
  make("word-by-word", "Word by word", { font_family: "anek-tamil", font_size: 58, position: "middle", outline_px: 3, animation: { caption: "word" } }),
  make("cinema", "Cinema", { font_family: "noto-serif-tamil", bold: false, font_size: 44, outline_px: 0, text_opacity: 0.95, shadow_blur_px: 10, shadow_offset_px: 3, animation: { in: "fade", out: "fade", in_ms: 600, out_ms: 500 } }),
  make("minimal", "Minimal", { font_family: "hind-madurai", bold: false, font_size: 40, outline_px: 0, shadow_blur_px: 8, shadow_offset_px: 2 }),
  make("comic", "Comic", { font_family: "bangers", bold: false, font_size: 64, text_case: "upper", letter_spacing_px: 2, outline_px: 6, shadow_blur_px: 0, shadow_offset_px: 5, animation: { in: "spin", loop: "bounce", in_ms: 350 } }),
  make("highlighter", "Highlighter", { font_family: "catamaran", text_color: "#111111", outline_px: 0, shadow: false, background: { enabled: true, color: "#FFD60A", opacity: 1, padding_px: 14, radius_px: 6 }, animation: { in: "reveal", in_ms: 450 } }),
  make("lower-third", "Lower third", { font_family: "poppins", font_size: 42, align: "left", outline_px: 0, shadow: false, background: { enabled: true, color: "#1E2A78", opacity: 0.9, padding_px: 16, radius_px: 4 }, animation: { in: "slide", out: "fade" } }),
  make("elegant", "Elegant", { font_family: "kavivanar", bold: false, font_size: 52, outline_px: 0, shadow_blur_px: 12, animation: { in: "gradient", in_ms: 700, out: "fade" } }),
  make("typewriter", "Typewriter", { font_family: "space-mono", bold: false, font_size: 40, outline_px: 0, background: { enabled: true, color: "#000000", opacity: 0.55, padding_px: 12, radius_px: 4 }, animation: { in: "reveal", in_ms: 900 } }),
  make("pink-glow", "Pink glow", { font_family: "fredoka", font_size: 56, text_color: "#FFFFFF", outline_px: 2, outline_color: "#FF4FA3", shadow_color: "#FF4FA3", shadow_opacity: 1, shadow_blur_px: 18, shadow_offset_px: 0, animation: { in: "scale", loop: "float" } }),
];

export const DEFAULT_LOOK = LOOKS[0];

/** Quick colour pairs (text + outline), like the "T" chips in many editors. */
export const COLOR_CHIPS: { id: string; text: string; outline: string; outlinePx: number }[] = [
  { id: "white-black", text: "#FFFFFF", outline: "#000000", outlinePx: 3 },
  { id: "black-white", text: "#000000", outline: "#FFFFFF", outlinePx: 3 },
  { id: "white-red", text: "#FFFFFF", outline: "#E53935", outlinePx: 4 },
  { id: "yellow-black", text: "#FFD60A", outline: "#000000", outlinePx: 4 },
  { id: "white-blue", text: "#FFFFFF", outline: "#1E88E5", outlinePx: 4 },
  { id: "white-green", text: "#FFFFFF", outline: "#00A86B", outlinePx: 4 },
  { id: "white-pink", text: "#FFFFFF", outline: "#FF4FA3", outlinePx: 4 },
  { id: "red-white", text: "#E53935", outline: "#FFFFFF", outlinePx: 3 },
];

export const SWATCHES = [
  "#FFFFFF", "#000000", "#444444", "#888888", "#BBBBBB", "#E53935", "#FF4FA3", "#C850F0",
  "#7C4DFF", "#1E88E5", "#00BCD4", "#00A86B", "#7CFF6B", "#FFD60A", "#FF9800", "#8D6E63",
];
