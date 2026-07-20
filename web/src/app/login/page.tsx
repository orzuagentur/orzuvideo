"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }

    router.push("/dashboard");
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
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Log in to manage training and publishing.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}
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
    </main>
  );
}
