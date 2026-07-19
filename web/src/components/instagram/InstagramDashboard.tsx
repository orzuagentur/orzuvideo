"use client";

import Link from "next/link";

export function InstagramDashboard({
  account,
  training,
  stats,
}: {
  account: {
    connected: boolean;
    username: string | null;
    followers: number;
    media: number;
  } | null;
  training: { ready: boolean; hasAvatar: boolean; niche: string | null };
  stats: { ready: number; queued: number; published: number; failed: number };
}) {
  const cards = [
    { label: "Ready drafts", value: stats.ready },
    { label: "Queued", value: stats.queued },
    { label: "Published", value: stats.published },
    { label: "Failed", value: stats.failed },
  ];

  return (
    <div className="space-y-6">
      <header className="rise">
        <h1 className="text-2xl font-semibold">Instagram studio</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Clean Reels platform — avatar, training and content. Separate from YouTube.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="panel rise p-4">
            <p className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
              {c.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{c.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel rise space-y-3 p-5">
          <h2 className="font-semibold">Setup</h2>
          <Row
            ok={training.hasAvatar}
            label="Avatar (HeyGen)"
            href="/instagram/avatar"
          />
          <Row ok={training.ready} label="AI Training" href="/instagram/training" />
          <Row
            ok={Boolean(account?.connected)}
            label="Instagram account"
            href="/instagram/account"
          />
        </div>

        <div className="panel rise space-y-3 p-5 lg:col-span-2">
          <h2 className="font-semibold">Next steps</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[color:var(--muted)]">
            <li>
              Open <Link className="text-[color:var(--fg)] underline" href="/instagram/avatar">Avatar</Link> and
              paste your HeyGen <code>avatar_id</code> + API key in worker env.
            </li>
            <li>
              Train the Instagram AI voice/style in{" "}
              <Link className="text-[color:var(--fg)] underline" href="/instagram/training">AI Training</Link>.
            </li>
            <li>
              Connect Instagram (Meta) when ready in{" "}
              <Link className="text-[color:var(--fg)] underline" href="/instagram/account">Account</Link>.
            </li>
            <li>Create Reels drafts from Content (pipeline wiring next).</li>
          </ol>
          {training.niche && (
            <p className="pt-2 text-xs text-[color:var(--muted)]">
              Niche: {training.niche}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({
  ok,
  label,
  href,
}: {
  ok: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm transition hover:bg-white/5"
    >
      <span>{label}</span>
      <span style={{ color: ok ? "var(--success)" : "var(--muted)" }}>
        {ok ? "Ready" : "Setup"}
      </span>
    </Link>
  );
}
