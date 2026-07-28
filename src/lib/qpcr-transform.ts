import * as XLSX from "xlsx";
import type { WorkBook, WorkSheet, CellObject } from "xlsx";

/**
 * qPCR 原始数据转换：把「长表（Sample/Target/Ct 三列）」转成「宽表
 * （Num/Group/Gene... 每个基因一列）」，供 calculateQpcr 使用。
 *
 * 网页版：用 SheetJS（xlsx）替换 ExcelJS。逻辑保持不变；worksheet/workbook
 * 参数类型从 ExcelJS 改为 SheetJS。黄色填充/加粗表头作为样式元数据写入
 * （社区版 SheetJS 不序列化样式，但不影响计算结果）。
 */

const TARGET_HEADERS = ["Target", "Gene", "基因"];
const SAMPLE_HEADERS = ["Sample", "Group", "样本", "分组"];
const CT_HEADERS = ["Cq", "Ct"];

interface TransformResult {
  geneNames: string[];
}

// ── SheetJS cell helpers ──────────────────────────────────────────────────────

function cellValue(ws: WorkSheet, r1: number, c1: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 });
  const cell = ws[addr];
  return cell ? cell.v : undefined;
}

function sheetRange(ws: WorkSheet): { rowCount: number; colCount: number } {
  const ref = ws["!ref"];
  if (!ref) return { rowCount: 0, colCount: 0 };
  const range = XLSX.utils.decode_range(ref);
  return {
    rowCount: range.e.r - range.s.r + 1,
    colCount: range.e.c - range.s.c + 1,
  };
}

function sheetToAoa(ws: WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: undefined }) as unknown[][];
}

function detectColumn(headers: string[], keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]?.toString().trim().toLowerCase();
    if (h && keywords.some((k) => k.toLowerCase() === h)) return i;
  }
  return -1;
}

/**
 * Detects gene names from an existing "Transformed Data" sheet.
 * Returns empty array if the sheet doesn't exist (file not yet transformed).
 * Columns: 1=Num, 2=Group, 3+=gene names
 */
export function detectTransformedGenes(workbook: WorkBook): string[] {
  const sheet = workbook.Sheets["Transformed Data"];
  if (!sheet) return [];

  const { colCount } = sheetRange(sheet);
  const genes: string[] = [];
  for (let c = 3; c <= colCount; c++) {
    const name = String(cellValue(sheet, 1, c) ?? "").trim();
    if (name) genes.push(name);
  }
  return genes;
}

/**
 * Detects the distinct group names from an existing "Transformed Data" sheet,
 * preserving their first-seen order. Used to populate the control-group selector
 * for the "相对对照" (ΔΔCt) calculation method.
 * Column 2 (B) holds the group name for each row.
 */
export function detectTransformedGroups(workbook: WorkBook): string[] {
  const sheet = workbook.Sheets["Transformed Data"];
  if (!sheet) return [];

  const groups: string[] = [];
  const seen = new Set<string>();
  const { rowCount } = sheetRange(sheet);
  for (let r = 2; r <= rowCount; r++) {
    const name = String(cellValue(sheet, r, 2) ?? "").trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      groups.push(name);
    }
  }
  return groups;
}

