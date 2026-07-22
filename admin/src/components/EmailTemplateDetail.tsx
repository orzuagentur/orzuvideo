"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getEmailTemplate,
  previewEmailHtml,
  type EmailTemplateId,
} from "@/lib/email-templates";

export function EmailTemplateDetail({ id }: { id: string }) {
  const meta = getEmailTemplate(id);
  const [fromEmail, setFromEmail] = useState("Support <support@orzuai.com>");
  const [html, setHtml] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/email/settings");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.fromEmail) setFromEmail(data.fromEmail);
    })();
    if (meta) {
      setHtml(
        previewEmailHtml(
          meta.id as EmailTemplateId,
          process.env.NEXT_PUBLIC_APP_URL || "https://www.orzuai.com",
        ),
      );
    }
  }, [meta]);

  if (!meta) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/email" className="text-sm text-[color:var(--muted)]">
          ← Email
        </Link>
        <p className="text-[color:var(--muted)]">Template not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/email"
          className="text-sm text-[color:var(--muted)] hover:text-[color:var(--fg)]"
        >
          ← Email
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight">
          {meta.name}
        </h1>
        <p className="mt-2 text-[color:var(--muted)]">{meta.when}</p>
      </div>

      <section className="space-y-2 rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-4">
        <p className="text-sm">
          <span className="text-[color:var(--muted)]">Subject · </span>
          {meta.subject}
        </p>
        <p className="text-sm">
          <span className="text-[color:var(--muted)]">From · </span>
          <span className="font-mono">{fromEmail}</span>
        </p>
        <p className="text-sm text-[color:var(--muted)]">
          All transactional mail uses the same OrzuAi HTML shell (dark card,
          accent CTA).
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-[family-name:var(--font-syne)] text-sm font-bold uppercase tracking-wide text-[color:var(--muted)]">
          Template preview
        </h2>
        <div className="overflow-hidden rounded-2xl border border-[color:var(--line)]">
          <iframe
            title={meta.name}
            srcDoc={html}
            className="h-[640px] w-full bg-black"
          />
        </div>
      </section>
    </div>
  );
}
