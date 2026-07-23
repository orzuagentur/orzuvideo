"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      router.replace("/users");
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-8"
      >
        <div>
          <div className="mb-4 flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              draggable={false}
            />
            <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
              OrzuAi Admin
            </h1>
          </div>
          <p className="text-sm text-[color:var(--muted)]">
            Sign in with a Supabase account marked as admin.
          </p>
        </div>
        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
            Email
          </span>
          <input
            type="email"
            autoComplete="username"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        {error && (
          <p className="text-sm text-[color:var(--danger)]">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
