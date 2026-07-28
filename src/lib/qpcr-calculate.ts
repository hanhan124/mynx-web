import * as XLSX from "xlsx";
import type { WorkBook, WorkSheet, CellObject } from "xlsx";

/**
 * qPCR 相对定量计算 — 完全参照 VBA 宏 (2.caculate.txt)
 *
 * 网页版：用 SheetJS（xlsx）替换原 ExcelJS。计算逻辑（2^-ΔCt、sampleStdev、
 * parseNumber）保持不变；worksheet/workbook 参数类型从 ExcelJS 改为 SheetJS。
 */

const PROTECTED_SHEETS = new Set(["Transformed Data", "Summary_All_Genes", "Sheet1"]);

/**
 * qPCR 计算方法（原 "mode"）。
 *  - 'ref-normalized'     相对内参：每个样本 2^-(ΔCt) = 2^-(target - ref)。默认方法。
 *  - 'control-relative'   相对对照：在相对内参基础上，再除以对照组(control)的平均值，
 *                         使对照组归一化表达量约等于 1，其余组为相对倍数（标准 ΔΔCt）。
 */
export type CalcMethod = "ref-normalized" | "control-relative";

/** 计算方法的中文标签，用于界面显示。 */
export const CALC_METHOD_LABELS: Record<CalcMethod, string> = {
  "ref-normalized": "相对内参",
  "control-relative": "相对对照",
};

/** 计算方法的英文标签，用于写入 Excel 以标注结果来源（Excel 内容保持纯英文）。 */
export const CALC_METHOD_LABELS_EN: Record<CalcMethod, string> = {
  "ref-normalized": "Reference-normalized",
  "control-relative": "Control-relative (ΔΔCt)",
};

export interface CalcOptions {
  method?: CalcMethod;
  /** method 为 'control-relative' 时必填：作为对照的组名。 */
  controlGroup?: string;
}

// ── SheetJS cell helpers ──────────────────────────────────────────────────────

/** 取单元格值（SheetJS cell）。null / undefined / 空 cell 返回 undefined。 */
function cellValue(ws: WorkSheet, r1: number, c1: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 });
  const cell = ws[addr];
  return cell ? cell.v : undefined;
}

/** 写入单元格值（含可选加粗）。直接操作 sheet 的 cell 对象。 */
function setCell(ws: WorkSheet, r1: number, c1: number, value: unknown, bold = false): void {
  const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 });
  if (value === undefined || value === null) {
    delete ws[addr];
    return;
  }
  const cell: CellObject = {
    t: typeof value === "number" ? "n" : "s",
    v: value as string | number | boolean | Date,
  };
  if (bold) {
    // 样式写入：社区版 SheetJS（0.18.x）不会把样式序列化到 .xlsx，
    // 但保留样式对象作为元数据，便于将来切换到 pro 版或导出兼容。
    cell.s = { font: { bold: true } } as unknown as CellObject["s"];
  }
  ws[addr] = cell;
}

/** 工作表有效范围（rows/cols）。SheetJS 以 '!ref' 记录。 */
function sheetRange(ws: WorkSheet): { rowCount: number; colCount: number } {
  const ref = ws["!ref"];
  if (!ref) return { rowCount: 0, colCount: 0 };
  const range = XLSX.utils.decode_range(ref);
  return {
    rowCount: range.e.r - range.s.r + 1,
    colCount: range.e.c - range.s.c + 1,
  };
}

/** 在工作表中查找指定列名（基于第 1 行）。返回 1-based 列号。 */
function findColumn(ws: WorkSheet, name: string): number {
  const { colCount } = sheetRange(ws);
  for (let c = 1; c <= colCount; c++) {
    if (String(cellValue(ws, 1, c) ?? "").trim() === name) return c;
  }
  throw new Error("Column " + name + " not found");
}

/** 把工作表转换为 AOA（保留所有单元格，空位为 undefined）。 */
function sheetToAoa(ws: WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: undefined }) as unknown[][];
}

/** 从 AOA 重建 sheet 并保留列宽（如提供）。 */
function aoaToSheet(aoa: unknown[][], colWidths?: number[]): WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (colWidths && colWidths.length > 0) {
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  }
  return ws;
}

/** 清空工作表：返回空 sheet（仅保留 '!ref' 等元信息清掉）。 */
function clearSheet(): WorkSheet {
  // 空表：用一个空 AOA 创建，再删掉唯一的占位 cell，保留为完全空 sheet。
  const ws = XLSX.utils.aoa_to_sheet([[]]);
  delete ws.A1;
  delete ws["!ref"];
  return ws;
}

// ── 计算辅助 ──────────────────────────────────────────────────────────────────

