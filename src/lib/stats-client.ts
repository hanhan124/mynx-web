/**
 * 网站统计客户端 —— 上报访问 + 获取统计数据
 */

const API_URL = "/api/stats";

export interface StatsData {
  totalVisits: number;
  todayVisits: number;
  onlineNow: number;
  topPages: Array<{ page: string; count: number }>;
  devices: { mobile: number; desktop: number };
  browsers: Array<{ name: string; count: number }>;
  countries: Array<{ name: string; count: number }>;
  aiUsage: { tasks: number; tokens: number };
}

let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId) return sessionId;
  const key = "mynx_session_id";
  sessionId = localStorage.getItem(key);
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, sessionId);
  }
  return sessionId;
}

/** 上报一次访问 */
export async function trackVisit(page: string): Promise<void> {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page,
        userAgent: navigator.userAgent,
        sessionId: getSessionId(),
        type: "visit",
      }),
    });
  } catch {
    // 静默失败
  }
}

/** 上报 AI 用量 */
export async function trackAIUsage(tokens: number): Promise<void> {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ai_usage", tokens }),
    });
  } catch {
    // 静默失败
  }
}

/** 获取统计数据 */
export async function getStats(): Promise<StatsData | null> {
  try {
    const resp = await fetch(API_URL);
    if (!resp.ok) return null;
    return (await resp.json()) as StatsData;
  } catch {
    return null;
  }
}

/** 格式化数字 */
export function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
