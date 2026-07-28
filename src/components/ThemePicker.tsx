import { IconCheck } from "@tabler/icons-react";
import { THEMES, type ThemeId } from "@/lib/theme";

interface ThemePickerProps {
  value: ThemeId;
  onSelect: (theme: ThemeId) => void;
}

/* 每个选项的 mockup 配色 */
const MOCKUP_COLORS: Record<string, {
  bg: string;
  sidebar: string;
  sidebarDot: string;
  title: string;
  bar: string;
  barAccent: string;
}> = {
  graphite: {
    bg: "#2c2c2e",
    sidebar: "#1e1e1e",
    sidebarDot: "rgba(255,255,255,0.18)",
    title: "rgba(255,255,255,0.55)",
    bar: "rgba(255,255,255,0.08)",
    barAccent: "rgba(10,132,255,0.35)",
  },
  pearl: {
    bg: "#f5f5f7",
    sidebar: "#e8e8e8",
    sidebarDot: "rgba(0,0,0,0.12)",
    title: "rgba(0,0,0,0.35)",
    bar: "rgba(0,0,0,0.06)",
    barAccent: "rgba(0,122,255,0.25)",
  },
};

function ThemeMockup({ colors }: { colors: typeof MOCKUP_COLORS["graphite"] }) {
  return (
    <div className="theme-tile-mockup" style={{ background: colors.bg }}>
      <div className="mockup-sidebar" style={{ background: colors.sidebar }}>
        <span className="mockup-dot" style={{ background: colors.sidebarDot }} />
        <span className="mockup-dot" style={{ background: colors.sidebarDot }} />
        <span className="mockup-dot" style={{ background: colors.sidebarDot }} />
      </div>
      <div className="mockup-content">
        <div className="mockup-title" style={{ background: colors.title }} />
        <div className="mockup-bar" style={{ width: "90%", background: colors.bar }} />
        <div className="mockup-bar" style={{ width: "60%", background: colors.barAccent }} />
      </div>
    </div>
  );
}

function SystemMockup() {
  /* 左半深色 右半浅色，表达"跟随系统" */
  return (
    <div className="theme-tile-mockup" style={{ display: "flex", overflow: "hidden", borderRadius: 6 }}>
      {/* 深色半边 */}
      <div style={{ flex: 1, display: "flex", background: MOCKUP_COLORS.graphite.bg }}>
        <div className="mockup-sidebar" style={{ background: MOCKUP_COLORS.graphite.sidebar }}>
          <span className="mockup-dot" style={{ background: MOCKUP_COLORS.graphite.sidebarDot }} />
          <span className="mockup-dot" style={{ background: MOCKUP_COLORS.graphite.sidebarDot }} />
        </div>
        <div className="mockup-content" style={{ flex: 1 }}>
          <div className="mockup-title" style={{ background: MOCKUP_COLORS.graphite.title }} />
          <div className="mockup-bar" style={{ width: "80%", background: MOCKUP_COLORS.graphite.bar }} />
        </div>
      </div>
      {/* 浅色半边 */}
      <div style={{ flex: 1, display: "flex", background: MOCKUP_COLORS.pearl.bg }}>
        <div className="mockup-content" style={{ flex: 1 }}>
          <div className="mockup-title" style={{ background: MOCKUP_COLORS.pearl.title }} />
          <div className="mockup-bar" style={{ width: "80%", background: MOCKUP_COLORS.pearl.barAccent }} />
        </div>
        <div className="mockup-sidebar" style={{ background: MOCKUP_COLORS.pearl.sidebar }}>
          <span className="mockup-dot" style={{ background: MOCKUP_COLORS.pearl.sidebarDot }} />
          <span className="mockup-dot" style={{ background: MOCKUP_COLORS.pearl.sidebarDot }} />
        </div>
      </div>
    </div>
  );
}

export default function ThemePicker({ value, onSelect }: ThemePickerProps) {
  return (
    <div className="theme-picker">
      {THEMES.map((theme) => {
        const active = theme.id === value;
        const isSystem = theme.id === "system";
        return (
          <button
            key={theme.id}
            className={`theme-tile ${active ? "theme-tile--active" : ""}`}
            onClick={() => onSelect(theme.id)}
          >
            {isSystem
              ? <SystemMockup />
              : <ThemeMockup colors={MOCKUP_COLORS[theme.id]} />
            }
            <div className="theme-tile-info">
              <div className="theme-tile-labels">
                <span className="theme-tile-name">{theme.name}</span>
                <span className="theme-tile-desc">{theme.description}</span>
              </div>
              <span className={`theme-tile-check ${active ? "theme-tile-check--active" : "theme-tile-check--inactive"}`}>
                <IconCheck size={14} stroke={1.75} />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
