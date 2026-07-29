import { useState, useCallback, useRef } from "react";
import { IconBrain, IconFileSpreadsheet, IconKey, IconBolt, IconDownload, IconFlask } from "@tabler/icons-react";
import { showToast } from "@/components/Toast";
import LoadingOverlay from "@/components/LoadingOverlay";
import * as XLSX from "xlsx";
import MarkdownView from "./markdown-view";
import { markdownToPrintableHtml } from "@/lib/report-print";
import { BIO_TEMPLATES, SAMPLE_DATA, SAMPLE_GENES, type BioTemplate } from "@/lib/bio-templates";
import {
  getApiKeyStatus,
  setApiKey,
  clearApiKey,
  testConnection,
  runInsight,
  downloadTaskFile,
  exportPdf,
  type InsightEvent,
  type InsightResult,
} from "@/lib/infini-client";

const DEFAULT_PROMPT =
  "请基于以上 qPCR 数据，对各基因在组间的表达差异做生物学解读，指出显著上调/下调的基因，并结合公开文献给出可能的调控方向与后续实验建议。";

export default function InsightPage() {
  const [keyInput, setKeyInput] = useState("");
  const [keyStatus, setKeyStatus] = useState(getApiKeyStatus());
  const [testing, setTesting] = useState(false);
  const [testDetail, setTestDetail] = useState("");

  const [fileName, setFileName] = useState("");
  const [matrixMarkdown, setMatrixMarkdown] = useState("");
  const [genes, setGenes] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<BioTemplate>(BIO_TEMPLATES[0]);

  // 加载示例数据（评委不用准备文件也能体验）
  const handleLoadSample = useCallback(() => {
    setMatrixMarkdown(SAMPLE_DATA);
    setGenes(SAMPLE_GENES);
    setFileName("示例数据（凋亡+EMT 7 基因）");
    setResult(null);
    showToast("已加载示例数据", "success");
  }, []);

  const [userPrompt, setUserPrompt] = useState(DEFAULT_PROMPT);
  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [taskId, setTaskId] = useState("");
  const [result, setResult] = useState<InsightResult | null>(null);
  const cancelledRef = useRef(false);

  const handleSaveKey = useCallback(() => {
    if (!keyInput.trim()) {
      showToast("请输入 API Key", "error");
      return;
    }
    setApiKey(keyInput.trim());
    setKeyStatus(getApiKeyStatus());
    setKeyInput("");
    showToast("API Key 已保存", "success");
  }, [keyInput]);

  const handleClearKey = useCallback(() => {
    clearApiKey();
    setKeyStatus(getApiKeyStatus());
    showToast("已清除 API Key", "info");
  }, []);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestDetail("");
    try {
      const r = await testConnection();
      setTestDetail(r.detail);
      showToast(r.detail, r.ok ? "success" : "error");
    } catch (e) {
      setTestDetail(String(e));
      showToast(`测试失败: ${e}`, "error");
    } finally {
      setTesting(false);
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames.find((n) => n === "Summary_All_Genes") ?? wb.SheetNames[0];
      if (!sheetName) throw new Error("未找到工作表");
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      if (data.length < 2) throw new Error("数据为空");

      // 构建 Markdown 表
      const lines = data.map((row) => `| ${row.map((c) => String(c ?? "")).join(" | ")} |`);
      const sep = `| ${data[0].map(() => "---").join(" | ")} |`;
      lines.splice(1, 0, sep);
      setMatrixMarkdown(lines.join("\n"));

      // 提取基因名（Gene 列）
      const header = data[0] as string[];
      const geneCol = header.findIndex((h) => String(h).trim() === "Gene");
      if (geneCol >= 0) {
        const geneSet = new Set<string>();
        for (let r = 1; r < data.length; r++) {
          const g = String(data[r][geneCol] ?? "").trim();
          if (g) geneSet.add(g);
        }
        setGenes([...geneSet]);
      }

      setFileName(file.name);
      setResult(null);
      showToast(`已解析 ${genes.length || ""} 个基因`, "success");
    } catch (e) {
      showToast(`文件解析失败: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }, [genes.length]);

  const handleRun = useCallback(async () => {
    if (!matrixMarkdown) {
      showToast("请先选择含 qPCR 结果的 Excel 文件", "error");
      return;
    }
    if (!keyStatus.configured) {
      showToast("请先保存 API Key", "error");
      return;
    }
    setRunning(true);
    setResult(null);
    setStatusMsg("连接 Agent 中...");
    setTaskId("");
    cancelledRef.current = false;

    try {
      const effectivePrompt = selectedTemplate.prompt || userPrompt;
      const r = await runInsight(
        { matrixMarkdown, genes, method: "ref-normalized", userPrompt: effectivePrompt },
        (e: InsightEvent) => {
          switch (e.kind) {
            case "taskId": setTaskId(e.taskId); break;
            case "status": setStatusMsg(e.text); break;
            case "error": setStatusMsg(e.text); break;
            case "done": setStatusMsg("报告生成完成"); break;
          }
        },
        () => cancelledRef.current,
      );
      setResult(r);
      // 暂存 Markdown 报告到 IndexedDB
      if (r.reportMarkdown) {
        const { saveFile } = await import("@/lib/storage");
        await saveFile(`report-${r.taskId}.md`, "markdown", new Blob([r.reportMarkdown], { type: "text/markdown" }));
      }
      showToast("报告生成完成，已暂存", "success");
    } catch (e) {
      showToast(`解读失败: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setRunning(false);
    }
  }, [matrixMarkdown, genes, keyStatus.configured, userPrompt]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    showToast("已请求取消", "info");
  }, []);

  const handleExportPdf = useCallback(async () => {
    if (!result?.reportMarkdown) return;
    try {
      await exportPdf(markdownToPrintableHtml(result.reportMarkdown));
      showToast("PDF 打印窗口已打开", "success");
    } catch (e) {
      showToast(`PDF 导出失败: ${e}`, "error");
    }
  }, [result]);

  return (
    <div className="page-shell">
      <LoadingOverlay visible={running} text={statusMsg} />
      <div className="panel-header">
        <div className="panel-icon" style={{ background: "#af52de" }}>
          <IconBrain size={18} color="white" stroke={1.75} />
        </div>
        <div className="panel-title">
          <h2>AI 解读</h2>
          <p>qPCR 结果交给 InfiniSynapse 做生物学解读</p>
        </div>
      </div>

      {/* API Key 配置 */}
      <div className="card">
        <div className="card-title">
          <IconKey size={14} stroke={1.75} />
          <span>InfiniSynapse API Key</span>
        </div>
        <div className="card-body">
          {keyStatus.configured ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
              <span>已配置</span>
              <button className="btn" onClick={handleTest} disabled={testing} style={{ fontSize: 12 }}>
                <IconBolt size={13} stroke={2} /> {testing ? "测试中..." : "测试连通"}
              </button>
              <button className="btn" onClick={handleClearKey} style={{ fontSize: 12, color: "var(--red)" }}>
                清除
              </button>
              {testDetail && <div style={{ width: "100%", fontSize: 12, color: testDetail.includes("成功") ? "var(--green)" : "var(--red)" }}>{testDetail}</div>}
            </div>
          ) : (
            <div>
              <div className="form-group">
                <input type="password" value={keyInput} placeholder="Bearer token" onChange={(e) => setKeyInput(e.target.value)} />
              </div>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={handleSaveKey}>保存</button>
              </div>
              <p className="hint">
                在 <a href="https://app.infinisynapse.cn/tasks" target="_blank" rel="noreferrer">InfiniSynapse 控制台</a> → 设置 → API Key Management 创建。Key 仅保存在浏览器本地。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 数据源 */}
      <div className="card">
        <div className="card-title">
          <IconFileSpreadsheet size={14} stroke={1.75} />
          <span>qPCR 结果文件</span>
        </div>
        <div className="card-body">
          <div
            className="file-drop"
            onDrop={(e) => { e.preventDefault(); const f = Array.from(e.dataTransfer.files).find((f) => /\.(xlsx|xls)$/i.test(f.name)); if (f) void handleFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("insight-file-input")?.click()}
          >
            <input id="insight-file-input" type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
            <div className="file-drop-icon">📄</div>
            <div className="file-drop-text">{fileName || "选择含 Summary_All_Genes 的 xlsx"}</div>
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn" style={{ fontSize: 12 }} onClick={handleLoadSample}>
              <IconFlask size={14} stroke={2} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              加载示例数据
            </button>
          </div>
          {matrixMarkdown && (
            <div style={{ marginTop: 12 }}>
              <div className="meta">{genes.length} 个基因</div>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, maxHeight: 200, overflow: "auto", background: "var(--bg-hover)", padding: 8, borderRadius: 6 }}>{matrixMarkdown.slice(0, 500)}...</pre>
            </div>
          )}
        </div>
      </div>

      {/* 运行 */}
      <div className="card">
        <div className="card-title"><span className="step-num">1</span><span>分析模板</span></div>
        <div className="card-body">
          <div className="form-group">
            <label>选择分析方向</label>
            <select
              value={selectedTemplate.id}
              onChange={(e) => {
                const t = BIO_TEMPLATES.find((t) => t.id === e.target.value);
                if (t) setSelectedTemplate(t);
              }}
            >
              {BIO_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.label} — {t.description}</option>
              ))}
            </select>
          </div>
          {selectedTemplate.id === "custom" && (
            <div className="form-group">
              <label>自定义分析需求</label>
              <textarea value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} rows={4} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--stroke)", background: "var(--bg-hover)", color: "var(--text-primary)", fontFamily: "var(--font)", fontSize: 14, resize: "vertical" }} />
            </div>
          )}
          {selectedTemplate.id !== "custom" && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              {selectedTemplate.description}
            </p>
          )}
          <div className="btn-row">
            {!running ? (
              <button className="btn btn-primary btn-full" onClick={handleRun} disabled={!matrixMarkdown || !keyStatus.configured}>
                开始解读
              </button>
            ) : (
              <button className="btn btn-full" style={{ color: "var(--red)" }} onClick={handleCancel}>
                取消任务
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 状态 */}
      {(running || result || statusMsg) && (
        <div className="card">
          <div className="card-title"><span className="step-num">2</span><span>{running ? "执行中" : "完成"}</span></div>
          <div className="card-body">
            {taskId && <div className="meta">taskId: {taskId}</div>}
            <div style={{ padding: 10, background: "var(--bg-hover)", borderRadius: 6, fontSize: 14 }}>{statusMsg || "等待..."}</div>
          </div>
        </div>
      )}

      {/* 报告 */}
      {result?.reportMarkdown && (
        <div className="card">
          <div className="card-title"><span className="step-num">3</span><span>解读报告</span></div>
          <div className="card-body">
            <div className="btn-row">
              <button className="btn btn-primary" onClick={handleExportPdf}>
                <IconDownload size={15} stroke={2} /> 导出 PDF
              </button>
              {result.mdFile && (
                <button className="btn" onClick={() => downloadTaskFile(result.taskId, result.mdFile!)}>
                  <IconDownload size={15} stroke={2} /> 下载 MD
                </button>
              )}
              {result.pdfFile && (
                <button className="btn" onClick={() => downloadTaskFile(result.taskId, result.pdfFile!)}>
                  <IconDownload size={15} stroke={2} /> 下载 Agent PDF
                </button>
              )}
            </div>
            <MarkdownView content={result.reportMarkdown} />
          </div>
        </div>
      )}
    </div>
  );
}
