import { useState, useEffect, useCallback } from "react";
import { loadConfig, saveTheme } from "@/lib/config";
import { DEFAULT_THEME, resolveTheme, getSystemTheme, type ThemeId, type ResolvedTheme } from "@/lib/theme";

export function useTheme() {
  // 用户选择的偏好（可能是 "system"）
  const [preference, setPreference] = useState<ThemeId>(DEFAULT_THEME);
  // 实际生效的主题
  const [resolved, setResolved] = useState<ResolvedTheme>(getSystemTheme());

  // 从 store 加载
  useEffect(() => {
    loadConfig().then((config) => {
      setPreference(config.theme);
      setResolved(resolveTheme(config.theme));
    });
  }, []);

  // 监听系统主题变化（仅在 preference === "system" 时生效）
  useEffect(() => {
    if (preference !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(getSystemTheme());
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  // 将 resolved theme 写入 DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  const setTheme = useCallback((next: ThemeId) => {
    setPreference(next);
    setResolved(resolveTheme(next));
    saveTheme(next);
  }, []);

  return { theme: preference, resolvedTheme: resolved, setTheme };
}
