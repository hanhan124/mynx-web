import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import ToastContainer from "@/components/Toast";
import Home from "@/pages/Home";

const QpcrPage = lazy(() => import("@/pages/qPCR/QpcrPage"));
const TiffPage = lazy(() => import("@/pages/tiff/TiffPage"));
const InsightPage = lazy(() => import("@/pages/Insight/InsightPage"));

/**
 * 网页版布局：与桌面端 App.tsx 保持一致的 DOM 结构，仅省略 TitleBar
 * 与 UpdateNotification（这两者是 Tauri 桌面专属）。
 *
 * 桌面端结构：
 *   .app-layout (column flex)
 *     .title-bar            ← 网页版无
 *     .app-body (row flex, flex:1)
 *       .sidebar
 *       .app-main (flex:1, overflow-y:auto)
 *         Routes
 *
 * 网页版沿用 .app-body + .app-main，使 layout.css 的滚动/弹性规则直接生效，
 * 不依赖 TitleBar。body { overflow: hidden } 由 .app-main 负责内容滚动。
 */
export default function App() {
  return (
    <div className="app-layout">
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <Suspense fallback={<div className="page-loading">加载中…</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/qpcr" element={<QpcrPage />} />
              <Route path="/tiff" element={<TiffPage />} />
              <Route path="/insight" element={<InsightPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
