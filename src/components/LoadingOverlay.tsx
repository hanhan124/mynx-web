interface LoadingOverlayProps {
  visible: boolean;
  /** Optional text shown under the spinner (e.g. "正在生成图表 (3/12)") */
  text?: string;
  /**
   * Progress percentage 0-100, or null/undefined for an indeterminate bar.
   * When provided the bar shows determinate fill; otherwise a sliding shimmer.
   */
  progress?: number | null;
}

export default function LoadingOverlay({
  visible,
  text = "处理中...",
  progress,
}: LoadingOverlayProps) {
  if (!visible) return null;

  const determinate = typeof progress === "number" && Number.isFinite(progress);
  const pct = determinate ? Math.max(0, Math.min(100, progress as number)) : 0;
  const showText = text || (determinate ? `${Math.round(pct)}%` : "");

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-box">
        <div className="spinner" />
        {showText && <div className="loading-text">{showText}</div>}
        <div className="loading-progress-track">
          {determinate ? (
            <div
              className="loading-progress-fill"
              style={{ width: `${pct}%` }}
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              role="progressbar"
            />
          ) : (
            <div className="loading-progress-indeterminate" />
          )}
        </div>
      </div>
    </div>
  );
}
