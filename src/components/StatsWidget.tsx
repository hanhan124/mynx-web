import { useState, useEffect, useCallback } from "react";
import { IconChartBar, IconUsers, IconEye, IconX } from "@tabler/icons-react";
import { getStats, formatNumber, type StatsData } from "@/lib/stats-client";

export default function StatsWidget() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);

  const refresh = useCallback(async () => {
    const s = await getStats();
    if (s) setStats(s);
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // 定时刷新在线人数
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [open, refresh]);

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        className="stats-fab"
        onClick={() => setOpen(!open)}
        title="网站统计"
      >
        <IconChartBar size={20} stroke={2} />
        {stats && stats.onlineNow > 0 && (
          <span className="stats-fab-badge">{stats.onlineNow}</span>
        )}
      </button>

      {/* 展开面板 */}
      {open && (
        <div className="stats-panel">
          <div className="stats-panel-header">
            <span>网站统计</span>
            <button className="stats-panel-close" onClick={() => setOpen(false)}>
              <IconX size={14} stroke={2} />
            </button>
          </div>

          {stats ? (
            <div className="stats-panel-body">
              {/* 核心数字 */}
              <div className="stats-grid">
                <div className="stats-card">
                  <IconEye size={16} stroke={2} />
                  <div className="stats-card-value">{formatNumber(stats.totalVisits)}</div>
                  <div className="stats-card-label">总访问</div>
                </div>
                <div className="stats-card">
                  <IconChartBar size={16} stroke={2} />
                  <div className="stats-card-value">{formatNumber(stats.todayVisits)}</div>
                  <div className="stats-card-label">今日</div>
                </div>
                <div className="stats-card">
                  <IconUsers size={16} stroke={2} />
                  <div className="stats-card-value">{stats.onlineNow}</div>
                  <div className="stats-card-label">在线</div>
                </div>
              </div>

              {/* 页面热度 */}
              {stats.topPages.length > 0 && (
                <div className="stats-section">
                  <div className="stats-section-title">页面热度</div>
                  {stats.topPages.map((p) => (
                    <div key={p.page} className="stats-row">
                      <span className="stats-row-label">{p.page}</span>
                      <span className="stats-row-value">{p.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 设备分布 */}
              <div className="stats-section">
                <div className="stats-section-title">设备分布</div>
                <div className="stats-row">
                  <span className="stats-row-label">💻 桌面端</span>
                  <span className="stats-row-value">{stats.devices.desktop}</span>
                </div>
                <div className="stats-row">
                  <span className="stats-row-label">📱 移动端</span>
                  <span className="stats-row-value">{stats.devices.mobile}</span>
                </div>
              </div>

              {/* 浏览器 */}
              {stats.browsers.length > 0 && (
                <div className="stats-section">
                  <div className="stats-section-title">浏览器</div>
                  {stats.browsers.map((b) => (
                    <div key={b.name} className="stats-row">
                      <span className="stats-row-label">{b.name}</span>
                      <span className="stats-row-value">{b.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* AI 用量 */}
              {stats.aiUsage.tasks > 0 && (
                <div className="stats-section">
                  <div className="stats-section-title">AI 用量</div>
                  <div className="stats-row">
                    <span className="stats-row-label">解读任务</span>
                    <span className="stats-row-value">{stats.aiUsage.tasks}</span>
                  </div>
                  <div className="stats-row">
                    <span className="stats-row-label">Token 消耗</span>
                    <span className="stats-row-value">{formatNumber(stats.aiUsage.tokens)}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="stats-panel-loading">加载中...</div>
          )}
        </div>
      )}
    </>
  );
}
