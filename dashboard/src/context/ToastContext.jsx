import { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

/* Small toast queue for action feedback, such as a server rejection when a
   viewer tries to acknowledge an alert. */

const ToastContext = createContext(null);
const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };
const COLORS = { success: "var(--green)", error: "var(--red)", info: "var(--cyan)" };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((message, kind = "info", ttl = 4200) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, kind }]);
    if (ttl) setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind] || Info;
          return (
            <div className="toastcard" key={t.id}>
              <Icon size={16} style={{ color: COLORS[t.kind], flex: "none", marginTop: 1 }} />
              <span style={{ flex: 1, fontSize: 12, lineHeight: 1.45 }}>{t.message}</span>
              <button type="button" className="iconbtn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
