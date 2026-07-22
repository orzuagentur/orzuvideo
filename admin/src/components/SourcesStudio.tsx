"use client";

import Link from "next/link";
import { SOURCES, type SourceEntry } from "@/lib/sources";

function StatusPill({ status }: { status: SourceEntry["status"] }) {
  const label =
    status === "active" ? "Active" : status === "legacy" ? "Legacy" : "Infra";
  const color =
    status === "active"
      ? "var(--success)"
      : status === "legacy"
        ? "var(--muted)"
        : "var(--accent)";
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{
        color,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--line)",
      }}
    >
      {label}
    </span>
  );
}

export function SourcesStudio() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
          Sources
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted)]">
          Every external service and internal source OrzuAi uses — open a card
          for full purpose, where it runs, and which env keys it needs.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SOURCES.map((s) => (
          <Link
            key={s.id}
            href={`/sources/${s.id}`}
            className="group flex flex-col rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-4 transition hover:border-[color:var(--accent)]/50 hover:bg-white/[0.03]"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[color:var(--muted)]">
                {s.categoryLabel}
              </span>
              <StatusPill status={s.status} />
            </div>
            <h2 className="mt-3 font-[family-name:var(--font-syne)] text-lg font-bold tracking-tight group-hover:text-[color:var(--accent)]">
              {s.name}
            </h2>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-[color:var(--muted)]">
              {s.tagline}
            </p>
            <p className="mt-3 text-xs text-[color:var(--muted)]">
              {s.usedIn.join(" · ")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
