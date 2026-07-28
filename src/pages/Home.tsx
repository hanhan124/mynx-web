import { useNavigate } from "react-router-dom";
import { IconArrowBadgeRight } from "@tabler/icons-react";
import AppMark from "@/components/AppMark";
import WeatherWidget from "@/components/WeatherWidget";
import { tools } from "@/lib/tools";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-shell">
      <div className="home-brand">
        <AppMark size={40} />
        <div>
          <div className="home-title">Mynx</div>
          <div className="home-subtitle">好用的工具，都在这里</div>
        </div>
      </div>

      <WeatherWidget />

      <div className="tool-grid">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.path}
              className="tool-card"
              onClick={() => navigate(tool.path)}
            >
              <div className="tool-card-icon" style={{ background: tool.accent }}>
                <Icon size={18} color="white" stroke={1.75} />
              </div>
              <div className="tool-card-body">
                <span className="tool-card-title">{tool.title}</span>
                <span className="tool-card-desc">{tool.description}</span>
              </div>
              <IconArrowBadgeRight size={14} stroke={1.75} className="tool-card-arrow" />
            </button>
          );
        })}
      </div>

      <div className="home-footer">
        <span className="home-footer-line">Mynx · Tauri + React + Rust</span>
        <span className="home-footer-line">© 2026 Han · MIT License</span>
      </div>
    </div>
  );
}
