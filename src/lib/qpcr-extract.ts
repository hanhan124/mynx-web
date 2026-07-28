import type ExcelJS from "exceljs";

/**
 * 从 qPCR 计算结果中抽取「基因×组×表达量」矩阵，供 InfiniSynapse Agent 解读。
 * 读取 `Summary_All_Genes` sheet（由 `calculateQpcr` 写入）。
 * 不修改原 workbook，只读。
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

/** 抽取矩阵。workbook 必须已含 `Summary_All_Genes` sheet（即 qPCR 已计算）。 */
export function extractInsightMatrix(workbook: ExcelJS.Workbook): ExtractedMatrix {
  const sheet = workbook.getWorksheet(SUMMARY_SHEET);
  if (!sheet) {
    throw new Error(`未找到 ${SUMMARY_SHEET} 工作表，请先完成 qPCR 计算`);
  }
  if (sheet.rowCount < 2) {
    throw new Error(`${SUMMARY_SHEET} 没有数据行`);
  }

  const headerRow = sheet.getRow(1);
  const colCount = sheet.columnCount;
  const headers: string[] = [];
  for (let c = 1; c <= colCount; c++) {
    const h = cellText(headerRow.getCell(c).value);
    if (!h) break;
    headers.push(h);
  }
  if (headers.length === 0) {
    throw new Error(`${SUMMARY_SHEET} 表头为空`);
  }

  const geneCol = headers.indexOf("Gene") + 1;
  const methodCol = headers.indexOf("Method") + 1;
  if (geneCol === 0) {
    throw new Error(`${SUMMARY_SHEET} 缺少 Gene 列`);
  }

  // 找最后一个有数据的行
  let lastDataRow = sheet.rowCount;
  for (let r = sheet.rowCount; r >= 2; r--) {
    if (cellText(sheet.getRow(r).getCell(geneCol).value)) {
      lastDataRow = r;
      break;
    }
  }

  const lines: string[] = [];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  const genes: string[] = [];
  const seen = new Set<string>();
  let methodNote: string | null = null;

  for (let r = 2; r <= lastDataRow; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= headers.length; c++) {
      cells.push(cellText(row.getCell(c).value).replace(/\|/g, "\\|"));
    }
    if (cells.every((c) => c === "")) continue;
    lines.push(`| ${cells.join(" | ")} |`);

    const gene = cells[geneCol - 1];
    if (gene && !seen.has(gene)) {
      seen.add(gene);
      genes.push(gene);
    }
    if (methodNote === null && methodCol > 0) {
      const m = cells[methodCol - 1];
      if (m) methodNote = m;
    }
  }

  return {
    markdown: lines.join("\n"),
    genes,
    methodNote,
    rows: lastDataRow - 1,
  };
}

/** 判断 workbook 是否已具备可解读的 qPCR 结果。 */
export function hasInsightData(workbook: ExcelJS.Workbook): boolean {
  const sheet = workbook.getWorksheet(SUMMARY_SHEET);
  return !!sheet && sheet.rowCount >= 2;
}
