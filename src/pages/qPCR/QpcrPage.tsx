import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { IconDna, IconFileSpreadsheet } from "@tabler/icons-react";
import { showToast } from "@/components/Toast";
import LoadingOverlay from "@/components/LoadingOverlay";

export default function QpcrPage() {
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      setWorkbook(wb);
      setFileName(file.name);
      setSheetName(wb.SheetNames[0] ?? "");
      setResult("");
      showToast(`已读取 ${file.name}，共 ${wb.SheetNames.length} 个工作表`, "success");
    } catch (e) {
      showToast(`文件读取失败: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => /\.(xlsx|xls)$/i.test(f.name));
    if (file) void handleFile(file);
  }, [handleFile]);

  const handleCalculate = useCallback(() => {
    if (!workbook || !sheetName) {
      showToast("请先选择文件和工作表", "error");
      return;
    }
    setLoading(true);
    try {
      const ws = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      // 简单展示数据概览
      const rows = data.length;
      const cols = data[0]?.length ?? 0;
      const preview = data.slice(0, 10).map((r) => r.join("\t")).join("\n");
      setResult(`工作表 ${sheetName}：${rows} 行 × ${cols} 列\n\n前 10 行预览：\n${preview}`);
      showToast("数据解析完成", "success");
    } catch (e) {
      showToast(`解析失败: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [workbook, sheetName]);

  const handleDownload = useCallback(() => {
    if (!workbook) return;
    XLSX.writeFile(workbook, fileName || "result.xlsx");
    showToast("文件已下载", "success");
  }, [workbook, fileName]);

  return (
    <div className="page-shell">
      <LoadingOverlay visible={loading} text="处理中..." />
      <div className="panel-header">
        <div className="panel-icon" style={{ background: "#007aff" }}>
          <IconDna size={18} color="white" stroke={1.75} />
        </div>
        <div className="panel-title">
          <h2>qPCR 分析</h2>
          <p>上传 Excel，解析数据结构</p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <IconFileSpreadsheet size={14} stroke={1.75} />
          <span>数据文件</span>
        </div>
        <div className="card-body">
          <div
            className="file-drop"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("qpcr-file-input")?.click()}
          >
            <input
              id="qpcr-file-input"
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <div className="file-drop-icon">📄</div>
            <div className="file-drop-text">{fileName || "拖拽 xlsx 文件到这里，或点击选择"}</div>
            <div className="file-drop-hint">支持 .xlsx / .xls</div>
          </div>
          {workbook && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>工作表</label>
              <select value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
                {workbook.SheetNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          )}
          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleCalculate} disabled={!workbook}>
              解析数据
            </button>
            <button className="btn" onClick={handleDownload} disabled={!workbook}>
              下载
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="card">
          <div className="card-title"><span>数据预览</span></div>
          <div className="card-body">
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, overflowX: "auto" }}>{result}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
