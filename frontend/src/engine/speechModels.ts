/**
 * Speech models and languages for in-browser recognition.
 *
 * Models are OpenAI Whisper (MIT licence) converted for transformers.js (Xenova/whisper-* on
 * Hugging Face, 8-bit weights). They are downloaded once into this browser's cache when the
 * user presses Download, and then used without the internet.
 */

export interface SpeechModelInfo {
  name: string;
  label: string;
  repo: string;
  approx_size_mb: number;
  description: string;
}

export const SPEECH_MODELS: readonly SpeechModelInfo[] = [
  {
    name: "tiny",
    label: "Tiny",
    repo: "Xenova/whisper-tiny",
    approx_size_mb: 41,
    description: "Fastest and smallest. Good for a quick try with clear speech.",
  },
  {
    name: "base",
    label: "Base",
    repo: "Xenova/whisper-base",
    approx_size_mb: 77,
    description: "Fast with fair accuracy for clear English speech. Fine on a phone.",
  },
  {
    name: "small",
    label: "Small",
    repo: "Xenova/whisper-small",
    approx_size_mb: 250,
    description:
      "Slower but clearly more accurate; recommended for Tamil and other non-English speech. Best on a tablet or laptop.",
  },
];

export const DEFAULT_SPEECH_MODEL = "base";

/** Files transformers.js needs for 8-bit Whisper; all must be cached to count as installed. */
export const MODEL_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
] as const;

export const LANGUAGES: readonly { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "ta", name: "Tamil" },
  { code: "hi", name: "Hindi" },
  { code: "te", name: "Telugu" },
  { code: "ml", name: "Malayalam" },
  { code: "kn", name: "Kannada" },
  { code: "bn", name: "Bengali" },
  { code: "mr", name: "Marathi" },
  { code: "gu", name: "Gujarati" },
  { code: "pa", name: "Punjabi" },
  { code: "ur", name: "Urdu" },
  { code: "ar", name: "Arabic" },
  { code: "zh", name: "Chinese" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "es", name: "Spanish" },
  { code: "tr", name: "Turkish" },
  { code: "vi", name: "Vietnamese" },
];

export const modelByName = (name: string) => SPEECH_MODELS.find((m) => m.name === name);

export const HF_HOST = "https://huggingface.co/";
export const MODEL_CACHE = "transformers-cache";

export const fileUrl = (repo: string, file: string, host = HF_HOST) =>
  `${host}${repo}/resolve/main/${file}`;
