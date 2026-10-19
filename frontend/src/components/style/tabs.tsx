import { useEffect, useMemo, useRef, useState } from "react";
import type { AnimationStyle, CaptionAnimation, InAnimation, LoopAnimation, SubtitleStyle } from "../../api/projects";
import {
  addCustomFont,
  FONT_CATALOG,
  FONT_GROUPS,
  fontLabel,
  listCustomFonts,
  previewFamily,
  previewFont,
  recentFonts,
  rememberFont,
  removeCustomFont,
  SYSTEM_FONTS,
} from "../../engine/fonts/fonts";
import { COLOR_CHIPS, LOOKS, SWATCHES } from "../../engine/looks";
import { LookThumb } from "./LookThumb";
import { OptionTiles, RangeField, Segmented, SubTabs, SwatchRow, Toggle } from "./controls";

export interface TabProps {
  style: SubtitleStyle;
  onChange: (next: SubtitleStyle) => void;
}

const same = (a: SubtitleStyle, b: SubtitleStyle) => JSON.stringify(a) === JSON.stringify(b);

// ---- Looks ----------------------------------------------------------------------------------

export function LooksTab({ style, onChange }: TabProps) {
  return (
    <div className="looks" role="radiogroup" aria-label="Looks">
      {LOOKS.map((look) => (
        <button
          key={look.id}
          type="button"
          role="radio"
          aria-checked={same(look.style, style)}
          className="look"
          onClick={() => {
            onChange(look.style);
          }}
        >
          <LookThumb style={look.style} />
          <span className="look__name">{look.name}</span>
        </button>
      ))}
    </div>
  );
}

// ---- Animation ------------------------------------------------------------------------------

const IN_TILES: { value: InAnimation; label: string; icon: string }[] = [
  { value: "none", label: "None", icon: "⃠" },
  { value: "fade", label: "Fade", icon: "◐" },
  { value: "scale", label: "Scale", icon: "⤢" },
  { value: "spin", label: "Spin", icon: "↻" },
  { value: "slide", label: "Slide", icon: "⇣" },
  { value: "reveal", label: "Reveal", icon: "▤" },
  { value: "gradient", label: "Gradient", icon: "▥" },
];
const LOOP_TILES: { value: LoopAnimation; label: string; icon: string }[] = [
  { value: "none", label: "None", icon: "⃠" },
  { value: "pulse", label: "Pulse", icon: "◉" },
  { value: "bounce", label: "Bounce", icon: "⤒" },
  { value: "float", label: "Float", icon: "≈" },
  { value: "shake", label: "Shake", icon: "↔" },
  { value: "wobble", label: "Wobble", icon: "↺" },
];
const CAPTION_TILES: { value: CaptionAnimation; label: string; icon: string }[] = [
  { value: "none", label: "None", icon: "⃠" },
  { value: "highlight", label: "Highlight", icon: "A̲b" },
  { value: "pop", label: "Pop", icon: "Ab" },
  { value: "word", label: "Word by word", icon: "A…" },
];

type AnimTab = "in" | "out" | "loop" | "caption";

export function AnimationTab({ style, onChange }: TabProps) {
  const [tab, setTab] = useState<AnimTab>("in");
  const a = style.animation;
  const set = (patch: Partial<AnimationStyle>) => {
    onChange({ ...style, animation: { ...a, ...patch } });
  };
  return (
    <div className="studio-panel">
      <SubTabs
        label="Animation"
        value={tab}
        onChange={setTab}
        options={[
          { value: "in", label: "In" },
          { value: "out", label: "Out" },
          { value: "loop", label: "Loop" },
          { value: "caption", label: "Caption" },
        ]}
      />
      {tab === "in" && (
        <>
          <OptionTiles label="How each subtitle appears" value={a.in} options={IN_TILES} onChange={(v) => { set({ in: v }); }} />
          {a.in !== "none" && (
            <RangeField label="Duration" unit="s" value={a.in_ms / 1000} min={0.1} max={3} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => { set({ in_ms: Math.round(v * 1000) }); }} />
          )}
        </>
      )}
      {tab === "out" && (
        <>
          <OptionTiles label="How each subtitle leaves" value={a.out} options={IN_TILES} onChange={(v) => { set({ out: v }); }} />
          {a.out !== "none" && (
            <RangeField label="Duration" unit="s" value={a.out_ms / 1000} min={0.1} max={3} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => { set({ out_ms: Math.round(v * 1000) }); }} />
          )}
        </>
      )}
      {tab === "loop" && (
        <OptionTiles label="Movement while shown" value={a.loop} options={LOOP_TILES} onChange={(v) => { set({ loop: v }); }} />
      )}
      {tab === "caption" && (
        <>
          <OptionTiles label="Word-by-word effect" value={a.caption} options={CAPTION_TILES} onChange={(v) => { set({ caption: v }); }} />
          <p className="muted studio-note">
            Words are timed evenly across each subtitle (by their length), so the effect follows
            the speech closely but not exactly.
          </p>
          {(a.caption === "highlight" || a.caption === "pop") && (
            <SwatchRow label="Highlight colour" value={a.highlight_color} swatches={SWATCHES} onChange={(v) => { set({ highlight_color: v }); }} />
          )}
        </>
      )}
    </div>
  );
}

