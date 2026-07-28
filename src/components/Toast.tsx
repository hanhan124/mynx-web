import { useCallback, useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
}

let toastId = 0;
const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];

export function showToast(text: string, type: ToastType = "info"): void {
  const item: ToastItem = { id: ++toastId, text, type };
  items = [...items, item];
  listeners.forEach((fn) => fn(items));
  setTimeout(() => {
    items = items.filter((i) => i.id !== item.id);
    listeners.forEach((fn) => fn(items));
  }, 3500);
}

export default function ToastContainer() {
  const [current, setCurrent] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.add(setCurrent);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);

  return (
    <div className="toast-container">
      {current.map((item) => (
        <div key={item.id} className={`toast toast--${item.type}`}>
          {item.text}
        </div>
      ))}
    </div>
  );
}

/** Hook for components that need to trigger toasts. */
export function useToast() {
  return useCallback((text: string, type: ToastType = "info") => {
    showToast(text, type);
  }, []);
}
