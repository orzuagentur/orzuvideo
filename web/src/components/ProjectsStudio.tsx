"use client";

import Link from "next/link";

type ProjectCard = {
  platform: "youtube" | "instagram";
  name: string;
  enabled: boolean;
};

export function ProjectsStudio({
  youtube,
  instagram,
  projects,
}: {
  youtube: { connected: boolean; title: string | null };
  instagram: { connected: boolean; username: string | null };
  projects: ProjectCard[];
}) {
  const ytName =
    projects.find((p) => p.platform === "youtube")?.name || "YouTube Shorts";
  const igName =
    projects.find((p) => p.platform === "instagram")?.name || "Instagram Reels";

  return (
    <div className="space-y-6">
      <header className="rise">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted)]">
          Each platform is a separate studio — like separate projects in Supabase or
          Vercel. YouTube stays as it is. Instagram is a clean Reels + Avatar space.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/dashboard"
          className="panel rise group block p-6 transition hover:border-[color:rgba(232,165,75,0.45)]"
        >
          <p className="text-xs uppercase tracking-wide text-[color:var(--accent)]">
            Platform
          </p>
          <h2 className="mt-2 text-xl font-semibold">{ytName}</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Existing Shorts pipeline: training, schedule, channel, content, worker.
          </p>
          <p className="mt-4 text-sm">
            Status:{" "}
            <span style={{ color: youtube.connected ? "var(--success)" : "var(--muted)" }}>
              {youtube.connected
                ? youtube.title || "Connected"
                : "Not connected"}
            </span>
          </p>
          <span className="mt-5 inline-flex text-sm font-medium text-[color:var(--accent)] group-hover:underline">
            Open YouTube studio →
          </span>
        </Link>

        <Link
          href="/instagram"
          className="panel rise-delay group block p-6 transition hover:border-[color:rgba(225,48,108,0.45)]"
        >
          <p className="text-xs uppercase tracking-wide" style={{ color: "#e1306c" }}>
            Platform
          </p>
          <h2 className="mt-2 text-xl font-semibold">{igName}</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            New clean space: Avatar (HeyGen), AI training, content, Instagram account.
          </p>
          <p className="mt-4 text-sm">
            Status:{" "}
            <span style={{ color: instagram.connected ? "var(--success)" : "var(--muted)" }}>
              {instagram.connected
                ? `@${instagram.username || "connected"}`
                : "Not connected"}
            </span>
          </p>
          <span
            className="mt-5 inline-flex text-sm font-medium group-hover:underline"
            style={{ color: "#e1306c" }}
          >
            Open Instagram studio →
          </span>
        </Link>
      </div>
    </div>
  );
}
