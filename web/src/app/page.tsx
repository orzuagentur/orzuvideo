import Link from "next/link";
import { SiteChrome } from "@/components/SiteChrome";

export const metadata = {
  title: "OrzuAi — AI YouTube Shorts Studio",
  description:
    "OrzuAi helps creators generate and publish YouTube Shorts with AI scripts, voice, media, captions, AI clipping, and scheduling at www.orzuai.com.",
  keywords: [
    "OrzuAi",
    "AI YouTube Shorts",
    "AI video generator",
    "YouTube Shorts automation",
  ],
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <SiteChrome wide>
      <section className="relative mt-16 flex flex-1 flex-col justify-center sm:mt-20">
        <p
          className="font-[family-name:var(--font-syne)] text-5xl leading-[1.05] tracking-tight sm:text-7xl"
          style={{ fontWeight: 800 }}
        >
          OrzuAi
        </p>
        <h1 className="mt-5 max-w-2xl text-2xl leading-snug text-[color:var(--fg)] sm:text-3xl">
          Train your AI once. Create and publish YouTube Shorts on autopilot.
        </h1>
        <p className="mt-4 max-w-xl text-base text-[color:var(--muted)] sm:text-lg">
          OrzuAi is a creator studio: AI scripts and voice, stock and library
          media, editing tools, your own music library, and optional YouTube
          publishing — from one dashboard at{" "}
          <span className="text-[color:var(--fg)]">www.orzuai.com</span>.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/signup" className="btn btn-primary">
            Create account
          </Link>
          <Link href="/login" className="btn btn-ghost">
            Log in
          </Link>
          <Link href="/about" className="btn btn-ghost">
            About
          </Link>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-3">
          {[
            {
              t: "AI Shorts",
              d: "Scripts, voice, captions, and scheduling for daily Shorts.",
            },
            {
              t: "AI clipping & creativity",
              d: "Prompt-based videos, montage transitions, and clip remixes.",
            },
            {
              t: "YouTube connect",
              d: "Optional Google/YouTube OAuth to publish from your channel.",
            },
          ].map((item) => (
            <li
              key={item.t}
              className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]/60 p-4"
            >
              <p className="font-[family-name:var(--font-syne)] font-semibold">
                {item.t}
              </p>
              <p className="mt-1.5 text-sm text-[color:var(--muted)]">{item.d}</p>
            </li>
          ))}
        </ul>
      </section>
    </SiteChrome>
  );
}
