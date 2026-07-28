interface LoadingOverlayProps {
  visible: boolean;
  text?: string;
}

export default function LoadingOverlay({ visible, text = "处理中..." }: LoadingOverlayProps) {
  if (!visible) return null;
  return (
    <div className="loading-overlay">
      <div className="loading-card">
        <div className="loading-spinner" />
        <div>{text}</div>
      </div>
    </div>
  );
}
