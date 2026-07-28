import Modal from "@/components/Modal";
import AppMark from "@/components/AppMark";
import { IconWorldFilled } from "@tabler/icons-react";

/** Web build version (no Tauri getVersion available). */
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "1.0.0";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutModal({ open, onClose }: AboutModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="关于">
      <div className="about-header">
        <AppMark size={48} />
        <div className="about-header-text">
          <div className="about-app-name">Mynx</div>
          <div className="about-app-desc">好用的小工具，触手可及</div>
        </div>
      </div>

      <div className="about-info">
        <div className="about-row">
          <span>版本</span>
          <span>v{APP_VERSION}</span>
        </div>
        <div className="about-row">
          <span>作者</span>
          <span>Han</span>
        </div>
        <div className="about-row">
          <span>技术栈</span>
          <span>React · Vite</span>
        </div>
      </div>

      <div className="about-links">
        <button
          className="btn btn-full"
          onClick={() => {
            window.open("https://github.com/hanhan124/mynx", "_blank");
          }}
        >
          <IconWorldFilled size={14} stroke={1.75} />
          GitHub
        </button>
      </div>

      <div className="about-copyright">© 2026 Han · MIT License</div>
    </Modal>
  );
}
