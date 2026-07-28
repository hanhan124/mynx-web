import { useState, useEffect, useCallback } from "react";
import { IconCircleCheckFilled, IconCircleXFilled, IconInfoCircleFilled } from "@tabler/icons-react";

export type ToastType = "success" | "error" | "info";

interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

let toastId = 0;
let listeners: ((msg: ToastMessage) => void)[] = [];

export function showToast(text: string, type: ToastType = "info") {
  const msg: ToastMessage = { id: ++toastId, text, type };
  listeners.forEach((fn) => fn(msg));
}

const ICONS: Record<ToastType, typeof IconCircleCheckFilled> = {
  success: IconCircleCheckFilled,
  error: IconCircleXFilled,
  info: IconInfoCircleFilled,
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((msg: ToastMessage) => {
    setToasts((prev) => [...prev, msg]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== msg.id));
    }, 3000);
  }, []);

  useEffect(() => {
    listeners.push(addToast);
    return () => {
      listeners = listeners.filter((fn) => fn !== addToast);
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <Icon size={16} stroke={1.75} className="toast-icon" />
            <span>{toast.text}</span>
          </div>
        );
      })}
    </div>
  );
}
