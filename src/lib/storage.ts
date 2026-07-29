/**
 * 浏览器数据暂存 —— 用 IndexedDB 存储处理后的文件（Excel/JPG/报告）。
 * 页面刷新不丢，用户可随时查看和下载。
 */

const DB_NAME = "mynx-web-store";
const STORE_NAME = "files";
const DB_VERSION = 1;

interface StoredFile {
  id: string;
  name: string;
  type: string; // "excel" | "jpg" | "markdown" | "pdf"
  blob: Blob;
  size: number;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** 保存一个文件到暂存区。返回 id。 */
export async function saveFile(
  name: string,
  type: string,
  blob: Blob,
): Promise<string> {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: StoredFile = {
    id,
    name,
    type,
    blob,
    size: blob.size,
    createdAt: Date.now(),
  };
  await tx("readwrite", (store) => store.put(record));
  return id;
}

/** 列出所有暂存文件，按时间倒序。 */
export async function listFiles(type?: string): Promise<StoredFile[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result as StoredFile[];
      const filtered = type ? all.filter((f) => f.type === type) : all;
      filtered.sort((a, b) => b.createdAt - a.createdAt);
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

/** 获取单个文件。 */
export async function getFile(id: string): Promise<StoredFile | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve((req.result as StoredFile) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** 删除一个文件。 */
export async function deleteFile(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}

/** 清空所有暂存文件。 */
export async function clearFiles(): Promise<void> {
  await tx("readwrite", (store) => store.clear());
}

/** 触发浏览器下载某个暂存文件。 */
export async function downloadStoredFile(id: string): Promise<void> {
  const file = await getFile(id);
  if (!file) throw new Error("文件不存在");
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 格式化文件大小。 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 格式化时间。 */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export type { StoredFile };
