"use client";

import Link from "next/link";
import { getSource, type SourceEntry } from "@/lib/sources";

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

export function SourceDetail({ id }: { id: string }) {
  const source = getSource(id);

  if (!source) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href="/sources"
          className="text-sm text-[color:var(--muted)] hover:text-[color:var(--fg)]"
        >
          ← Sources
        </Link>
        <p className="text-[color:var(--muted)]">Source not found.</p>
      </div>
    );
  }

  const external =
    source.website.startsWith("http://") ||
    source.website.startsWith("https://");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/sources"
          className="text-sm text-[color:var(--muted)] transition hover:text-[color:var(--fg)]"
        >
          ← Sources
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[color:var(--muted)]">
              {source.categoryLabel}
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight">
              {source.name}
            </h1>
            <p className="mt-2 text-[color:var(--muted)]">{source.tagline}</p>
          </div>
          <StatusPill status={source.status} />
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-[family-name:var(--font-syne)] text-sm font-bold uppercase tracking-wide text-[color:var(--muted)]">
          What it is used for
        </h2>
        <p className="text-[15px] leading-relaxed text-[color:var(--fg)]">
          {source.purpose}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-[family-name:var(--font-syne)] text-sm font-bold uppercase tracking-wide text-[color:var(--muted)]">
          Where it runs
        </h2>
        <ul className="flex flex-wrap gap-2">
          {source.usedIn.map((place) => (
            <li
              key={place}
              className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-elevated)] px-3 py-1.5 text-sm"
            >
              {place}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-[family-name:var(--font-syne)] text-sm font-bold uppercase tracking-wide text-[color:var(--muted)]">
          Details
        </h2>
        <ul className="space-y-2 text-[15px] leading-relaxed text-[color:var(--fg)]">
          {source.details.map((line) => (
            <li
              key={line}
              className="relative pl-4 before:absolute before:left-0 before:top-[0.65em] before:h-1 before:w-1 before:rounded-full before:bg-[color:var(--accent)]"
            >
              {line}
            </li>
          ))}
        </ul>
      </section>

      {source.envKeys.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-[family-name:var(--font-syne)] text-sm font-bold uppercase tracking-wide text-[color:var(--muted)]">
            Environment keys
          </h2>
          <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-4">
            <ul className="space-y-1.5 font-mono text-sm text-[color:var(--fg)]">
              {source.envKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {source.website && (
        <section>
          {external ? (
            <a
              href={source.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-xl bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-black"
            >
              Open {source.name} →
            </a>
          ) : (
            <Link
              href={source.website}
              className="inline-flex rounded-xl bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-black"
            >
              Open in admin →
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
