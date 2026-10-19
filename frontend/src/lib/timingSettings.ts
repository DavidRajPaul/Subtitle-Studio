import type { TimingSettings } from "../api/subtitles";

/** What the user types. Durations are in seconds here and converted to integer ms for the API. */
export interface SettingsDraft {
  cps: string;
  min: string;
  max: string;
  gap: string;
}

export const DEFAULT_DRAFT: SettingsDraft = { cps: "17", min: "1", max: "7", gap: "0.1" };

export type DraftErrors = Partial<Record<keyof SettingsDraft, string>>;

export type SettingsResult =
  | { ok: true; settings: TimingSettings }
  | { ok: false; errors: DraftErrors };

const NUMBER = /^\d+(?:\.\d+)?$/;

function num(text: string): number | null {
  const t = text.trim();
  return NUMBER.test(t) ? Number(t) : null;
}

export function parseSettings(draft: SettingsDraft): SettingsResult {
  const errors: DraftErrors = {};
  const cps = num(draft.cps);
  const min = num(draft.min);
  const max = num(draft.max);
  const gap = num(draft.gap);

  if (cps === null || cps <= 0 || cps > 60) {
    errors.cps = "Enter a number above 0 and up to 60, for example 17.";
  }
  if (min === null || min < 0.1 || min > 60) {
    errors.min = "Enter seconds from 0.1 to 60, for example 1.";
  }
  if (max === null || max < 0.1 || max > 600) {
    errors.max = "Enter seconds from 0.1 to 600, for example 7.";
  }
  if (gap === null || gap > 5) {
    errors.gap = "Enter seconds from 0 to 5, for example 0.1.";
  }
  if (!errors.min && !errors.max && min !== null && max !== null && min > max) {
    errors.min = "The minimum cannot be longer than the maximum.";
  }
  if (Object.keys(errors).length > 0 || cps === null || min === null || max === null || gap === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    settings: {
      chars_per_second: cps,
      min_duration_ms: Math.round(min * 1000),
      max_duration_ms: Math.round(max * 1000),
      gap_ms: Math.round(gap * 1000),
    },
  };
}
