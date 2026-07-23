"use client";

import { FormEvent, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { isPasswordValid, PASSWORD_MIN_LENGTH } from "@/lib/password";

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
    if (!isPasswordValid(password)) {
      setError(
        `Use at least ${PASSWORD_MIN_LENGTH} characters with a letter, number, and symbol.`,
      );
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
        <div className="space-y-2">
          <input
            className="field"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            placeholder={`New password (min ${PASSWORD_MIN_LENGTH})`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={password} />
        </div>
        <input
          className="field"
          type="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
        <button
          className="btn btn-primary w-full"
          disabled={loading || !isPasswordValid(password)}
        >
          {loading ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandLogo href="/" size={32} className="mb-10" />
      <Suspense
        fallback={
          <div className="panel p-7 text-sm text-[color:var(--muted)]">
            Loading…
          </div>
        }
      >
        <ResetForm />
      </Suspense>
    </main>
  );
}
