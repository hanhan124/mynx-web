/**
 * InfiniSynapse 网页版客户端 —— 直接在浏览器中调用 InfiniSynapse API。
 * API Key 存 localStorage，不经过任何服务端代理（避免 Vercel Function 超时）。
 * 使用 fetch + ReadableStream 处理 SSE。
 *
 * 与桌面端（经 Rust 后端代理 + Tauri 事件）的对应关系：
 * - API Key / server 地址存 localStorage，不再走 Rust 后端。
 * - 进度通过 fetch + ReadableStream 解析 SSE，经 onEvent 回调实时推给 UI。
 * - 顺序严格遵循「先 SSE 后 newTask」（与 Rust 侧 infini.rs 一致）。
 * 服务地址默认国内 .cn，可经设置页覆盖。
 */

import { useEffect, useRef } from "react";

const STORAGE_KEY = "mynx_infini_config";
const DEFAULT_SERVER = "https://app.infinisynapse.cn";

function loadConfig(): { apiKey: string; server: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      return { apiKey: typeof obj.apiKey === "string" ? obj.apiKey : "", server: typeof obj.server === "string" ? obj.server : DEFAULT_SERVER };
    }
  } catch { /* ignore */ }
  return { apiKey: "", server: DEFAULT_SERVER };
}

function saveConfig(cfg: { apiKey: string; server: string }): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export interface ApiKeyStatus { configured: boolean; server: string; }
export interface ConnectionTest { ok: boolean; code: number; detail: string; server: string; }
export interface InsightPayload { matrixMarkdown: string; genes: string[]; method: string; controlGroup?: string; userPrompt: string; }
export interface InsightResult { taskId: string; reportMarkdown: string | null; pdfFile: string | null; mdFile: string | null; files: string[]; }
export type InsightEvent = { kind: "taskId"; taskId: string } | { kind: "status"; text: string } | { kind: "error"; text: string } | { kind: "done" } | { kind: "cancelled" };

export function getApiKeyStatus(): ApiKeyStatus {
  const cfg = loadConfig();
  return { configured: cfg.apiKey.trim().length > 0, server: cfg.server };
}
export function setApiKey(apiKey: string, server?: string): void {
  const cfg = loadConfig();
  cfg.apiKey = apiKey.trim();
  if (server && server.trim()) cfg.server = server.trim();
  saveConfig(cfg);
}
export function clearApiKey(): void {
  const cfg = loadConfig();
  cfg.apiKey = "";
  saveConfig(cfg);
}

export async function testConnection(): Promise<ConnectionTest> {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new Error("尚未配置 API Key");
  const base = cfg.server.replace(/\/$/, "");
  const resp = await fetch(`${base}/api/ai_task/list?page=1&pageSize=1`, { headers: { Authorization: `Bearer ${cfg.apiKey}`, "x-lang": "zh_CN" } });
  const body = await resp.json().catch(() => null);
  const code = body?.code ?? -1;
  const message = body?.message ?? "";
  const ok = code === 200;
  let detail: string;
  if (ok) detail = `连接成功 (code=200, ${message})`;
  else if (code === 1101 || code === 1105) detail = `API Key 无效或已过期 (code=${code})`;
  else if (code === 500) detail = "服务器拒绝请求，API Key 可能无效或已过期";
  else if (code === -1) detail = `服务器返回 HTTP ${resp.status}`;
  else detail = `服务器返回 code=${code}, message=${message}`;
  return { ok, code, detail, server: base };
}

function buildPrompt(payload: InsightPayload): string {
  const methodLabel = payload.method === "control-relative" ? `Control-relative (ΔΔCt), 对照组: ${payload.controlGroup ?? "(未指定)"}` : payload.method;
  return `## 执行要求\n\n用户需要尽快得到报告。请立即分析并直接执行，不要在对话中输出长篇推理、思考过程或报告正文。\n使用 write_to_file 工具把完整报告写入工作区的 \`report.md\`，写完后立即用 attempt_completion 结束。\n不要尝试生成 PDF、探测字体或执行额外的 PDF 转换。\n\n## 报告结构\n\n1. **数据概览**\n2. **差异基因分析**\n3. **生物学解读**\n4. **后续实验建议**\n\n## qPCR 基因表达数据\n\n- 计算方法: ${methodLabel}\n- 目标基因: ${payload.genes.join(", ")}\n\n### 数据矩阵\n\n${payload.matrixMarkdown}\n\n## 用户额外需求\n\n${payload.userPrompt}`;
}

