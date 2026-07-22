"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
    });

    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }

    if (data.session) {
      await fetch("/api/auth/otp/send", { method: "POST" });
      setLoading(false);
      router.push("/login/verify");
      router.refresh();
      return;
    }

    setLoading(false);
    setInfo("Check your email to confirm, then log in.");
  }

  async function signUpWithGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=/dashboard`,
      },
    });
    if (err) {
      setGoogleLoading(false);
      setError(err.message);
    }
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
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Sign up with Google or email. Connect YouTube and train AI next.
        </p>

        <button
          type="button"
          onClick={() => void signUpWithGoogle()}
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
          />
          <input
            className="field"
            type="password"
            required
            minLength={6}
            placeholder="Password (min 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
          {info && <p className="text-sm text-[color:var(--success)]">{info}</p>}
          <button className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Creating…" : "Sign up"}
          </button>
        </form>
        <p className="mt-4 text-xs text-[color:var(--muted)]">
          By signing up you agree to our{" "}
          <Link href="/terms" className="text-[color:var(--accent)]">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-[color:var(--accent)]">
            Privacy Policy
          </Link>
          .
        </p>
        <p className="mt-5 text-sm text-[color:var(--muted)]">
          Already registered?{" "}
          <Link href="/login" className="text-[color:var(--accent)]">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
