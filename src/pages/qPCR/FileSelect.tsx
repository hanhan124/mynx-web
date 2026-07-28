import { IconFileSpreadsheet } from "@tabler/icons-react";
import { readExcelFile, getSheetNames, type ExcelFile } from "@/lib/excel-io";
import { showToast } from "@/components/Toast";
import { useDropZone } from "@/hooks/useDropZone";

interface FileSelectProps {
  file: ExcelFile | null;
  sheetName: string;
  onFileChange: (file: ExcelFile | null) => void;
  onSheetChange: (name: string) => void;
}

export default function FileSelect({ file, sheetName, onFileChange, onSheetChange }: FileSelectProps) {
  const sheets = file ? getSheetNames(file.workbook) : [];

  const handleFile = async (f: File) => {
    try {
      const excelFile = await readExcelFile(f);
      onFileChange(excelFile);
      const names = getSheetNames(excelFile.workbook);
      onSheetChange(names[0] ?? "");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`文件导入失败: ${msg}`, "error");
    }
  };

  const handleDrop = (files: File[]) => {
    const f = files.find((p) => /\.(xlsx|xls)$/i.test(p.name));
    if (f) void handleFile(f);
  };

  const { dropRef, isDragOver } = useDropZone(handleDrop);

  const openDialog = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void handleFile(f);
    };
    input.click();
  };

  return (
    <>
      <div
        ref={dropRef}
        className={`file-display${isDragOver ? " file-display--drag" : ""}`}
        onClick={openDialog}
        style={{ cursor: "pointer" }}
      >
        <div className="file-icon" style={{ background: "#34c759" }}>
          <IconFileSpreadsheet size={20} color="white" stroke={1.75} />
        </div>
        <div className="file-info">
          <div className="file-name">{file ? file.name : "未选择文件"}</div>
          <div className="file-path">{file ? file.name : "xlsx / xls"}</div>
        </div>
        {isDragOver && <span className="drop-hint">释放以导入</span>}
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={openDialog}>打开</button>
        {file && (
          <button className="btn" style={{ marginLeft: "auto", color: "var(--red)" }} onClick={() => {
            onSheetChange("");
            onFileChange(null);
          }}>
            清空
          </button>
        )}
      </div>

      {file && sheets.length > 0 && (
        <div className="form-group">
          <label>工作表</label>
          <select value={sheetName} onChange={(e) => onSheetChange(e.target.value)}>
            {sheets.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