// ---- Font -----------------------------------------------------------------------------------

function FontRow({ id, selected, onPick, onRemove }: { id: string; selected: boolean; onPick: () => void; onRemove?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      previewFont(id);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        previewFont(id);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [id]);
  return (
    <li className="font-row">
      <button ref={ref} type="button" className="font-row__pick" aria-pressed={selected} onClick={onPick}>
        <span className="font-row__check" aria-hidden="true">{selected ? "✓" : ""}</span>
        <span className="font-row__name" style={{ fontFamily: previewFamily(id) }}>
          {fontLabel(id)}
        </span>
      </button>
      {onRemove && (
        <button type="button" className="button button--secondary" aria-label={`Remove ${fontLabel(id)}`} onClick={onRemove}>
          Remove
        </button>
      )}
    </li>
  );
}

export function FontTab({ style, onChange }: TabProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("All");
  const [custom, setCustom] = useState<{ id: string; name: string }[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reload = () => {
    void listCustomFonts().then(setCustom);
  };
  useEffect(reload, []);
  const pick = (id: string) => {
    rememberFont(id);
    onChange({ ...style, font_family: id });
  };
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      FONT_CATALOG.filter((f) => (group === "All" || f.group === group) && (!q || f.family.toLowerCase().includes(q))),
    [group, q],
  );
  const recent = recentFonts().filter((id) => id !== style.font_family);
  return (
    <div className="studio-panel">
      <div className="font-tools">
        <label className="visually-hidden" htmlFor="font-search">
          Search fonts
        </label>
        <input
          id="font-search"
          className="text-input"
          type="search"
          placeholder="Search font"
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (!file) return;
            setNote(null);
            addCustomFont(file)
              .then((id) => {
                reload();
                pick(id);
                setNote({ ok: true, text: `Added ${fontLabel(id)}. It is kept in this browser.` });
              })
              .catch((err: unknown) => {
                setNote({ ok: false, text: err instanceof Error ? err.message : "That font could not be added." });
              });
          }}
        />
        <button type="button" className="button button--secondary" onClick={() => fileRef.current?.click()}>
          Add Font
        </button>
      </div>
      {note && (
        <p role={note.ok ? "status" : "alert"} className={note.ok ? "status--ok" : "inline-error"}>
          {note.text}
        </p>
      )}
      <div className="button-row">
        <button type="button" className="button button--secondary toggle" aria-pressed={style.bold} onClick={() => { onChange({ ...style, bold: !style.bold }); }}>
          <strong>B</strong> Bold
        </button>
        <button type="button" className="button button--secondary toggle" aria-pressed={style.italic} onClick={() => { onChange({ ...style, italic: !style.italic }); }}>
          <em>I</em> Italic
        </button>
      </div>
      {!q && (
        <>
          <h4 className="font-section">In this project</h4>
          <ul className="font-list">
            <FontRow id={style.font_family} selected onPick={() => { pick(style.font_family); }} />
          </ul>
          {custom.length > 0 && (
            <>
              <h4 className="font-section">My fonts</h4>
              <ul className="font-list">
                {custom.map((f) => (
                  <FontRow
                    key={f.id}
                    id={f.id}
                    selected={style.font_family === f.id}
                    onPick={() => { pick(f.id); }}
                    onRemove={() => {
                      void removeCustomFont(f.id).then(reload);
                      if (style.font_family === f.id) onChange({ ...style, font_family: "noto-sans-tamil" });
                    }}
                  />
                ))}
              </ul>
            </>
          )}
          {recent.length > 0 && (
            <>
              <h4 className="font-section">Recently used</h4>
              <ul className="font-list">
                {recent.map((id) => (
                  <FontRow key={id} id={id} selected={false} onPick={() => { pick(id); }} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <div className="chip-row" role="radiogroup" aria-label="Font group">
        {["All", ...FONT_GROUPS].map((g) => (
          <button key={g} type="button" role="radio" aria-checked={group === g} className="chip" onClick={() => { setGroup(g); }}>
            {g}
          </button>
        ))}
      </div>
      <ul className="font-list" aria-label="Fonts">
        {matches.map((f) => (
          <FontRow key={f.id} id={f.id} selected={style.font_family === f.id} onPick={() => { pick(f.id); }} />
        ))}
        {(group === "All" || group === "Sans") &&
          !q &&
          SYSTEM_FONTS.map((f) => <FontRow key={f.id} id={f.id} selected={style.font_family === f.id} onPick={() => { pick(f.id); }} />)}
      </ul>
      {matches.length === 0 && <p className="muted">No font matches “{query}”.</p>}
      <p className="muted studio-note">
        Free fonts from Google Fonts (Open Font License). Tamil and Hindi letters always use a
        matching font, even if the chosen one does not have them.
      </p>
    </div>
  );
}

// ---- Size -----------------------------------------------------------------------------------

const SIZE_PRESETS = [
  { label: "Title", size: 72 },
  { label: "Subtitle", size: 54 },
  { label: "Content", size: 40 },
];

export function SizeTab({ style, onChange }: TabProps) {
  return (
    <div className="studio-panel">
      <RangeField label="Font size" value={style.font_size} min={8} max={200} onChange={(v) => { onChange({ ...style, font_size: v }); }} />
      <h4 className="font-section">Suitable sizes</h4>
      <ul className="size-presets">
        {SIZE_PRESETS.map((p) => (
          <li key={p.label}>
            <button type="button" className="size-preset" aria-pressed={style.font_size === p.size} onClick={() => { onChange({ ...style, font_size: p.size }); }}>
              <span style={{ fontSize: `${String(Math.round(p.size / 2.2))}px` }}>
                <strong>{p.label}</strong> / {p.size}
              </span>
              <span aria-hidden="true">{style.font_size === p.size ? "✓" : ""}</span>
            </button>
          </li>
        ))}
      </ul>
      <RangeField label="Text box width" unit="%" value={style.max_width_pct} min={30} max={100} onChange={(v) => { onChange({ ...style, max_width_pct: v }); }} />
    </div>
  );
}

// ---- Colour ---------------------------------------------------------------------------------

type ColorPart = "text" | "stroke" | "shadow" | "background";

export function ColorTab({ style, onChange }: TabProps) {
  const [part, setPart] = useState<ColorPart>("text");
  const bg = style.background;
  return (
    <div className="studio-panel">
      <div className="chip-row chip-row--scroll" role="group" aria-label="Quick colours">
        <button
          type="button"
          className="t-chip"
          aria-label="No outline"
          onClick={() => { onChange({ ...style, outline_px: 0 }); }}
        >
          ⃠
        </button>
        {COLOR_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="t-chip"
            aria-label={`Text ${c.text}, outline ${c.outline}`}
            aria-pressed={style.text_color === c.text && style.outline_color === c.outline && style.outline_px > 0}
            onClick={() => {
              onChange({ ...style, text_color: c.text, outline_color: c.outline, outline_px: c.outlinePx, text_opacity: 1, outline_opacity: 1 });
            }}
          >
            <span style={{ color: c.text, WebkitTextStroke: `2px ${c.outline}`, paintOrder: "stroke fill" }}>T</span>
          </button>
        ))}
      </div>
      <SubTabs
        label="Colour of"
        value={part}
        onChange={setPart}
        options={[
          { value: "text", label: "Text" },
          { value: "stroke", label: "Stroke" },
          { value: "shadow", label: "Shadow" },
          { value: "background", label: "Background" },
        ]}
      />
      {part === "text" && (
        <>
          <SwatchRow label="Text colour" value={style.text_color} swatches={SWATCHES} onChange={(v) => { onChange({ ...style, text_color: v }); }} />
          <RangeField label="Opacity" unit="%" value={Math.round(style.text_opacity * 100)} min={0} max={100} onChange={(v) => { onChange({ ...style, text_opacity: v / 100 }); }} />
        </>
      )}
      {part === "stroke" && (
        <>
          <SwatchRow label="Stroke colour" value={style.outline_color} swatches={SWATCHES} onChange={(v) => { onChange({ ...style, outline_color: v, outline_px: style.outline_px || 3 }); }} />
          <RangeField label="Thickness" unit="px" value={style.outline_px} min={0} max={20} onChange={(v) => { onChange({ ...style, outline_px: v }); }} />
          <RangeField label="Opacity" unit="%" value={Math.round(style.outline_opacity * 100)} min={0} max={100} onChange={(v) => { onChange({ ...style, outline_opacity: v / 100 }); }} />
        </>
      )}
      {part === "shadow" && (
        <>
          <Toggle label="Shadow" checked={style.shadow} onChange={(v) => { onChange({ ...style, shadow: v }); }} />
          <SwatchRow label="Shadow colour" value={style.shadow_color} swatches={SWATCHES} onChange={(v) => { onChange({ ...style, shadow_color: v, shadow: true }); }} />
          <RangeField label="Opacity" unit="%" value={Math.round(style.shadow_opacity * 100)} min={0} max={100} onChange={(v) => { onChange({ ...style, shadow_opacity: v / 100, shadow: true }); }} />
          <RangeField label="Blur (glow)" unit="px" value={style.shadow_blur_px} min={0} max={60} onChange={(v) => { onChange({ ...style, shadow_blur_px: v, shadow: true }); }} />
          <RangeField label="Distance" unit="px" value={style.shadow_offset_px} min={0} max={30} onChange={(v) => { onChange({ ...style, shadow_offset_px: v, shadow: true }); }} />
        </>
      )}
      {part === "background" && (
        <>
          <Toggle label="Background box" checked={bg.enabled} onChange={(v) => { onChange({ ...style, background: { ...bg, enabled: v } }); }} />
          <SwatchRow label="Background colour" value={bg.color} swatches={SWATCHES} onChange={(v) => { onChange({ ...style, background: { ...bg, color: v, enabled: true } }); }} />
          <RangeField label="Opacity" unit="%" value={Math.round(bg.opacity * 100)} min={0} max={100} onChange={(v) => { onChange({ ...style, background: { ...bg, opacity: v / 100, enabled: true } }); }} />
          <RangeField label="Padding" unit="px" value={bg.padding_px} min={0} max={80} onChange={(v) => { onChange({ ...style, background: { ...bg, padding_px: v, enabled: true } }); }} />
          <RangeField label="Corner rounding" unit="px" value={bg.radius_px} min={0} max={80} onChange={(v) => { onChange({ ...style, background: { ...bg, radius_px: v, enabled: true } }); }} />
        </>
      )}
    </div>
  );
}

// ---- Align ----------------------------------------------------------------------------------

export function AlignTab({ style, onChange }: TabProps) {
  return (
    <div className="studio-panel">
      <Segmented
        legend="Alignment"
        value={style.align}
        onChange={(v) => { onChange({ ...style, align: v }); }}
        options={[
          { value: "left", label: "⇤ Left" },
          { value: "center", label: "↔ Center" },
          { value: "right", label: "Right ⇥" },
        ]}
      />
      <Segmented
        legend="Position on the video"
        value={style.position}
        onChange={(v) => { onChange({ ...style, position: v }); }}
        options={[
          { value: "top", label: "⤒ Top" },
          { value: "middle", label: "↕ Middle" },
          { value: "bottom", label: "⤓ Bottom" },
        ]}
      />
      <RangeField label="Move up or down" unit="px" value={style.vertical_offset_px} min={-300} max={300} onChange={(v) => { onChange({ ...style, vertical_offset_px: v }); }} />
      <RangeField label="Safe margin" unit="%" value={style.safe_margin_pct} min={0} max={25} onChange={(v) => { onChange({ ...style, safe_margin_pct: v }); }} />
    </div>
  );
}

// ---- Spacing --------------------------------------------------------------------------------

export function SpacingTab({ style, onChange }: TabProps) {
  return (
    <div className="studio-panel">
      <RangeField label="Letter spacing" unit="px" value={style.letter_spacing_px} min={-10} max={40} onChange={(v) => { onChange({ ...style, letter_spacing_px: v }); }} />
      <RangeField label="Line spacing" unit="%" value={style.line_spacing_pct} min={-30} max={150} onChange={(v) => { onChange({ ...style, line_spacing_pct: v }); }} />
      <Segmented
        legend="Letters"
        value={style.text_case}
        onChange={(v) => { onChange({ ...style, text_case: v }); }}
        options={[
          { value: "none", label: "As typed" },
          { value: "upper", label: "ALL CAPS" },
        ]}
      />
    </div>
  );
}
