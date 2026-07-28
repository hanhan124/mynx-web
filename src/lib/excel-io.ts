import ExcelJS from "exceljs";

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

/** 把 workbook 写成 xlsx 并触发浏览器下载。 */
export async function saveExcelFile(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
