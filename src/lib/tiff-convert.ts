import UTIF from "utif2";
import type { IFD } from "utif2";

/**
 * TIFF → JPEG 转换 —— 网页版。
 *
 * 桌面端用 PowerShell / Shell 调用系统图像库（System.Drawing / sips / ImageMagick）。
 * 网页版无法执行本地命令，改用纯 JS：
 * - 用 `utif2` 解码 TIFF（UTIF.decode / decodeImage / toRGBA8）
 * - 用 Canvas 渲染像素 + 水印
 * - 用 canvas.toBlob(cb, "image/jpeg", quality) 输出 JPEG
 *
 * 批量处理：接受 File[] 或 ArrayBuffer[]，返回 Blob[]。
 */

export interface TiffOptions {
  watermark: boolean;
  font: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  marginX: number;
  marginY: number;
  paddingX: number;
  paddingY: number;
  /** 水印背景不透明度 0~1 */
  transparency: number;
  /** JPEG 质量 0~100 */
  quality: number;
}

/** 默认选项（与桌面端 UI 默认值保持一致）。 */
export const DEFAULT_TIFF_OPTIONS: TiffOptions = {
  watermark: true,
  font: "Microsoft YaHei",
  fontSize: 28,
  bold: true,
  italic: false,
  marginX: 20,
  marginY: 20,
  paddingX: 8,
  paddingY: 4,
  transparency: 0.55,
  quality: 90,
};

export interface ConvertResult {
  ok: number;
  failed: number;
  /** 网页版无输出目录概念，固定为空字符串以兼容旧字段。 */
  outputDir: string;
  watermarkSkipped: boolean;
  /** 转换得到的 JPEG Blob 列表（与输入同序）。失败的对应位置为 null。 */
  blobs: (Blob | null)[];
}

export type TiffProgress = (current: number, total: number) => void;

/** 单个输入项：File 或已读取的 ArrayBuffer + 名称。 */
export interface TiffInput {
  name: string;
  data: ArrayBuffer;
}

/**
 * 把 Canvas 渲染为 JPEG Blob。
 */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      "image/jpeg",
      Math.max(0, Math.min(1, quality / 100))
    );
  });
}

/** 解码一个 TIFF ArrayBuffer 为 RGBA 像素 + 尺寸（取第一个 IFD）。 */
function decodeTiff(buffer: ArrayBuffer): { rgba: Uint8Array; width: number; height: number } {
  const ifds: IFD[] = UTIF.decode(buffer);
  if (!ifds || ifds.length === 0) {
    throw new Error("TIFF 解码失败：未找到图像");
  }
  const ifd = ifds[0];
  UTIF.decodeImage(buffer, ifd);
  const rgba = UTIF.toRGBA8(ifd);
  const width = typeof ifd.width === "number" ? ifd.width : 0;
  const height = typeof ifd.height === "number" ? ifd.height : 0;
  if (width <= 0 || height <= 0) {
    throw new Error("TIFF 解码失败：尺寸无效");
  }
  return { rgba, width, height };
}

/**
 * 渲染一张 TIFF 到 Canvas，可选叠加水印，输出 JPEG Blob。
 */
async function renderOne(
  input: TiffInput,
  options: TiffOptions
): Promise<Blob | null> {
  const { rgba, width, height } = decodeTiff(input.data);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法获取 2D 上下文");

  // 先填白底（TIFF 可能透明）
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // 写入 RGBA 像素
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(rgba);
  ctx.putImageData(imageData, 0, 0);

  // 水印（文件名，不含扩展名）
  if (options.watermark) {
    const label = input.name.replace(/\.[^.]+$/, "");
    drawWatermark(ctx, label, width, height, options);
  }

  const blob = await canvasToBlob(canvas, options.quality);
  return blob;
}

/** 在 Canvas 上绘制带半透明背景的水印文本。 */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  opts: TiffOptions
): void {
  const fontStyle = `${opts.italic ? "italic " : ""}${opts.bold ? "700 " : "400 "}${opts.fontSize}px ${opts.font}`;
  ctx.font = fontStyle;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  // measureText 不含上下行高，用近似值
  const textHeight = opts.fontSize * 1.2;

  const bgX = opts.marginX;
  const bgY = opts.marginY;
  const bgW = Math.min(textWidth + 2 * opts.paddingX, width - opts.marginX - opts.paddingX);
  const bgH = textHeight + 2 * opts.paddingY;

  // 背景半透明灰
  const alpha = Math.max(0, Math.min(1, opts.transparency));
  ctx.fillStyle = `rgba(90, 90, 90, ${alpha})`;
  ctx.fillRect(bgX, bgY, bgW, bgH);

  // 白色文字
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillText(text, bgX + opts.paddingX, bgY + opts.paddingY);
}