export async function runInsight(payload: InsightPayload, onEvent: (e: InsightEvent) => void, isCancelled: () => boolean): Promise<InsightResult> {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new Error("尚未配置 API Key");
  const base = cfg.server.replace(/\/$/, "");
  const apiKey = cfg.apiKey;
  const connId = crypto.randomUUID();

  onEvent({ kind: "status", text: "连接 Agent 中..." });
  const sseResp = await fetch(`${base}/api/ai/events?connId=${connId}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "text/event-stream", "x-lang": "zh_CN" } });
  if (!sseResp.ok) throw new Error(`SSE 连接失败 (${sseResp.status})`);

  onEvent({ kind: "status", text: "发送分析任务..." });
  const taskResp = await fetch(`${base}/api/ai/message`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "x-lang": "zh_CN" },
    body: JSON.stringify({ type: "newTask", text: buildPrompt(payload), connId, chatSettings: { mode: "act" }, autoApprovalSettings: { enabled: true, maxRequests: 1000, maxSubAgentRequests: 500 } }),
  });
  if (!taskResp.ok) throw new Error(`发送任务失败 (${taskResp.status})`);
  await taskResp.json().catch(() => null);

  onEvent({ kind: "status", text: "Agent 正在生成报告..." });
  const reader = sseResp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "", taskId = "", done = false, errorMsg = "";

  while (true) {
    if (isCancelled()) {
      onEvent({ kind: "cancelled" });
      if (taskId) fetch(`${base}/api/ai_task/cancelTask?taskId=${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => {});
      throw new Error("用户已取消");
    }
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx < 0) break;
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let eventType = "", data = "";
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data || data === "ping") continue;
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(data) as Record<string, unknown>; } catch { continue; }
      const tid = parsed.taskId;
      if (!taskId && typeof tid === "string") { taskId = tid; onEvent({ kind: "taskId", taskId }); }
      if (eventType === "message.add" || eventType === "message.partial" || eventType === "message.update") {
        const msg = parsed.message as Record<string, unknown> | undefined;
        if (!msg) continue;
        if (((msg.type as string) ?? "") === "ask" && ((msg.ask as string) ?? "") === "completion_result") { done = true; break; }
      } else if (eventType === "notification") {
        if (parsed.type === "error") { errorMsg = (parsed.message as string) ?? "任务失败"; break; }
      }
    }
    if (done || errorMsg) break;
  }

  if (errorMsg) { onEvent({ kind: "error", text: errorMsg }); throw new Error(errorMsg); }
  if (!taskId) throw new Error("未收到 taskId");

  onEvent({ kind: "status", text: "读取报告..." });
  const wsResp = await fetch(`${base}/api/ai_task/getTaskWorkspace/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const wsBody = await wsResp.json().catch(() => null);
  const files: string[] = wsBody?.data?.files ?? [];
  const pdfFile = files.find((f: string) => f === "report.pdf") ?? files.find((f: string) => f.endsWith(".pdf")) ?? null;
  const mdFile = files.find((f: string) => f === "report.md") ?? files.find((f: string) => f.endsWith(".md")) ?? null;

  let reportMarkdown: string | null = null;
  if (mdFile) {
    const previewResp = await fetch(`${base}/api/ai_task/previewFile`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ taskId, fileName: mdFile }) });
    const pvBody = await previewResp.json().catch(() => null);
    reportMarkdown = pvBody?.data?.content ?? pvBody?.data ?? null;
  }

  onEvent({ kind: "done" });
  return { taskId, reportMarkdown, pdfFile, mdFile, files };
}

export async function downloadTaskFile(taskId: string, fileName: string): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new Error("尚未配置 API Key");
  const base = cfg.server.replace(/\/$/, "");
  const resp = await fetch(`${base}/api/tools/storage/downloadTaskFile/${taskId}?path=${fileName}`, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
  if (!resp.ok) throw new Error(`下载失败 (${resp.status})`);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPdf(html: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
  await new Promise((resolve) => {
    iframe.onload = resolve;
  });
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

