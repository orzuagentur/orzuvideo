"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";
import { composeFromHeader } from "@/lib/email-from";

export function EmailStudio() {
  const [fromAddress, setFromAddress] = useState("support@orzuai.com");
  const [fromName, setFromName] = useState("Support");
  const [replyTo, setReplyTo] = useState("");
  const [resendConfigured, setResendConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const previewFrom = useMemo(
    () => composeFromHeader(fromName, fromAddress),
    [fromName, fromAddress],
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/email/settings");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Failed to load email settings");
        return;
      }
      setFromAddress(data.fromAddress || "support@orzuai.com");
      setFromName(data.fromName || "Support");
      setReplyTo(data.replyTo || "");
      setResendConfigured(Boolean(data.resendConfigured));
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/email/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAddress,
        fromName,
        replyTo,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr(data.error || "Save failed");
      return;
    }
    setFromAddress(data.fromAddress || fromAddress);
    setFromName(data.fromName || fromName);
    setReplyTo(data.replyTo || "");
    setMsg(`Saved. Emails will send as: ${data.fromEmail || previewFrom}`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
          Email
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted)]">
          Transactional emails via Resend — one shared OrzuAi template. Change
          display name and address; both are used in every outgoing mail.
        </p>
      </header>

      <section className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-syne)] text-sm font-bold uppercase tracking-wide text-[color:var(--muted)]">
            Sending address
          </h2>
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{
              color: resendConfigured ? "var(--success)" : "var(--danger)",
              border: "1px solid var(--line)",
            }}
          >
            {resendConfigured ? "Resend key set" : "Resend key missing"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-[color:var(--muted)]">Display name</span>
            <input
              className="field mt-1.5 w-full"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Support"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[color:var(--muted)]">Email address</span>
            <input
              className="field mt-1.5 w-full"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="support@orzuai.com"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-[color:var(--muted)]">Reply-To (optional)</span>
            <input
              className="field mt-1.5 w-full"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="support@orzuai.com"
            />
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-[color:var(--line)] bg-black/20 px-4 py-3 text-sm">
          <span className="text-[color:var(--muted)]">Will send as · </span>
          <span className="font-mono text-[color:var(--fg)]">{previewFrom}</span>
        </div>

        {err && <p className="mt-3 text-sm text-[color:var(--danger)]">{err}</p>}
        {msg && <p className="mt-3 text-sm text-[color:var(--success)]">{msg}</p>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-4 rounded-xl bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <p className="mt-3 text-xs text-[color:var(--muted)]">
          Example: display name <strong>Support</strong> + address{" "}
          <strong>support@orzuai.com</strong> →{" "}
          <code className="text-[color:var(--fg)]">
            Support &lt;support@orzuai.com&gt;
          </code>
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EMAIL_TEMPLATES.map((t) => (
          <Link
            key={t.id}
            href={`/email/${t.id}`}
            className="group flex flex-col rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-4 transition hover:border-[color:var(--accent)]/50 hover:bg-white/[0.03]"
          >
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold tracking-tight group-hover:text-[color:var(--accent)]">
              {t.name}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-[color:var(--muted)]">
              {t.when}
            </p>
            <p className="mt-3 text-xs text-[color:var(--muted)]">
              Subject: {t.subject}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
