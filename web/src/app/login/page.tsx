"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";

function LoginForm() {
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
    setInfo(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setLoading(false);
      if (res.status === 429 && data.retryAfterSec) {
        setError(
          `${data.error || "Too many attempts."} Wait ${Math.ceil(data.retryAfterSec / 60)} min.`,
        );
      } else {
        setError(data.error || "Invalid email or password");
      }
      return;
    }

    // Mark session trusted + device notify — no OTP on login
    const notify = await fetch("/api/auth/session-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "Email & password login" }),
    });
    setLoading(false);

    if (!notify.ok) {
      const notifyData = await notify.json().catch(() => ({}));
      if (notifyData.needsOtp) {
        window.location.assign("/login/verify?mode=signup");
        return;
      }
      setError(
        notifyData.error || "Signed in, but session setup failed. Try again.",
      );
      return;
    }

    // Hard navigation so auth cookies from API responses are applied before
    // the dashboard layout runs (important on mobile / LAN IP testing).
    window.location.assign("/dashboard");
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
      <BrandLogo href="/" size={32} className="mb-10" />
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