export function transformQpcrData(sourceSheet: WorkSheet, targetWorkbook: WorkBook): TransformResult {
  const { colCount: srcColCount, rowCount: srcRowCount } = sheetRange(sourceSheet);

  const headers: string[] = [];
  for (let c = 1; c <= srcColCount; c++) {
    headers.push(String(cellValue(sourceSheet, 1, c) ?? ""));
  }

  let targetCol = detectColumn(headers, TARGET_HEADERS);
  let sampleCol = detectColumn(headers, SAMPLE_HEADERS);
  let ctCol = detectColumn(headers, CT_HEADERS);

  if (targetCol === -1 && headers.length >= 6) {
    const fallbackTarget = headers[2]?.toLowerCase() ?? "";
    if (
      fallbackTarget.includes("target") ||
      fallbackTarget.includes("gene") ||
      fallbackTarget.includes("基因")
    ) {
      targetCol = 2;
      sampleCol = 4;
      ctCol = 5;
    }
  }

  if (targetCol === -1) throw new Error("未找到 Target/Gene/基因 列");
  if (sampleCol === -1) throw new Error("未找到 Sample/Group/样本/分组 列");
  if (ctCol === -1) throw new Error("未找到 Cq/Ct 列");

  // 转换为 1 基列号
  const targetColIndex = targetCol + 1;
  const sampleColIndex = sampleCol + 1;
  const ctColIndex = ctCol + 1;

  // 创建数据结构：sample -> gene -> Cq 值数组
  const sampleMap = new Map<string, Map<string, Array<{ value: number | null; missing: boolean }>>>();
  const geneSet = new Set<string>();

  for (let r = 2; r <= srcRowCount; r++) {
    const gene = String(cellValue(sourceSheet, r, targetColIndex) ?? "").trim();
    const sample = String(cellValue(sourceSheet, r, sampleColIndex) ?? "").trim();
    const ctVal = cellValue(sourceSheet, r, ctColIndex);

    if (!gene || !sample) continue;

    let ct: number | null = null;
    let missing = false;
    if (typeof ctVal === "number") {
      ct = ctVal;
    } else {
      const parsed = parseFloat(String(ctVal));
      if (isNaN(parsed) || ctVal === "" || ctVal === null) {
        missing = true;
      } else {
        ct = parsed;
      }
    }

    geneSet.add(gene);
    if (!sampleMap.has(sample)) sampleMap.set(sample, new Map());
    const geneMap = sampleMap.get(sample)!;
    if (!geneMap.has(gene)) geneMap.set(gene, []);
    geneMap.get(gene)!.push({ value: ct, missing });
  }

  const geneNames = Array.from(geneSet);

  // 删除已存在的转换表
  const existingIdx = targetWorkbook.SheetNames.indexOf("Transformed Data");
  if (existingIdx >= 0) {
    targetWorkbook.SheetNames.splice(existingIdx, 1);
    delete targetWorkbook.Sheets["Transformed Data"];
  }

  // 构建输出 AOA
  const headerCells = ["Num", "Group", ...geneNames];
  const aoa: unknown[][] = [headerCells.slice()];

  const samples = Array.from(sampleMap.keys());
  let rowNum = 1;

  for (const sample of samples) {
    const geneMap = sampleMap.get(sample)!;

    const sampleMaxReps = Math.max(...Array.from(geneMap.values()).map((vals) => vals.length));

    for (let rep = 0; rep < sampleMaxReps; rep++) {
      rowNum++;
      const rowOut: unknown[] = new Array(headerCells.length).fill(undefined);
      rowOut[0] = rowNum - 1;
      rowOut[1] = sample;

      for (let g = 0; g < geneNames.length; g++) {
        const vals = geneMap.get(geneNames[g]);

        if (!vals || vals.length === 0) {
          rowOut[g + 2] = 50;
          continue;
        }

        const valid = vals.find((v) => !v.missing && v.value !== null);
        const item = vals[rep];
        if (item && !item.missing && item.value !== null) {
          rowOut[g + 2] = item.value;
        } else if (valid) {
          rowOut[g + 2] = valid.value;
        } else {
          rowOut[g + 2] = 50;
        }
      }
      aoa.push(rowOut);
    }
  }

  // 创建新的转换表
  const sheet = XLSX.utils.aoa_to_sheet(aoa);

  // 表头加粗
  for (let c = 0; c < headerCells.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = sheet[addr] as CellObject | undefined;
    if (cell) {
      cell.s = { font: { bold: true } } as unknown as CellObject["s"];
    }
  }

  // 自动调整列宽（基于 AOA 中每列最长字符串）
  const colWidths: number[] = [];
  for (let c = 0; c < headerCells.length; c++) {
    let maxLength = 0;
    for (let r = 0; r < aoa.length; r++) {
      const v = aoa[r]?.[c];
      const len = v == null ? 0 : String(v).length;
      if (len > maxLength) maxLength = len;
    }
    colWidths.push(Math.min(maxLength + 2, 30));
  }
  sheet["!cols"] = colWidths.map((w) => ({ wch: w }));

  targetWorkbook.Sheets["Transformed Data"] = sheet;
  targetWorkbook.SheetNames.push("Transformed Data");

  return { geneNames };
}

export { sheetToAoa };
