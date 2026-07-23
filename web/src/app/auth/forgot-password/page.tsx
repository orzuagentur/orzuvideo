"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Request failed");
      return;
    }
    setInfo(data.message || "If that email exists, we sent a reset link.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandLogo href="/" size={32} className="mb-10" />
      <div className="panel rise p-7">
        <h1 className="text-2xl font-semibold">Forgot password</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          We’ll email you a link to choose a new password.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            className="field"
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
          {info && <p className="text-sm text-[color:var(--success)]">{info}</p>}
          <button className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <p className="mt-5 text-sm text-[color:var(--muted)]">
          <Link href="/login" className="text-[color:var(--accent)]">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
