import { useState, type ReactNode } from "react";
import type { SubtitleStyle } from "../../api/projects";
import { AlignTab, AnimationTab, ColorTab, FontTab, LooksTab, SizeTab, SpacingTab } from "./tabs";

export type StudioTab = "looks" | "animation" | "font" | "size" | "color" | "align" | "spacing";

const TABS: { id: StudioTab; label: string; icon: ReactNode }[] = [
  { id: "looks", label: "Looks", icon: <span className="studio-icon studio-icon--box">T</span> },
  { id: "animation", label: "Animation", icon: <span className="studio-icon">◎</span> },
  { id: "font", label: "Font", icon: <span className="studio-icon studio-icon--serif">Ff</span> },
  { id: "size", label: "Size", icon: <span className="studio-icon">A<small>A</small></span> },
  { id: "color", label: "Colour", icon: <span className="studio-icon studio-icon--wheel" /> },
  { id: "align", label: "Align", icon: <span className="studio-icon">≡</span> },
  { id: "spacing", label: "Spacing", icon: <span className="studio-icon">↕≡</span> },
];

interface Props {
  style: SubtitleStyle;
  onChange: (next: SubtitleStyle) => void;
  initialTab?: StudioTab;
}

/** All styling, one tab at a time; used by Easy mode and Editor mode alike. */
export function StyleStudio({ style, onChange, initialTab = "looks" }: Props) {
  const [tab, setTab] = useState<StudioTab>(initialTab);
  return (
    <div className="studio">
      <div className="studio-tabs" role="tablist" aria-label="Style tools">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`studio-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="studio-panel"
            className="studio-tab"
            onClick={() => {
              setTab(t.id);
            }}
          >
            <span aria-hidden="true">{t.icon}</span>
            <span className="studio-tab__label">{t.label}</span>
          </button>
        ))}
      </div>
      <div id="studio-panel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`}>
        {tab === "looks" && <LooksTab style={style} onChange={onChange} />}
        {tab === "animation" && <AnimationTab style={style} onChange={onChange} />}
        {tab === "font" && <FontTab style={style} onChange={onChange} />}
        {tab === "size" && <SizeTab style={style} onChange={onChange} />}
        {tab === "color" && <ColorTab style={style} onChange={onChange} />}
        {tab === "align" && <AlignTab style={style} onChange={onChange} />}
        {tab === "spacing" && <SpacingTab style={style} onChange={onChange} />}
      </div>
    </div>
  );
}
