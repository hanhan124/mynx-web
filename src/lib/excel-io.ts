import * as XLSX from "xlsx";

export interface ExcelFile {
  name: string;
  workbook: XLSX.WorkBook;
}

/** 从用户选择的 File 读取 xlsx/xls。 */
export async function readExcelFile(file: File): Promise<ExcelFile> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });
  return { name: file.name, workbook };
}

/** 获取所有 sheet 名。 */
export function getSheetNames(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames;
}

/** 把 workbook 写成 xlsx 并触发下载。 */
export function downloadExcel(wb: XLSX.WorkBook, fileName: string): void {
  XLSX.writeFile(wb, fileName);
}

/** 从 sheet 读取二维数组（header 模式）。 */
export function sheetToArray(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
}

/** 从二维数组创建 sheet。 */
export function arrayToSheet(data: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(data);
}
