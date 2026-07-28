import ExcelJS from 'exceljs';

/**
 * qPCR 相对定量计算 — 完全参照 VBA 宏 (2.caculate.txt)
 */

const PROTECTED_SHEETS = new Set(['Transformed Data', 'Summary_All_Genes', 'Sheet1']);
const BOLD_FONT: Partial<ExcelJS.Font> = { bold: true };

/**
 * qPCR 计算方法（原 "mode"）。
 *  - 'ref-normalized'     相对内参：每个样本 2^-(ΔCt) = 2^-(target - ref)。默认方法。
 *  - 'control-relative'   相对对照：在相对内参基础上，再除以对照组(control)的平均值，
 *                         使对照组归一化表达量约等于 1，其余组为相对倍数（标准 ΔΔCt）。
 */
export type CalcMethod = 'ref-normalized' | 'control-relative';

/** 计算方法的中文标签，用于界面显示。 */
export const CALC_METHOD_LABELS: Record<CalcMethod, string> = {
  'ref-normalized': '相对内参',
  'control-relative': '相对对照',
};

/** 计算方法的英文标签，用于写入 Excel 以标注结果来源（Excel 内容保持纯英文）。 */
export const CALC_METHOD_LABELS_EN: Record<CalcMethod, string> = {
  'ref-normalized': 'Reference-normalized',
  'control-relative': 'Control-relative (ΔΔCt)',
};

export interface CalcOptions {
  method?: CalcMethod;
  /** method 为 'control-relative' 时必填：作为对照的组名。 */
  controlGroup?: string;
}

function sampleStdev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function parseNumber(val: unknown): number {
  if (val == null) return NaN;
  if (typeof val === 'number') return val;
  const parsed = parseFloat(String(val).trim());
  return isNaN(parsed) ? NaN : parsed;
}

function findColumn(sheet: ExcelJS.Worksheet, name: string): number {
  const headerRow = sheet.getRow(1);
  for (let c = 1; c <= sheet.columnCount; c++) {
    if (String(headerRow.getCell(c).value ?? '').trim() === name) return c;
  }
  throw new Error('Column ' + name + ' not found');
}

