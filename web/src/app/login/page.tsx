"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (params.get("reset") === "1") {
      setInfo("Password updated. Log in with your new password.");
    }
    if (params.get("error") === "oauth") {
      setError("Google sign-in failed. Try again or use email.");
    }
  }, [params]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }

    const otpRes = await fetch("/api/auth/otp/send", { method: "POST" });
    const otpData = await otpRes.json().catch(() => ({}));
    setLoading(false);

    if (!otpRes.ok) {
      setError(otpData.error || "Could not send verification code");
      return;
    }

    if (otpData.devCode) {
      sessionStorage.setItem("orzu_dev_otp", String(otpData.devCode));
    }
    router.push("/login/verify");
    router.refresh();
  }

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=/dashboard`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (err) {
      setGoogleLoading(false);
      setError(err.message);
    }
  }

  return (
    <div className="panel rise p-7">
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        Log in to manage training and publishing.
      </p>

      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        disabled={googleLoading || loading}
        className="btn mt-6 w-full border border-[color:var(--line)] bg-transparent"
      >
        {googleLoading ? "Redirecting…" : "Continue with Google"}
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-[color:var(--muted)]">
        <span className="h-px flex-1 bg-[color:var(--line)]" />
        or email
        <span className="h-px flex-1 bg-[color:var(--line)]" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <input
          className="field"
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="field"
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <div className="flex justify-end">
          <Link
            href="/auth/forgot-password"
            className="text-sm text-[color:var(--accent)]"
          >
            Forgot password?
          </Link>
        </div>
        {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
        {info && <p className="text-sm text-[color:var(--success)]">{info}</p>}
        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Signing in…" : "Log in"}
        </button>
      </form>
      <p className="mt-5 text-sm text-[color:var(--muted)]">
        New here?{" "}
        <Link href="/signup" className="text-[color:var(--accent)]">
          Create account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <Link
        href="/"
        className="mb-10 font-[family-name:var(--font-syne)] text-xl"
        style={{ fontWeight: 800 }}
      >
        OrzuAi
      </Link>
      <Suspense
        fallback={
          <div className="panel p-7 text-sm text-[color:var(--muted)]">
            Loading…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
