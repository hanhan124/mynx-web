import { NavLink } from "react-router-dom";
import { IconHome, IconDna, IconPhoto, IconBrain } from "@tabler/icons-react";

const navItems = [
  { to: "/", label: "首页", icon: IconHome, end: true },
  { to: "/qpcr", label: "qPCR", icon: IconDna, end: false },
  { to: "/tiff", label: "TIFF", icon: IconPhoto, end: false },
  { to: "/insight", label: "AI 解读", icon: IconBrain, end: false },
];

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">Mynx</div>
      <div className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `sidebar-item${isActive ? " sidebar-item--active" : ""}`
            }
          >
            <item.icon size={22} stroke={1.75} />
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </div>
      <div className="sidebar-footer">
        <a
          href="https://github.com/hanhan124/mynx"
          target="_blank"
          rel="noreferrer"
          className="sidebar-github"
        >
          GitHub
        </a>
      </div>
    </nav>
  );
}
