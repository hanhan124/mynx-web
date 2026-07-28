import { Link } from "react-router-dom";
import { IconDna, IconPhoto, IconBrain } from "@tabler/icons-react";
import { tools } from "@/lib/tools";

export default function Home() {
  return (
    <div className="home-shell">
      <div className="home-hero">
        <h1 className="home-title">Mynx</h1>
        <p className="home-subtitle">科研数据处理工具 · 浏览器版</p>
        <p className="home-desc">
          qPCR 数据分析、TIFF 图片转换、AI 生物学解读 —— 全部在浏览器中完成，无需安装。
        </p>
      </div>
      <div className="home-cards">
        {tools.map((tool) => (
          <Link key={tool.id} to={tool.path} className="home-card" style={{ "--accent": tool.accent } as React.CSSProperties}>
            <div className="home-card-icon" style={{ background: tool.accent }}>
              <tool.icon size={28} color="white" stroke={1.5} />
            </div>
            <div className="home-card-body">
              <h2 className="home-card-title">{tool.title}</h2>
              <p className="home-card-desc">{tool.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
