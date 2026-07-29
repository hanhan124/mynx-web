import { useState, useEffect, useCallback } from "react";
import { IconDownload, IconTrash, IconDatabase } from "@tabler/icons-react";
import { listFiles, deleteFile, downloadStoredFile, clearFiles, formatSize, formatDate, type StoredFile } from "@/lib/storage";
import { showToast } from "@/components/Toast";

const TYPE_LABELS: Record<string, string> = {
  excel: "Excel",
  jpg: "JPG",
  markdown: "报告",
  pdf: "PDF",
};

export default function StoragePanel() {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<StoredFile[]>([]);

  const refresh = useCallback(async () => {
    try {
      const all = await listFiles();
      setFiles(all);
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleDownload = useCallback(async (id: string) => {
    try {
      await downloadStoredFile(id);
      showToast("已开始下载", "success");
    } catch (e) {
      showToast(`下载失败: ${e}`, "error");
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteFile(id);
    await refresh();
    showToast("已删除", "info");
  }, [refresh]);

  const handleClearAll = useCallback(async () => {
    await clearFiles();
    setFiles([]);
    showToast("暂存区已清空", "info");
  }, []);

  return (
    <>
      <button
        className="sidebar-btn"
        title={`暂存区${files.length ? ` (${files.length})` : ""}`}
        onClick={() => setOpen(true)}
      >
        <IconDatabase size={16} stroke={2} />
      </button>

      {open && (
        <div className="modal-overlay" style={{ zIndex: 500 }} onClick={() => setOpen(false)}>
          <div className="modal-box modal-box--wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>暂存区 {files.length > 0 && `(${files.length})`}</h3>
              <button className="modal-close-btn" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              {files.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", textAlign: "center", padding: 24, fontSize: 13 }}>
                  暂无存储的文件。处理完数据后，文件会自动暂存到这里。
                </p>
              ) : (
                <>
                  <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
                    <button className="btn" style={{ color: "var(--red)", fontSize: 12 }} onClick={handleClearAll}>
                      <IconTrash size={13} stroke={2} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                      清空全部
                    </button>
                  </div>
                  <div className="storage-list">
                    {files.map((f) => (
                      <div key={f.id} className="storage-item">
                        <div className="storage-item-info">
                          <div className="storage-item-name">{f.name}</div>
                          <div className="storage-item-meta">
                            <span className="storage-tag">{TYPE_LABELS[f.type] ?? f.type}</span>
                            <span>{formatSize(f.size)}</span>
                            <span>{formatDate(f.createdAt)}</span>
                          </div>
                        </div>
                        <div className="storage-item-actions">
                          <button className="btn" style={{ fontSize: 11 }} onClick={() => handleDownload(f.id)}>
                            <IconDownload size={13} stroke={2} />
                          </button>
                          <button className="btn" style={{ fontSize: 11, color: "var(--red)" }} onClick={() => handleDelete(f.id)}>
                            <IconTrash size={13} stroke={2} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
