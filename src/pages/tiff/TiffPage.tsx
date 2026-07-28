import { useState, useCallback } from "react";
import { IconPhoto } from "@tabler/icons-react";
import { showToast } from "@/components/Toast";
import LoadingOverlay from "@/components/LoadingOverlay";
import { convertTiff, downloadBlob, type TiffConvertResult } from "@/lib/tiff-convert";

export default function TiffPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState(0.85);
  const [watermark, setWatermark] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TiffConvertResult[]>([]);

  const handleFiles = useCallback((selected: FileList | File[]) => {
    const tiffs = Array.from(selected).filter((f) => /\.(tiff?)$/i.test(f.name));
    setFiles(tiffs);
    setResults([]);
    if (tiffs.length) showToast(`已选择 ${tiffs.length} 个 TIFF 文件`, "success");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleConvert = useCallback(async () => {
    if (!files.length) {
      showToast("请先选择 TIFF 文件", "error");
      return;
    }
    setLoading(true);
    try {
      const all: TiffConvertResult[] = [];
      for (const file of files) {
        const out = await convertTiff(file, {
          quality,
          watermark: watermark ? { text: watermark, fontSize: 16, opacity: 0.7 } : undefined,
        });
        all.push(...out);
      }
      setResults(all);
      showToast(`已转换 ${all.length} 张 JPG`, "success");
    } catch (e) {
      showToast(`转换失败: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [files, quality, watermark]);

  const handleDownloadAll = useCallback(() => {
    results.forEach((r) => downloadBlob(r.blob, r.name));
    showToast("开始下载全部", "info");
  }, [results]);

  return (
    <div className="page-shell">
      <LoadingOverlay visible={loading} text="转换中..." />
      <div className="panel-header">
        <div className="panel-icon" style={{ background: "#34c759" }}>
          <IconPhoto size={18} color="white" stroke={1.75} />
        </div>
        <div className="panel-title">
          <h2>TIFF 转 JPG</h2>
          <p>批量转换 TIFF 图片</p>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><span>选择文件</span></div>
        <div className="card-body">
          <div
            className="file-drop"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("tiff-file-input")?.click()}
          >
            <input
              id="tiff-file-input"
              type="file"
              accept=".tif,.tiff"
              multiple
              style={{ display: "none" }}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <div className="file-drop-icon">🖼️</div>
            <div className="file-drop-text">{files.length ? `已选 ${files.length} 个文件` : "拖拽 TIFF 文件或点击选择"}</div>
            <div className="file-drop-hint">支持多页 TIFF</div>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label>水印文字（可选）</label>
            <input type="text" value={watermark} placeholder="文件名水印" onChange={(e) => setWatermark(e.target.value)} />
          </div>
          <div className="form-group">
            <label>JPG 质量：{Math.round(quality * 100)}%</label>
            <input type="range" min={0.3} max={1} step={0.05} value={quality} onChange={(e) => setQuality(parseFloat(e.target.value))} />
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleConvert} disabled={!files.length}>
              开始转换
            </button>
            {results.length > 0 && (
              <button className="btn" onClick={handleDownloadAll}>
                下载全部 ({results.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <div className="card">
          <div className="card-title"><span>转换结果</span></div>
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
