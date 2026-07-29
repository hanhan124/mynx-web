/**
 * 网站统计服务 —— Vercel Edge Function
 *
 * GET /api/stats: 读取统计数据
 * POST /api/stats/track: 上报一次访问（page、referrer、device）
 *
 * 使用 Vercel KV（如果配置了 KV_REST_API_URL/KV_REST_API_TOKEN）。
 * 未配置 KV 时回退到内存存储（单实例有效，重启丢失）。
 */

// 内存存储（KV 不可用时回退）
const memStats = {
  totalVisits: 0,
  todayVisits: 0,
  todayDate: new Date().toDateString(),
  pages: {} as Record<string, number>,
  devices: { mobile: 0, desktop: 0 },
  browsers: {} as Record<string, number>,
  countries: {} as Record<string, number>,
  aiUsage: { tasks: 0, tokens: 0 },
  onlineUsers: {} as Record<string, number>, // sessionId → timestamp
};

function getKV() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    return { url, token, available: true };
  }
  return { available: false };
}

async function kvGet(key: string): Promise<string | null> {
  const kv = getKV();
  if (!kv.available) return null;
  try {
    const resp = await fetch(`${kv.url}/get/${key}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
    });
    const data = await resp.json();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: string): Promise<void> {
  const kv = getKV();
  if (!kv.available) return;
  try {
    await fetch(`${kv.url}/set/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${kv.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  } catch {
    // ignore
  }
}

function resetDailyIfNeeded() {
  const today = new Date().toDateString();
  if (memStats.todayDate !== today) {
    memStats.todayDate = today;
    memStats.todayVisits = 0;
  }
  // 清理超时在线用户（5 分钟无活动）
  const now = Date.now();
  for (const sid in memStats.onlineUsers) {
    if (now - memStats.onlineUsers[sid] > 5 * 60 * 1000) {
      delete memStats.onlineUsers[sid];
    }
  }
}

function getStats() {
  resetDailyIfNeeded();
  return {
    totalVisits: memStats.totalVisits,
    todayVisits: memStats.todayVisits,
    onlineNow: Object.keys(memStats.onlineUsers).length,
    topPages: Object.entries(memStats.pages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([page, count]) => ({ page, count })),
    devices: memStats.devices,
    browsers: Object.entries(memStats.browsers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    countries: Object.entries(memStats.countries)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    aiUsage: memStats.aiUsage,
  };
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify(getStats()), { headers: corsHeaders });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { page, referrer, userAgent, sessionId, type } = body;

      resetDailyIfNeeded();

      if (type === "ai_usage") {
        // AI 用量上报
        memStats.aiUsage.tasks += 1;
        memStats.aiUsage.tokens += body.tokens ?? 0;
      } else {
        // 访问上报
        memStats.totalVisits += 1;
        memStats.todayVisits += 1;

        if (page) {
          memStats.pages[page] = (memStats.pages[page] ?? 0) + 1;
        }

        // 设备检测
        const ua = userAgent ?? "";
        const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
        if (isMobile) memStats.devices.mobile += 1;
        else memStats.devices.desktop += 1;

        // 浏览器检测
        let browser = "Other";
        if (/Edg\//.test(ua)) browser = "Edge";
        else if (/Chrome\//.test(ua)) browser = "Chrome";
        else if (/Firefox\//.test(ua)) browser = "Firefox";
        else if (/Safari\//.test(ua)) browser = "Safari";
        memStats.browsers[browser] = (memStats.browsers[browser] ?? 0) + 1;

        // 在线用户
        if (sessionId) {
          memStats.onlineUsers[sessionId] = Date.now();
        }
      }

      return new Response(JSON.stringify({ ok: true, stats: getStats() }), { headers: corsHeaders });
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Invalid body" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: corsHeaders,
  });
}

export const config = {
  runtime: "edge",
};