export function calculateQpcr(
  workbook: ExcelJS.Workbook,
  repeatCount: number,
  refGene: string,
  options: CalcOptions = {}
): void {
  const method: CalcMethod = options.method ?? 'ref-normalized';
  const controlGroup = (options.controlGroup ?? '').trim();
  if (method === 'control-relative' && !controlGroup) {
    throw new Error('相对对照方法需要指定对照组');
  }

  const sourceSheet = workbook.getWorksheet('Transformed Data');
  if (!sourceSheet) throw new Error('Transformed Data sheet not found');
  const colCount = sourceSheet.columnCount;
  const headerRow = sourceSheet.getRow(1);

  // Collect all gene columns starting from c=3 (column C). Columns A=Num, B=Group are skipped.
  // Must match detectTransformedGenes() in qpcr-transform.ts which also starts from c=3.
  // (Previously started from c=4, which silently dropped any gene written to column C — e.g.
  //  TBP, when the source data had it as an extra reference gene.)
  const geneNames = [];
  for (let c = 3; c <= colCount; c++) {
    const name = String(headerRow.getCell(c).value ?? '').trim();
    if (name && name !== refGene) geneNames.push(name);
  }

  // Clean old gene sheets
  const toRemove = workbook.worksheets.filter((ws: ExcelJS.Worksheet) => !PROTECTED_SHEETS.has(ws.name));
  for (const ws of toRemove) workbook.removeWorksheet(ws.id);

  // Create/clear Summary_All_Genes
  let summarySheet = workbook.getWorksheet('Summary_All_Genes');
  if (!summarySheet) { summarySheet = workbook.addWorksheet('Summary_All_Genes'); }
  else { for (let r = summarySheet.rowCount; r >= 1; r--) summarySheet.spliceRows(r, 1); }

  // Excel 内容保持纯英文，避免混入中文标签。
  const methodLabel = CALC_METHOD_LABELS_EN[method];
  const methodNote =
    method === 'control-relative'
      ? `${methodLabel} (control: ${controlGroup})`
      : methodLabel;
  // control-relative 下第 3 列存的是"归一化到对照组"的相对表达量。
  const reColHeader = method === 'control-relative' ? 'Normalized Expression' : 'Relative Expression';

  const summaryHeaders = ['Gene', 'Group_Name'];
  for (let i = 1; i <= repeatCount; i++) summaryHeaders.push('Repeat' + i);
  summaryHeaders.push('Average', 'Stdev', 'Method');
  const shRow = summarySheet.getRow(1);
  summaryHeaders.forEach((h, i) => { const cell = shRow.getCell(i + 1); cell.value = h; cell.font = BOLD_FONT; });
  const methodColIndex = summaryHeaders.length; // 1-based index of the 'Method' column

  const refCol = findColumn(sourceSheet, refGene);
  let summaryDataRow = 2;

  for (const targetGene of geneNames) {
    const targetCol = findColumn(sourceSheet, targetGene);
    let sheetName = targetGene.length > 31 ? targetGene.substring(0, 31) : targetGene;
    if (PROTECTED_SHEETS.has(sheetName)) sheetName += '_gene';

    let geneSheet = workbook.getWorksheet(sheetName);
    if (!geneSheet) { geneSheet = workbook.addWorksheet(sheetName); }
    else { for (let r = geneSheet.rowCount; r >= 1; r--) geneSheet.spliceRows(r, 1); }

    const headers = [refGene, targetGene, reColHeader, 'Average', 'Stdev', 'Group_Name', 'Method'];
    const hRow = geneSheet.getRow(1);
    headers.forEach((h, i) => { const cell = hRow.getCell(i + 1); cell.value = h; cell.font = BOLD_FONT; });

    const groupMap = new Map();

    let lastDataRow = 1;
    for (let r = sourceSheet.rowCount; r >= 2; r--) {
      const g = String(sourceSheet.getRow(r).getCell(2).value ?? '').trim();
      if (g) { lastDataRow = r; break; }
    }

    // Pass 1: read each group block and compute the raw per-replicate
    // relative expression 2^-(target - ref). Nothing is written yet, because
    // control-relative needs the control group's mean before it can scale.
    interface Block { groupName: string; startRow: number; refVals: number[]; targetVals: number[]; rawRe: number[]; allValid: boolean; }
    const blocks: Block[] = [];
    for (let startRow = 2; startRow <= lastDataRow; startRow += repeatCount) {
      const groupName = String(sourceSheet.getRow(startRow).getCell(2).value ?? '').trim();
      if (!groupName) break;
      const refVals: number[] = [];
      const targetVals: number[] = [];
      const rawRe: number[] = [];
      let allValid = true;
      for (let r = 0; r < repeatCount; r++) {
        const currRow = startRow + r;
        if (currRow > lastDataRow) { allValid = false; break; }
        const row = sourceSheet.getRow(currRow);
        const tVal = parseNumber(row.getCell(targetCol).value);
        const rVal = parseNumber(row.getCell(refCol).value);
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
    if (method === 'control-relative') {
      const ctrl = blocks.find(b => b.groupName === controlGroup && b.allValid && b.rawRe.length === repeatCount);
      if (!ctrl) throw new Error(`未找到对照组 "${controlGroup}" 的有效数据（基因 ${targetGene}）`);
      const ctrlAvg = ctrl.rawRe.reduce((a, b) => a + b, 0) / ctrl.rawRe.length;
      if (!(ctrlAvg > 0)) throw new Error(`对照组 "${controlGroup}" 平均值无效（基因 ${targetGene}）`);
      divisor = ctrlAvg;
    }

    // Pass 2: write rows using the (possibly scaled) expression values.
    let outputRow = 2;
    for (const block of blocks) {
      const { groupName, refVals, targetVals, rawRe, allValid } = block;
      const reValues: number[] = [];
      for (let r = 0; r < repeatCount; r++) {
        const outRow = geneSheet.getRow(outputRow + r);
        outRow.getCell(1).value = refVals[r];
        outRow.getCell(2).value = targetVals[r];
        outRow.getCell(6).value = groupName;
        outRow.getCell(7).value = methodNote;
        const rVal = refVals[r];
        const tVal = targetVals[r];
        if (!isNaN(tVal) && !isNaN(rVal)) {
          const re = Math.pow(2, -(tVal - rVal)) / divisor;
          outRow.getCell(3).value = re;
          reValues.push(re);
        } else {
          outRow.getCell(3).value = 'N/A';
        }
      }

      if (allValid && rawRe.length === repeatCount && reValues.length === repeatCount) {
        const avg = reValues.reduce((a, b) => a + b, 0) / reValues.length;
        const stdev = sampleStdev(reValues);
        geneSheet.getRow(outputRow).getCell(4).value = avg;
        geneSheet.getRow(outputRow).getCell(5).value = stdev;
        groupMap.set(groupName, { repeats: [...reValues], avg, stdev });

        const sRow = summarySheet.getRow(summaryDataRow++);
        sRow.getCell(1).value = targetGene;
        sRow.getCell(2).value = groupName;
        for (let i = 0; i < reValues.length; i++) sRow.getCell(3 + i).value = reValues[i];
        sRow.getCell(3 + repeatCount).value = avg;
        sRow.getCell(4 + repeatCount).value = stdev;
        sRow.getCell(methodColIndex).value = methodNote;
      }
      outputRow += repeatCount;
    }

    if (groupMap.size > 0) {
      const summaryTableStart = outputRow + 2;
      const chartHeader = geneSheet.getRow(summaryTableStart);
      chartHeader.getCell(1).value = 'Group_Name';
      chartHeader.getCell(2).value = 'Average';
      chartHeader.getCell(3).value = 'Stdev';
      [1, 2, 3].forEach(c => chartHeader.getCell(c).font = BOLD_FONT);
      let row = summaryTableStart + 1;
      for (const [name, data] of groupMap) {
        const r = geneSheet.getRow(row++);
        r.getCell(1).value = name;
        r.getCell(2).value = data.avg;
        r.getCell(3).value = data.stdev;
      }
    }
  }
}
