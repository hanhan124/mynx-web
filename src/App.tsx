import { Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ToastContainer from "@/components/Toast";
import StatsWidget from "@/components/StatsWidget";
import Home from "@/pages/Home";
import { trackVisit } from "@/lib/stats-client";

const QpcrPage = lazy(() => import("@/pages/qPCR/QpcrPage"));
const TiffPage = lazy(() => import("@/pages/tiff/TiffPage"));
const InsightPage = lazy(() => import("@/pages/Insight/InsightPage"));

export default function App() {
  const location = useLocation();

  // 路由变化时上报访问
  useEffect(() => {
    void trackVisit(location.pathname);
  }, [location.pathname]);

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
      <StatsWidget />
    </div>
  );
}
