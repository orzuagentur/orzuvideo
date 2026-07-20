"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINS = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

function parseTime(value: string): { h: string; m: string } {
  const [h = "09", m = "00"] = (value || "09:00").split(":");
  const minute = MINS.includes(m)
    ? m
    : MINS.reduce((best, cur) =>
        Math.abs(Number(cur) - Number(m)) < Math.abs(Number(best) - Number(m))
          ? cur
          : best,
      );
  return { h: h.padStart(2, "0"), m: minute };
}

/** Compact time chip + clock icon opens styled picker card (portaled above all panels). */
export function TimeChip({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const { h, m } = parseTime(value);
  const [draftH, setDraftH] = useState(h);
  const [draftM, setDraftM] = useState(m);

  useEffect(() => {
    if (!open) return;
    const parsed = parseTime(value);
    setDraftH(parsed.h);
    setDraftM(parsed.m);
  }, [open, value]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;

    function place() {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = 220;
      const gap = 8;
      let left = rect.left;
      let top = rect.bottom + gap;

      // keep inside viewport
      left = Math.min(left, window.innerWidth - width - 12);
      left = Math.max(12, left);

      const estimatedHeight = 280;
      if (top + estimatedHeight > window.innerHeight - 12) {
        top = Math.max(12, rect.top - estimatedHeight - gap);
      }

      setPos({ top, left });
    }

    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function apply() {
    onChange(`${draftH}:${draftM}`);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--line)] bg-black/20 px-2.5 py-1.5 text-sm transition hover:border-[color:rgba(232,165,75,0.45)]"
      >
        {label && (
          <span className="text-[11px] text-[color:var(--muted)]">{label}</span>
        )}
        <span className="font-medium tabular-nums">{value}</span>
        <span aria-hidden className="text-[color:var(--muted)]">
          <ClockIcon />
        </span>
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            className="w-[220px] rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-3 shadow-2xl"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 200,
            }}
            role="dialog"
          >
            <p className="mb-2 text-xs font-medium text-[color:var(--muted)]">
              Pick time
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                  Hour
                </p>
                <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-[color:var(--line)] p-1">
                  {HOURS.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      className="block w-full rounded-md px-2 py-1 text-left text-sm tabular-nums"
                      style={{
                        background:
                          draftH === hour
                            ? "rgba(232,165,75,0.2)"
                            : "transparent",
                        color: draftH === hour ? "var(--accent)" : "var(--fg)",
                      }}
                      onClick={() => setDraftH(hour)}
                    >
                      {hour}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
                  Min
                </p>
                <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-[color:var(--line)] p-1">
                  {MINS.map((min) => (
                    <button
                      key={min}
                      type="button"
                      className="block w-full rounded-md px-2 py-1 text-left text-sm tabular-nums"
                      style={{
                        background:
                          draftM === min
                            ? "rgba(232,165,75,0.2)"
                            : "transparent",
                        color: draftM === min ? "var(--accent)" : "var(--fg)",
                      }}
                      onClick={() => setDraftM(min)}
                    >
                      {min}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-xs"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary px-3 py-1.5 text-xs"
                onClick={apply}
              >
                OK
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
