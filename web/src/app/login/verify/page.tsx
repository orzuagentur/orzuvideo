"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginVerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const dev = sessionStorage.getItem("orzu_dev_otp");
    if (dev) {
      setInfo(`Dev mode (no Resend key): code is ${dev}`);
      sessionStorage.removeItem("orzu_dev_otp");
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Verification failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function resend() {
    setResending(true);
    setError(null);
    const res = await fetch("/api/auth/otp/send", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setResending(false);
    if (!res.ok) {
      setError(data.error || "Could not resend code");
      return;
    }
    if (data.devCode) {
      setInfo(`Dev mode: code is ${data.devCode}`);
    } else {
      setInfo("A new code was sent to your email.");
    }
  }

  async function cancel() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <Link
        href="/"
        className="mb-10 font-[family-name:var(--font-syne)] text-xl"
        style={{ fontWeight: 800 }}
      >
        OrzuAi
      </Link>
      <div className="panel rise p-7">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Enter the 6-digit code we sent to finish signing in.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            className="field tracking-[0.35em] text-center text-lg"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
          {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
          {info && <p className="text-sm text-[color:var(--success)]">{info}</p>}
          <button className="btn btn-primary w-full" disabled={loading || code.length !== 6}>
            {loading ? "Verifying…" : "Confirm & continue"}
          </button>
        </form>
        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="text-[color:var(--accent)]"
            disabled={resending}
            onClick={() => void resend()}
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
          <button
            type="button"
            className="text-[color:var(--muted)]"
            onClick={() => void cancel()}
          >
            Back to login
          </button>
        </div>
      </div>
    </main>
  );
}
