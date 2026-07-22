"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!token) {
      setError("Missing reset token — open the link from your email again");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not update password");
      return;
    }
    router.replace("/login?reset=1");
    router.refresh();
  }

  return (
    <div className="panel rise p-7">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        Enter and confirm your new password, then you’ll return to log in.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <input
          className="field"
          type="password"
          required
          minLength={6}
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <input
          className="field"
          type="password"
          required
          minLength={6}
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <Link
        href="/"
        className="mb-10 font-[family-name:var(--font-syne)] text-xl"
        style={{ fontWeight: 800 }}
      >
        OrzuAi
      </Link>
      <Suspense fallback={<div className="panel p-7 text-sm text-[color:var(--muted)]">Loading…</div>}>
        <ResetForm />
      </Suspense>
    </main>
  );
}
