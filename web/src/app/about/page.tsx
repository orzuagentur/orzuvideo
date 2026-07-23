import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "@/components/SiteChrome";
import { BrandLogoWide } from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "About OrzuAi — AI YouTube Shorts Studio",
  description:
    "OrzuAi is an AI creator studio for YouTube Shorts: scripts, voice, captions, stock montage, AI clipping, music, and YouTube publishing from www.orzuai.com.",
  keywords: [
    "OrzuAi",
    "AI YouTube Shorts",
    "AI video generator",
    "YouTube Shorts automation",
    "AI clipping",
    "creator studio",
    "auto publish Shorts",
  ],
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About OrzuAi",
    description:
      "Train once. Create and publish YouTube Shorts with AI scripts, voice, media, and scheduling.",
    url: "https://www.orzuai.com/about",
    siteName: "OrzuAi",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "OrzuAi" }],
  },
};

export default function AboutPage() {
  return (
    <SiteChrome>
      <article className="mx-auto max-w-2xl space-y-8 pb-16 pt-10">
        <header className="space-y-3">
          <BrandLogoWide width={180} />
          <h1 className="text-2xl font-semibold">
            AI studio for YouTube Shorts and short-form video
          </h1>
          <p className="text-[color:var(--muted)]">
            OrzuAi helps creators generate scripts, voiceovers, captions, and
            edited Shorts — then optionally publish to YouTube on a schedule.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            What you can do
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-[color:var(--muted)]">
            <li>Train your AI once for channel niche, tone, and language</li>
            <li>Generate and publish YouTube Shorts with AI scripts and voice</li>
            <li>Create personal videos from a free-form prompt (Creativity)</li>
            <li>Build AI clips and montages with transitions and captions</li>
            <li>Use a music library and creator 3D / HDRI assets</li>
            <li>Connect Google / YouTube OAuth to publish from your channel</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            Why creators choose OrzuAi
          </h2>
          <p className="text-sm text-[color:var(--muted)]">
            OrzuAi is built as a full creator workflow — not a one-off chat
            prompt. Scripts, media montage, music, captions, library, and
            YouTube publishing live in one product at{" "}
            <strong className="text-[color:var(--fg)]">www.orzuai.com</strong>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            Contact
          </h2>
          <p className="text-sm text-[color:var(--muted)]">
            Support:{" "}
            <a
              className="text-[color:var(--accent)] hover:underline"
              href="mailto:support@orzuai.com"
            >
              support@orzuai.com
            </a>
          </p>
        </section>

        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/signup" className="btn btn-primary">
            Create account
          </Link>
          <Link href="/" className="btn btn-ghost">
            Back home
          </Link>
        </div>
      </article>
    </SiteChrome>
  );
}
