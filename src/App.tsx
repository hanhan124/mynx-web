import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import ToastContainer from "@/components/Toast";
import Home from "@/pages/Home";

const QpcrPage = lazy(() => import("@/pages/qPCR/QpcrPage"));
const TiffPage = lazy(() => import("@/pages/tiff/TiffPage"));
const InsightPage = lazy(() => import("@/pages/Insight/InsightPage"));

export default function App() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="page-container">
        <Suspense fallback={<div className="page-loading">加载中…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/qpcr" element={<QpcrPage />} />
            <Route path="/tiff" element={<TiffPage />} />
            <Route path="/insight" element={<InsightPage />} />
          </Routes>
        </Suspense>
      </main>
      <ToastContainer />
    </div>
  );
}
