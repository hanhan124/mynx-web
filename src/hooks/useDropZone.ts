import { useCallback, useEffect, useState, useRef } from "react";

/**
 * 网页版拖放 hook —— 基于 HTML5 drag-drop API。
 * 返回一个 ref 绑定到目标元素，以及拖拽悬停状态。
 * onDrop 回调接收 File[] 数组。
 */
export function useDropZone(
  onDrop: (files: File[]) => void,
): { dropRef: React.RefObject<HTMLDivElement>; isDragOver: boolean } {
  const [isDragOver, setIsDragOver] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onDrop(files);
    },
    [onDrop],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("drop", handleDrop);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    return () => {
      el.removeEventListener("drop", handleDrop);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
    };
  }, [handleDrop, handleDragOver, handleDragLeave]);

  return { dropRef: ref, isDragOver };
}
