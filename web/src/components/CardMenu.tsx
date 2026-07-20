"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Compact ⋯ menu for card corners */
export function CardMenu({
  items,
  align = "right",
}: {
  items: Array<{
    label: string;
    onClick?: () => void;
    href?: string;
    danger?: boolean;
    disabled?: boolean;
  }>;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
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

  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-black/80"
        aria-label="More actions"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span aria-hidden className="text-base font-bold leading-none tracking-widest">
          ···
        </span>
      </button>
      {open && (
        <div
          className={`absolute top-9 z-20 min-w-[160px] overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] py-1 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="menu"
        >
          {visible.map((item) => {
            const className =
              "block w-full px-3 py-2 text-left text-sm transition hover:bg-white/5 disabled:opacity-40";
            const style = item.danger ? { color: "var(--danger)" } : undefined;
            if (item.href) {
              return (
                <a
                  key={item.label}
                  href={item.href}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                  className={className}
                  style={style}
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                  }}
                >
                  {item.label}
                </a>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                className={className}
                style={style}
                role="menuitem"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CardMenuSlot({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute right-2 top-2 z-10"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
