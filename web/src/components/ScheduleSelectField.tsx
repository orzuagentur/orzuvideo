"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Option = { value: string; label: string };

const OWN_VALUE = "__own__";

/** Same-looking select field: opens a picker card; "+ Own" is a normal variant in the list. */
export function ScheduleSelectField({
  label,
  value,
  options,
  onChange,
  allowOwn = true,
  ownPlaceholder = "Custom value",
  ownKind = "text",
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  allowOwn?: boolean;
  ownPlaceholder?: string;
  ownKind?: "text" | "number";
}) {
  const isPreset = options.some((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [ownMode, setOwnMode] = useState(() => allowOwn && !isPreset);
  const [draftOwn, setDraftOwn] = useState(value);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const display =
    allowOwn && !isPreset
      ? value || "+ Own"
      : selected?.label || value || "Select";

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    function place() {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = Math.max(rect.width, 200);
      let left = rect.left;
      let top = rect.bottom + 6;
      left = Math.min(left, window.innerWidth - width - 12);
      left = Math.max(12, left);
      if (top + 280 > window.innerHeight - 12) {
        top = Math.max(12, rect.top - 280 - 6);
      }
      setPos({ top, left, width });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, ownMode]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
      setOwnMode(allowOwn && !options.some((o) => o.value === value));
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
  }, [open, allowOwn, options, value]);

  function pick(v: string) {
    setOwnMode(false);
    onChange(v);
    setOpen(false);
  }

  function applyOwn() {
    const v = draftOwn.trim();
    if (!v) return;
    if (ownKind === "number") {
      const n = Math.min(10, Math.max(1, Number(v) || 1));
      onChange(String(n));
    } else {
      onChange(v);
    }
    setOwnMode(true);
    setOpen(false);
  }

  const variants: Option[] = [
    ...options,
    ...(allowOwn ? [{ value: OWN_VALUE, label: "+ Own" }] : []),
  ];

  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-[color:var(--muted)]">
        {label}
      </span>
      <button
        ref={btnRef}
        type="button"
        className="field !py-2 flex w-full items-center justify-between gap-2 text-left text-sm"
        onClick={() => {
          const preset = options.some((o) => o.value === value);
          setDraftOwn(preset ? "" : value);
          setOwnMode(allowOwn && !preset);
          setOpen((v) => !v);
        }}
      >
        <span className="truncate">{display}</span>
        <span className="shrink-0 text-[color:var(--muted)]">▾</span>
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            className="rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-2 shadow-2xl"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 200,
            }}
            role="listbox"
          >
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {variants.map((o) => {
                const isOwn = o.value === OWN_VALUE;
                const active = isOwn
                  ? ownMode || (allowOwn && !isPreset)
                  : !ownMode && o.value === value;

                if (isOwn && ownMode) {
                  return (
                    <div
                      key={OWN_VALUE}
                      className="space-y-2 rounded-lg px-2 py-2"
                      style={{ background: "rgba(232,165,75,0.1)" }}
                    >
                      <p className="px-1 text-sm font-medium text-[color:var(--accent)]">
                        + Own
                      </p>
                      <input
                        className="field !py-2 text-sm"
                        type={ownKind === "number" ? "number" : "text"}
                        min={ownKind === "number" ? 1 : undefined}
                        max={ownKind === "number" ? 10 : undefined}
                        autoFocus
                        placeholder={ownPlaceholder}
                        value={draftOwn}
                        onChange={(e) => setDraftOwn(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyOwn();
                          }
                        }}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost px-3 py-1.5 text-xs"
                          onClick={() => setOwnMode(false)}
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary px-3 py-1.5 text-xs"
                          onClick={applyOwn}
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm transition"
                    style={{
                      background: active
                        ? "rgba(232,165,75,0.18)"
                        : "transparent",
                      color: isOwn
                        ? "var(--accent)"
                        : active
                          ? "var(--accent)"
                          : "var(--fg)",
                      fontWeight: isOwn ? 600 : undefined,
                    }}
                    onClick={() => {
                      if (isOwn) {
                        setOwnMode(true);
                        setDraftOwn(
                          options.some((opt) => opt.value === value)
                            ? ""
                            : value,
                        );
                        return;
                      }
                      pick(o.value);
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