/**
 * 批量转换 TIFF 为 JPEG。返回所有 Blob（成功的对应位置为非 null）。
 *
 * @param inputs 输入项（名称 + ArrayBuffer）
 * @param options 转换选项
 * @param onProgress 进度回调 (current, total)
 */
export async function convertTiffBatch(
  inputs: TiffInput[],
  options: TiffOptions,
  onProgress?: TiffProgress
): Promise<ConvertResult> {
  const total = inputs.length;
  const blobs: (Blob | null)[] = new Array(total).fill(null);
  let ok = 0;
  let failed = 0;
  let watermarkSkipped = false;

  if (onProgress) onProgress(0, total);

  for (let i = 0; i < total; i++) {
    try {
      const blob = await renderOne(inputs[i], options);
      if (blob) {
        blobs[i] = blob;
        ok++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    if (onProgress) onProgress(i + 1, total);
    // 让出主线程，避免长任务卡死 UI
    await new Promise((r) => setTimeout(r, 0));
  }

  return {
    ok,
    failed,
    outputDir: "",
    watermarkSkipped,
    blobs,
  };
}

/**
 * 便捷：从 File[] 读取并转换。
 */
export async function convertTiffFiles(
  files: File[],
  options: TiffOptions,
  onProgress?: TiffProgress
): Promise<ConvertResult> {
  const inputs: TiffInput[] = [];
  for (const f of files) {
    const data = await f.arrayBuffer();
    inputs.push({ name: f.name, data });
  }
  return convertTiffBatch(inputs, options, onProgress);
}

// ── 页面友好 API（与 TiffPage 约定） ──────────────────────────────────────────

/** 单张 TIFF 转换结果：JPEG Blob + 源文件名。 */
export interface TiffConvertResult {
  blob: Blob;
  name: string;
}

/** TiffPage 风格的简化选项：quality 0~1（浮点），watermark 可选文本水印。 */
export interface TiffConvertPageOptions {
  /** JPEG 质量 0~1（浮点，会被换算成 0~100）。 */
  quality: number;
  /** 水印；省略则不加。 */
  watermark?: { text: string; fontSize: number; opacity: number };
}

/** 把页面风格选项转成完整 TiffOptions。 */
function toTiffOptions(opts: TiffConvertPageOptions): TiffOptions {
  return {
    watermark: !!opts.watermark,
    font: "Microsoft YaHei",
    fontSize: opts.watermark?.fontSize ?? 16,
    bold: true,
    italic: false,
    marginX: 20,
    marginY: 20,
    paddingX: 8,
    paddingY: 4,
    transparency: opts.watermark?.opacity ?? 0.55,
    quality: Math.round(Math.max(0, Math.min(1, opts.quality)) * 100),
  };
}

/**
 * 把一个 TIFF File 转成若干张 JPEG（多页 TIFF 会产出多张）。
 * 返回 TiffConvertResult[]（每项 {blob, name}）。
 *
 * 注意：utif2 解码同步、canvas.toBlob 异步，因此整体为 async。
 */
export async function convertTiff(
  file: File,
  opts: TiffConvertPageOptions
): Promise<TiffConvertResult[]> {
  const data = await file.arrayBuffer();
  const options = toTiffOptions(opts);
  const baseName = file.name.replace(/\.[^.]+$/, "");

  // 多页 TIFF：utif2.decode 可能返回多个 IFD，每页一张 JPEG。
  const ifds: IFD[] = UTIF.decode(data);
  if (!ifds || ifds.length === 0) {
    throw new Error("TIFF 解码失败：未找到图像");
  }

  const results: TiffConvertResult[] = [];
  for (let p = 0; p < ifds.length; p++) {
    const ifd = ifds[p];
    UTIF.decodeImage(data, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    const width = typeof ifd.width === "number" ? ifd.width : 0;
    const height = typeof ifd.height === "number" ? ifd.height : 0;
    if (width <= 0 || height <= 0) continue;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);

    if (options.watermark) {
      const label = ifds.length > 1 ? `${baseName}_${p + 1}` : baseName;
      drawWatermark(ctx, label, width, height, options);
    }

    const blob = await canvasToBlob(canvas, options.quality);
    if (blob) {
      const name = ifds.length > 1 ? `${baseName}_${p + 1}.jpg` : `${baseName}.jpg`;
      results.push({ blob, name });
    }
  }
  return results;
}

/** 暂存 Blob 到 IndexedDB（不触发下载）。供自动保存用。 */
export async function storeBlob(blob: Blob, name: string): Promise<void> {
  const { saveFile } = await import("@/lib/storage");
  await saveFile(name, "jpg", blob);
}

/** 主动下载 Blob（同时暂存）。供用户点「下载」按钮用。 */
export async function downloadBlob(blob: Blob, name: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  await storeBlob(blob, name);
}
