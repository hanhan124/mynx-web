import { useState } from "react";
import { IconPhotoFilled, IconAdjustmentsFilled, IconFileZip } from "@tabler/icons-react";
import { convertTiffFiles, downloadBlob, type TiffOptions, type TiffConvertResult } from "@/lib/tiff-convert";
import ConvertOptions from "./ConvertOptions";
import LoadingOverlay from "@/components/LoadingOverlay";
import HelpButton, { TiffTutorial } from "@/components/HelpButton";
import { showToast } from "@/components/Toast";
import { useDropZone } from "@/hooks/useDropZone";

export default function TiffPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("转换中...");
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<TiffConvertResult[]>([]);

  const handlePick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".tif,.tiff";
    input.multiple = true;
    input.onchange = () => {
      const selected = Array.from(input.files ?? []);
      setFiles(selected);
      setResults([]);
    };
    input.click();
  };

  const handleConvert = async (options: TiffOptions) => {
    if (!files.length) return;
    setLoading(true);
    setProgress(0);
    setLoadingText("准备转换...");
    setResults([]);
    try {
      const result = await convertTiffFiles(files, options, (current, total) => {
        setProgress(total > 0 ? Math.round((current / total) * 100) : 0);
        setLoadingText(`正在转换 (${current}/${total})...`);
      });
      const all: TiffConvertResult[] = [];
      result.blobs.forEach((blob, i) => {
        if (blob) {
          const baseName = files[i].name.replace(/\.[^.]+$/, "");
          all.push({ blob, name: `${baseName}.jpg` });
        }
      });
      setProgress(100);
      setResults(all);
      if (result.ok === 0 && result.failed === 0) {
        showToast("未找到 TIFF 文件", "info");
      } else if (result.failed > 0) {
        showToast(`${result.ok} 个成功，${result.failed} 个失败`, "info");
      } else {
        showToast(`转换完成，${result.ok} 个文件`, "success");
      }
    } catch (e) {
      showToast(`转换失败：${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleDownloadAll = () => {
    results.forEach((r) => downloadBlob(r.blob, r.name));
    showToast("开始下载全部", "info");
  };

  const handleDrop = (dropped: File[]) => {
    const tiffs = dropped.filter((f) => /\.(tiff?)$/i.test(f.name));
    if (tiffs.length) {
      setFiles(tiffs);
      setResults([]);
    }
  };

  const { dropRef, isDragOver } = useDropZone(handleDrop);

  return (
    <div className="page-shell">
      <LoadingOverlay visible={loading} text={loadingText} progress={progress} />

      <div className="panel-header">
        <div className="panel-icon" style={{ background: "#34c759" }}>
          <IconPhotoFilled size={18} color="white" stroke={1.75} />
        </div>
        <div className="panel-title">
          <h2>TIFF 转 JPG</h2>
          <p>批量将 TIFF 转为 JPG</p>
        </div>
        <div className="panel-actions">
          <HelpButton>{(close) => <TiffTutorial onClose={close} />}</HelpButton>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <IconFileZip size={14} stroke={1.75} />
          <span>选择 TIFF 文件</span>
        </div>
        <div className="card-body">
          <div
            ref={dropRef}
            className={`file-display${isDragOver ? " file-display--drag" : ""}`}
            onClick={handlePick}
            style={{ cursor: "pointer" }}
          >
            <div className="file-icon" style={{ background: "#34c759" }}>
              <IconFileZip size={20} color="white" stroke={1.75} />
            </div>
            <div className="file-info">
              <div className="file-name">{files.length ? `${files.length} 个 TIFF 文件` : "未选择文件"}</div>
              <div className="file-path">{files.length ? files.map((f) => f.name).join(", ").slice(0, 60) : ".tif / .tiff"}</div>
            </div>
            {isDragOver && <span className="drop-hint">释放以导入</span>}
          </div>
          <button className="btn btn-primary btn-full" onClick={handlePick}>
            {files.length ? "更换文件" : "选择文件"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <IconAdjustmentsFilled size={14} stroke={1.75} />
          <span>转换选项</span>
        </div>
        <div className="card-body">
          <ConvertOptions onConvert={handleConvert} loading={loading} disabled={!files.length} />
        </div>
      </div>

      {results.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span>转换结果</span>
            <button className="btn" style={{ marginLeft: "auto" }} onClick={handleDownloadAll}>
              下载全部 ({results.length})
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
              {results.map((r, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <img src={URL.createObjectURL(r.blob)} alt={r.name} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--separator)" }} />
                  <div style={{ fontSize: 11, marginTop: 4 }}>{r.name}</div>
                  <button className="btn" style={{ marginTop: 4, fontSize: 11 }} onClick={() => downloadBlob(r.blob, r.name)}>
                    下载
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
