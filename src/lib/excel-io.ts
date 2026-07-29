import ExcelJS from "exceljs";
import { saveFile } from "@/lib/storage";

export interface ExcelFile {
  name: string;
  workbook: ExcelJS.Workbook;
  buffer: ArrayBuffer;
}

/** 从用户选择的 File 读取 xlsx/xls。保留原始 buffer 供图表注入使用。 */
export async function readExcelFile(file: File): Promise<ExcelFile> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return { name: file.name, workbook, buffer };
}

/** 获取所有 sheet 名。 */
export function getSheetNames(wb: ExcelJS.Workbook): string[] {
  return wb.worksheets.map((s) => s.name);
}

/** 把 workbook 写成 xlsx Blob（内部用）。 */
async function workbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** 暂存 workbook 到 IndexedDB（不触发下载）。供自动保存用。 */
export async function saveExcelFile(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
  const blob = await workbookToBlob(wb);
  await saveFile(fileName, "excel", blob);
}

/** 主动下载 workbook 为 xlsx（同时暂存）。供用户点「下载」按钮用。 */
export async function downloadExcel(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
  const blob = await workbookToBlob(wb);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  await saveFile(fileName, "excel", blob);
}
