"use client";

import { useCallback, useEffect, useState } from "react";

export type ToastTone = "ok" | "error" | "info";

export type ToastState = {
  message: string;
  tone: ToastTone;
} | null;

export function ToastNotice({
  message,
  tone = "ok",
  onClose,
  ms = 4200,
}: {
  message: string | null;
  tone?: ToastTone;
  onClose: () => void;
  ms?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onClose, ms);
    return () => window.clearTimeout(t);
  }, [message, ms, onClose]);

  if (!message) return null;

  const accent =
    tone === "error"
      ? "var(--danger)"
      : tone === "info"
        ? "var(--accent)"
        : "var(--success)";

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[90] w-[min(100%-2rem,320px)] sm:right-6 sm:top-5"
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto flex items-start gap-3 rounded-2xl border bg-[color:var(--bg-elevated)]/95 p-3.5 shadow-2xl backdrop-blur-md"
        style={{ borderColor: "var(--line)" }}
      >
        <span
          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
          style={{ background: accent }}
        />
        <p className="min-w-0 flex-1 text-sm leading-snug">{message}</p>
        <button
          type="button"
          className="shrink-0 text-sm text-[color:var(--muted)] transition hover:text-[color:var(--fg)]"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** Top-right toast for action feedback in user-facing studios. */
export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);

  const clear = useCallback(() => setToast(null), []);

  const show = useCallback((message: string, tone: ToastTone = "ok") => {
    setToast({ message, tone });
  }, []);

  const notice = (
    <ToastNotice
      message={toast?.message ?? null}
      tone={toast?.tone ?? "ok"}
      onClose={clear}
    />
  );

  return { toast, show, clear, notice };
}
