import { normalizeTheme, type ThemeId } from "./theme";

/**
 * 配置存储 —— 网页版。
 *
 * 桌面端用 @tauri-apps/plugin-store（config.json）；网页版改用 localStorage，
 * 保存 theme / alwaysOnTop / chartColor 等。alwaysOnTop 在网页版无意义，
 * 但保留字段以兼容调用方。
 */

const LS_KEY = "mynx:config";

interface Config {
  theme?: string;
  alwaysOnTop?: boolean;
  chartColor?: string;
}

function readStore(): Config {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Config;
  } catch {
    return {};
  }
}

function writeStore(cfg: Config): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore quota errors */
  }
}

/** Validate "#RRGGBB" / "#RRGGBBAA"; falls back to the default if invalid. */
function normalizeChartColor(value: unknown): string {
  if (typeof value !== "string") return "#3C9FDF";
  return /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value.trim())
    ? value.trim().startsWith("#")
      ? value.trim()
      : `#${value.trim()}`
    : "#3C9FDF";
}

export async function loadConfig(): Promise<{
  theme: ThemeId;
  alwaysOnTop: boolean;
  chartColor: string;
}> {
  const cfg = readStore();
  const theme = normalizeTheme(cfg.theme);
  const alwaysOnTop = cfg.alwaysOnTop ?? false;
  const chartColor = normalizeChartColor(cfg.chartColor);
  return { theme, alwaysOnTop, chartColor };
}

export async function saveTheme(theme: ThemeId): Promise<void> {
  const cfg = readStore();
  cfg.theme = theme;
  writeStore(cfg);
}

export async function saveAlwaysOnTop(value: boolean): Promise<void> {
  const cfg = readStore();
  cfg.alwaysOnTop = value;
  writeStore(cfg);
}

export async function saveChartColor(color: string): Promise<void> {
  const cfg = readStore();
  cfg.chartColor = normalizeChartColor(color);
  writeStore(cfg);
}

export async function loadChartColor(): Promise<string> {
  const cfg = readStore();
  return normalizeChartColor(cfg.chartColor);
}
