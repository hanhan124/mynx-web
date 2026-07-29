import { useState, useCallback, useRef } from "react";
import { IconBrain, IconFileSpreadsheet, IconKey, IconBolt, IconDownload } from "@tabler/icons-react";
import { showToast } from "@/components/Toast";
import * as XLSX from "xlsx";
import MarkdownView from "./markdown-view";
import { markdownToPrintableHtml } from "@/lib/report-print";
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

  const [userPrompt, setUserPrompt] = useState(DEFAULT_PROMPT);
  const [running, setRunning] = useState(false);
  const [agentLog, setAgentLog] = useState<string[]>([]);
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

      // 只提取关键列：Gene | Group_Name | Average | Stdev
      // 不传 Repeat1..N / Method 等冗余列，大幅省 token
      const header = data[0] as string[];
      const colGene = header.findIndex((h) => String(h).trim() === "Gene");
      const colGroup = header.findIndex((h) => String(h).trim() === "Group_Name");
      const colAvg = header.findIndex((h) => String(h).trim() === "Average");
      const colStdev = header.findIndex((h) => String(h).trim() === "Stdev");

      if (colGene < 0 || colAvg < 0) {
        // 没有 Summary 表结构，回退到全量传
        const lines = data.map((row) => `| ${row.map((c) => String(c ?? "").slice(0, 20)).join(" | ")} |`);
        const sep = `| ${data[0].map(() => "---").join(" | ")} |`;
        lines.splice(1, 0, sep);
        setMatrixMarkdown(lines.join("\n"));
      } else {
        // 构建精简矩阵
        const cols = ["Gene", "Group_Name", "Average", "Stdev"].map((h) => {
          if (h === "Gene") return colGene;
          if (h === "Group_Name") return colGroup >= 0 ? colGroup : -1;
          if (h === "Average") return colAvg;
          if (h === "Stdev") return colStdev >= 0 ? colStdev : -1;
          return -1;
        });
        const validCols = cols.filter((c) => c >= 0);
        const colNames = ["Gene", "Group_Name", "Average", "Stdev"].filter((_, i) => cols[i] >= 0);

        const mdLines = [`| ${colNames.join(" | ")} |`];
        mdLines.push(`| ${colNames.map(() => "---").join(" | ")} |`);
        for (let r = 1; r < data.length; r++) {
          const row = validCols.map((c) => {
            const v = data[r][c];
            if (v == null) return "";
            const n = typeof v === "number" ? Math.round(v * 10000) / 10000 : String(v);
            return String(n);
          });
          if (row.some((c) => c !== "")) mdLines.push(`| ${row.join(" | ")} |`);
        }
        setMatrixMarkdown(mdLines.join("\n"));
      }

      // 提取基因名
      if (colGene >= 0) {
        const geneSet = new Set<string>();
        for (let r = 1; r < data.length; r++) {
          const g = String(data[r][colGene] ?? "").trim();
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
    setAgentLog([]);
    setTaskId("");
    cancelledRef.current = false;

    try {
      const r = await runInsight(
        { matrixMarkdown, genes, method: "ref-normalized", userPrompt },
        (e: InsightEvent) => {
          switch (e.kind) {
            case "taskId": setTaskId(e.taskId); break;
            case "message":
              setAgentLog((prev) => [...prev, e.text]);
              break;
            case "error":
              setAgentLog((prev) => [...prev, `❌ ${e.text}`]);
              break;
            case "done":
              setAgentLog((prev) => [...prev, "✅ 报告生成完成"]);
              break;
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
      setAgentLog((prev) => [...prev, `❌ 失败: ${e instanceof Error ? e.message : String(e)}`]);
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
        <div className="card-title"><span className="step-num">1</span><span>分析需求</span></div>
        <div className="card-body">
          <div className="form-group">
            <label>一句话描述你想让 Agent 做什么</label>
            <textarea value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} rows={4} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--stroke)", background: "var(--bg-hover)", color: "var(--text-primary)", fontFamily: "var(--font)", fontSize: 14, resize: "vertical" }} />
          </div>
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

      {/* Agent 回复流 */}
      {(running || agentLog.length > 0) && (
        <div className="card">
          <div className="card-title">
            <span className="step-num">2</span>
            <span>{running ? "执行中" : "完成"}</span>
            {running && <div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2, marginLeft: "auto" }} />}
          </div>
          <div className="card-body">
            {taskId && <div className="meta">taskId: {taskId}</div>}
            <div style={{
              maxHeight: 280,
              overflowY: "auto",
              background: "var(--bg-hover)",
              borderRadius: 8,
              padding: 12,
              fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace",
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "var(--text-secondary)",
              WebkitOverflowScrolling: "touch",
            }}>
              {agentLog.length === 0 && <span style={{ color: "var(--text-tertiary)" }}>等待 Agent 响应...</span>}
              {agentLog.map((line, i) => (
                <div key={i} style={{
                  marginBottom: 4,
                  color: line.startsWith("❌") ? "var(--red)" : line.startsWith("✅") ? "var(--green)" : "var(--text-secondary)",
                }}>
                  {line}
                </div>
              ))}
            </div>
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
