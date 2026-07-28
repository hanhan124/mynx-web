import type { WorkBook, WorkSheet } from "xlsx";
import * as XLSX from "xlsx";

/**
 * 从 qPCR 计算结果中抽取「基因×组×表达量」矩阵，供 InfiniSynapse Agent 解读。
 * 读取 `Summary_All_Genes` sheet（由 `calculateQpcr` 写入）。
 * 不修改原 workbook，只读。
 *
 * 网页版：workbook 参数类型从 ExcelJS.Workbook 改为 SheetJS WorkBook，
 * 用 `XLSX.utils.sheet_to_json(ws, {header:1})` 读取。
 */

export interface ExtractedMatrix {
  /** Markdown 表（含表头） */
  markdown: string;
  /** 出现过的目标基因名（去重，保持顺序） */
  genes: string[];
  /** 计算方法备注（取自 Method 列首条） */
  methodNote: string | null;
  /** 行数（不含表头） */
  rows: number;
}

const SUMMARY_SHEET = "Summary_All_Genes";

function cellText(val: unknown): string {
  if (val == null || val === "") return "";
  if (typeof val === "number") {
    // 表达量保留 4 位有效精度
    return Number.isFinite(val) ? String(Math.round(val * 10000) / 10000) : "N/A";
  }
  return String(val).trim();
}

/** 把工作表读成 AOA（二维数组）。 */
function sheetToAoa(ws: WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: undefined }) as unknown[][];
}

/** 抽取矩阵。workbook 必须已含 `Summary_All_Genes` sheet（即 qPCR 已计算）。 */
export function extractInsightMatrix(workbook: WorkBook): ExtractedMatrix {
  const sheet = workbook.Sheets[SUMMARY_SHEET];
  if (!sheet) {
    throw new Error(`未找到 ${SUMMARY_SHEET} 工作表，请先完成 qPCR 计算`);
  }

  const aoa = sheetToAoa(sheet);
  if (aoa.length < 2) {
    throw new Error(`${SUMMARY_SHEET} 没有数据行`);
  }

  const headers: string[] = [];
  const headerRow = aoa[0] ?? [];
  for (const h of headerRow) {
    const text = cellText(h);
    if (!text) break;
    headers.push(text);
  }
  if (headers.length === 0) {
    throw new Error(`${SUMMARY_SHEET} 表头为空`);
  }

  const geneCol0 = headers.indexOf("Gene"); // 0-based
  const methodCol0 = headers.indexOf("Method");
  if (geneCol0 === -1) {
    throw new Error(`${SUMMARY_SHEET} 缺少 Gene 列`);
  }

  // 找最后一个有数据的行
  let lastDataRow0 = aoa.length - 1; // 0-based index of last row
  for (let r = aoa.length - 1; r >= 1; r--) {
    if (cellText(aoa[r]?.[geneCol0])) {
      lastDataRow0 = r;
      break;
    }
  }

  const lines: string[] = [];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  const genes: string[] = [];
  const seen = new Set<string>();
  let methodNote: string | null = null;

  for (let r = 1; r <= lastDataRow0; r++) {
    const row = aoa[r] ?? [];
    const cells: string[] = [];
    for (let c = 0; c < headers.length; c++) {
      cells.push(cellText(row[c]).replace(/\|/g, "\\|"));
    }
    if (cells.every((c) => c === "")) continue;
    lines.push(`| ${cells.join(" | ")} |`);

    const gene = cells[geneCol0];
    if (gene && !seen.has(gene)) {
      seen.add(gene);
      genes.push(gene);
    }
    if (methodNote === null && methodCol0 >= 0) {
      const m = cells[methodCol0];
      if (m) methodNote = m;
    }
  }

  return {
    markdown: lines.join("\n"),
    genes,
    methodNote,
    rows: lastDataRow0, // 行数（不含表头）= 最后一个 1-based 行号 - 1 = lastDataRow0
  };
}

/** 判断 workbook 是否已具备可解读的 qPCR 结果。 */
export function hasInsightData(workbook: WorkBook): boolean {
  const sheet = workbook.Sheets[SUMMARY_SHEET];
  if (!sheet) return false;
  const aoa = sheetToAoa(sheet);
  return aoa.length >= 2;
}
