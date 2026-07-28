import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import Modal from "@/components/Modal";
import ThemePicker from "@/components/ThemePicker";
import AboutModal from "@/components/AboutModal";
import { IconHomeFilled, IconWorldFilled, IconPaletteFilled, IconInfoCircleFilled } from "@tabler/icons-react";
import { tools } from "@/lib/tools";

const navItems = [
  { icon: IconHomeFilled, label: "主页", path: "/" },
  ...tools
    .filter((t) => t.showInSidebar)
    .map((t) => ({ icon: t.icon, label: t.navLabel, path: t.path })),
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [showAbout, setShowAbout] = useState(false);
  const [showThemes, setShowThemes] = useState(false);

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-nav">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                className={`sidebar-btn ${active ? "sidebar-btn--active" : ""}`}
                onClick={() => navigate(item.path)}
                title={item.label}
              >
                <Icon size={16} stroke={2} />
              </button>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <button
            className="sidebar-btn"
            title="网站"
            onClick={() => {
              window.open("https://www.fanguanghan.homes", "_blank");
            }}
          >
            <IconWorldFilled size={16} stroke={2} />
          </button>
          <button
            className="sidebar-btn"
            title="主题"
            onClick={() => setShowThemes(true)}
          >
            <IconPaletteFilled size={16} stroke={2} />
          </button>
          <button
            className="sidebar-btn"
            title="关于"
            onClick={() => setShowAbout(true)}
          >
            <IconInfoCircleFilled size={16} stroke={2} />
          </button>
        </div>
      </div>

      <Modal
        open={showThemes}
        onClose={() => setShowThemes(false)}
        title="主题设置"
      >
        <div
          style={{
            marginBottom: 12,
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          选择配色风格
        </div>
        <ThemePicker
          value={theme}
          onSelect={(next) => {
            setTheme(next);
            setShowThemes(false);
          }}
        />
      </Modal>

      <AboutModal
        open={showAbout}
        onClose={() => setShowAbout(false)}
      />
    </>
  );
}