function sampleStdev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function parseNumber(val: unknown): number {
  if (val == null) return NaN;
  if (typeof val === "number") return val;
  const parsed = parseFloat(String(val).trim());
  return isNaN(parsed) ? NaN : parsed;
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

export function calculateQpcr(
  workbook: WorkBook,
  repeatCount: number,
  refGene: string,
  options: CalcOptions = {}
): void {
  const method: CalcMethod = options.method ?? "ref-normalized";
  const controlGroup = (options.controlGroup ?? "").trim();
  if (method === "control-relative" && !controlGroup) {
    throw new Error("相对对照方法需要指定对照组");
  }

  const sourceSheetName = "Transformed Data";
  const sourceSheet = workbook.Sheets[sourceSheetName];
  if (!sourceSheet) throw new Error("Transformed Data sheet not found");
  const { colCount } = sheetRange(sourceSheet);

  // Collect all gene columns starting from c=3 (column C). Columns A=Num, B=Group are skipped.
  // Must match detectTransformedGenes() in qpcr-transform.ts which also starts from c=3.
  // (Previously started from c=4, which silently dropped any gene written to column C — e.g.
  //  TBP, when the source data had it as an extra reference gene.)
  const geneNames: string[] = [];
  for (let c = 3; c <= colCount; c++) {
    const name = String(cellValue(sourceSheet, 1, c) ?? "").trim();
    if (name && name !== refGene) geneNames.push(name);
  }

  // Clean old gene sheets
  const toRemove = workbook.SheetNames.filter((n) => !PROTECTED_SHEETS.has(n));
  for (const n of toRemove) {
    delete workbook.Sheets[n];
  }
  workbook.SheetNames = workbook.SheetNames.filter((n) => !toRemove.includes(n));

  // Create/clear Summary_All_Genes
  let summarySheet = workbook.Sheets["Summary_All_Genes"];
  if (!summarySheet) {
    summarySheet = clearSheet();
    workbook.Sheets["Summary_All_Genes"] = summarySheet;
    workbook.SheetNames.push("Summary_All_Genes");
  } else {
    workbook.Sheets["Summary_All_Genes"] = clearSheet();
    summarySheet = workbook.Sheets["Summary_All_Genes"];
  }

  // Excel 内容保持纯英文，避免混入中文标签。
  const methodLabel = CALC_METHOD_LABELS_EN[method];
  const methodNote =
    method === "control-relative"
      ? `${methodLabel} (control: ${controlGroup})`
      : methodLabel;
  // control-relative 下第 3 列存的是"归一化到对照组"的相对表达量。
  const reColHeader = method === "control-relative" ? "Normalized Expression" : "Relative Expression";

  // 构建 Summary AOA（先在内存里攒，最后一次性写回 sheet）
  const summaryHeaders = ["Gene", "Group_Name"];
  for (let i = 1; i <= repeatCount; i++) summaryHeaders.push("Repeat" + i);
  summaryHeaders.push("Average", "Stdev", "Method");
  const methodColIndex = summaryHeaders.length; // 1-based index of the 'Method' column

  const summaryAoa: unknown[][] = [summaryHeaders.slice()];
  let summaryDataRow = 1; // index into summaryAoa (0-based row index of next data row = length)

  const refCol = findColumn(sourceSheet, refGene);

  // 找最后一行有 Group 数据的行（1-based）。
  const { rowCount: srcRowCount } = sheetRange(sourceSheet);
  let lastDataRow = 1;
  for (let r = srcRowCount; r >= 2; r--) {
    const g = String(cellValue(sourceSheet, r, 2) ?? "").trim();
    if (g) {
      lastDataRow = r;
      break;
    }
  }

  for (const targetGene of geneNames) {
    const targetCol = findColumn(sourceSheet, targetGene);
    let sheetName = targetGene.length > 31 ? targetGene.substring(0, 31) : targetGene;
    if (PROTECTED_SHEETS.has(sheetName)) sheetName += "_gene";

    // 创建/清空 gene sheet
    if (!workbook.Sheets[sheetName]) {
      workbook.Sheets[sheetName] = clearSheet();
      workbook.SheetNames.push(sheetName);
    } else {
      workbook.Sheets[sheetName] = clearSheet();
    }
    const geneSheet = workbook.Sheets[sheetName];

    const headers = [refGene, targetGene, reColHeader, "Average", "Stdev", "Group_Name", "Method"];
    const geneAoa: unknown[][] = [headers.slice()];

    const groupMap = new Map<string, { repeats: number[]; avg: number; stdev: number }>();

    // Pass 1: read each group block and compute the raw per-replicate
    // relative expression 2^-(target - ref). Nothing is written yet, because
    // control-relative needs the control group's mean before it can scale.
    interface Block {
      groupName: string;
      startRow: number;
      refVals: number[];
      targetVals: number[];
      rawRe: number[];
      allValid: boolean;
    }
    const blocks: Block[] = [];
    for (let startRow = 2; startRow <= lastDataRow; startRow += repeatCount) {
      const groupName = String(cellValue(sourceSheet, startRow, 2) ?? "").trim();
      if (!groupName) break;
      const refVals: number[] = [];
      const targetVals: number[] = [];
      const rawRe: number[] = [];
      let allValid = true;
      for (let r = 0; r < repeatCount; r++) {
        const currRow = startRow + r;
        if (currRow > lastDataRow) {
          allValid = false;
          break;
        }
        const tVal = parseNumber(cellValue(sourceSheet, currRow, targetCol));
        const rVal = parseNumber(cellValue(sourceSheet, currRow, refCol));
        refVals.push(rVal);
        targetVals.push(tVal);
        if (!isNaN(tVal) && !isNaN(rVal)) {
          rawRe.push(Math.pow(2, -(tVal - rVal)));
        } else {
          allValid = false;
        }
      }
      blocks.push({ groupName, startRow, refVals, targetVals, rawRe, allValid });
    }

    // Divisor: 1 for ref-normalized; the control group's mean raw RE for
    // control-relative (so the control group averages ~1).
    let divisor = 1;
    if (method === "control-relative") {
      const ctrl = blocks.find(
        (b) => b.groupName === controlGroup && b.allValid && b.rawRe.length === repeatCount
      );
      if (!ctrl) throw new Error(`未找到对照组 "${controlGroup}" 的有效数据（基因 ${targetGene}）`);
      const ctrlAvg = ctrl.rawRe.reduce((a, b) => a + b, 0) / ctrl.rawRe.length;
      if (!(ctrlAvg > 0))
        throw new Error(`对照组 "${controlGroup}" 平均值无效（基因 ${targetGene}）`);
      divisor = ctrlAvg;
    }

    // Pass 2: write rows using the (possibly scaled) expression values.
    let outputRow = 1; // 0-based row index in geneAoa (header is row 0, data starts row 1)
    for (const block of blocks) {
      const { groupName, refVals, targetVals, rawRe, allValid } = block;
      const reValues: number[] = [];
      for (let r = 0; r < repeatCount; r++) {
        const rowArr: unknown[] = new Array(headers.length).fill(undefined);
        rowArr[0] = refVals[r];
        rowArr[1] = targetVals[r];
        rowArr[5] = groupName;
        rowArr[6] = methodNote;
        const rVal = refVals[r];
        const tVal = targetVals[r];
        if (!isNaN(tVal) && !isNaN(rVal)) {
          const re = Math.pow(2, -(tVal - rVal)) / divisor;
          rowArr[2] = re;
          reValues.push(re);
        } else {
          rowArr[2] = "N/A";
        }
        geneAoa.push(rowArr);
      }
      outputRow += repeatCount;

      if (allValid && rawRe.length === repeatCount && reValues.length === repeatCount) {
        const avg = reValues.reduce((a, b) => a + b, 0) / reValues.length;
        const stdev = sampleStdev(reValues);
        // 写 Average/Stdev 到该 group 第一行（geneAoa 的 outputRow-repeatCount 位置，0-based）
        const firstRowIdx = geneAoa.length - repeatCount;
        geneAoa[firstRowIdx][3] = avg;
        geneAoa[firstRowIdx][4] = stdev;
        groupMap.set(groupName, { repeats: [...reValues], avg, stdev });

        // 写 Summary 行
        const sRow: unknown[] = new Array(summaryHeaders.length).fill(undefined);
        sRow[0] = targetGene;
        sRow[1] = groupName;
        for (let i = 0; i < reValues.length; i++) sRow[2 + i] = reValues[i];
        sRow[2 + repeatCount] = avg;
        sRow[3 + repeatCount] = stdev;
        sRow[methodColIndex - 1] = methodNote;
        summaryAoa.push(sRow);
        summaryDataRow++;
      }
    }

    if (groupMap.size > 0) {
      // 在 gene sheet 末尾追加 summary table
      geneAoa.push([]); // 空行间隔
      const summaryTableStart = geneAoa.length; // 0-based
      geneAoa.push(["Group_Name", "Average", "Stdev"]);
      for (const [name, data] of groupMap) {
        geneAoa.push([name, data.avg, data.stdev]);
      }
    }

    // 把 geneAoa 写回 gene sheet（带粗体表头）
    const newGeneSheet = aoaToSheet(geneAoa);
    // 表头加粗
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = newGeneSheet[addr];
      if (cell) {
        cell.s = { font: { bold: true } } as unknown as CellObject["s"];
      }
    }
    workbook.Sheets[sheetName] = newGeneSheet;
  }

  // 把 summaryAoa 写回 summary sheet（带粗体表头）
  const newSummarySheet = aoaToSheet(summaryAoa);
  for (let c = 0; c < summaryHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = newSummarySheet[addr];
    if (cell) {
      cell.s = { font: { bold: true } } as unknown as CellObject["s"];
    }
  }
  workbook.Sheets["Summary_All_Genes"] = newSummarySheet;
}

// 导出 SheetJS 工具方法供上层读写文件复用（避免在多个文件里重复 import 类型）。
export { XLSX, sheetToAoa, aoaToSheet, sheetRange, cellValue };
