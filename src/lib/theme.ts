export const THEMES = [
  {
    id: "system",
    name: "跟随系统",
    description: "跟随系统深浅色",
    accent: "#8e8e93",
  },
  {
    id: "graphite",
    name: "深色模式",
    description: "暗色界面",
    accent: "#0a84ff",
  },
  {
    id: "pearl",
    name: "浅色模式",
    description: "亮色界面",
    accent: "#007aff",
  },
] as const;

export type ThemeId = typeof THEMES[number]["id"];

/** 实际生效的主题（不含 system） */
export type ResolvedTheme = "graphite" | "pearl";

export const DEFAULT_THEME: ThemeId = "system";

const THEME_IDS = new Set<string>(THEMES.map((theme) => theme.id));

export function normalizeTheme(value: string | null | undefined): ThemeId {
  if (!value) return DEFAULT_THEME;
  const lower = value.toLowerCase();
  if (lower === "dark") return "graphite";
  if (lower === "light") return "pearl";
  if (THEME_IDS.has(lower)) return lower as ThemeId;
  return DEFAULT_THEME;
}

/** 获取当前系统偏好的主题 */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "pearl";
  }
  return "graphite";
}

/** 将用户选择解析为实际生效的主题 */
export function resolveTheme(theme: ThemeId): ResolvedTheme {
  if (theme === "system") return getSystemTheme();
  return theme;
}
