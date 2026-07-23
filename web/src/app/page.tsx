import Link from "next/link";
import { SiteChrome, SiteFooter } from "@/components/SiteChrome";
import { BrandLogoWide } from "@/components/BrandLogo";

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

const FEATURES = [
  {
    title: "AI Shorts on schedule",
    body: "Train once — scripts, voice, captions, and publish times run without daily busywork.",
  },
  {
    title: "Clip & create",
    body: "Turn long footage into Shorts, or generate fresh videos from a prompt in AI Video.",
  },
  {
    title: "Your YouTube channel",
    body: "Connect Google once and publish straight to the channel you manage.",
  },
] as const;

export default function HomePage() {
  return (
    <SiteChrome bare>
      {/* Hero — one composition: brand, headline, line, CTAs, visual plane */}
      <section className="relative isolate overflow-hidden">
        {/* Full-bleed visual atmosphere */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
        >
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: "url(/og.png)",
              backgroundSize: "cover",
              backgroundPosition: "center 30%",
              filter: "saturate(0.85) brightness(0.45)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(12,13,16,0.55) 0%, rgba(12,13,16,0.72) 42%, rgba(12,13,16,0.96) 78%, var(--bg) 100%), radial-gradient(900px 420px at 70% 20%, rgba(232,165,75,0.14), transparent 55%)",
            }}
          />
          {/* Soft floating glow */}
          <div
            className="landing-glow absolute -right-16 top-24 h-64 w-64 rounded-full blur-3xl sm:top-16 sm:h-80 sm:w-80"
            style={{ background: "rgba(232,165,75,0.12)" }}
          />
        </div>

        <div className="mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-5xl flex-col justify-center px-4 pb-16 pt-10 sm:min-h-[calc(100svh-5.5rem)] sm:px-8 sm:pb-20 sm:pt-14">
          <div className="landing-rise max-w-xl">
            <BrandLogoWide
              width={200}
              className="max-w-[min(72vw,240px)] w-full sm:max-w-[280px]"
            />
            <h1
              className="mt-7 font-[family-name:var(--font-syne)] text-[1.65rem] leading-[1.15] tracking-tight text-[color:var(--fg)] sm:mt-8 sm:text-4xl sm:leading-[1.12] md:text-[2.75rem]"
              style={{ fontWeight: 800 }}
            >
              Train once. Publish Shorts on autopilot.
            </h1>
            <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-[color:var(--muted)] sm:mt-5 sm:text-lg sm:leading-relaxed">
              AI scripts, voice, media, and captions — one studio for creators
              who want consistent YouTube Shorts without the grind.
            </p>

            <div className="mt-8 flex w-full flex-col gap-3 sm:mt-10 sm:w-auto sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="landing-cta inline-flex min-h-12 w-full items-center justify-center rounded-full px-7 text-base font-semibold text-[#1a1208] transition hover:brightness-110 active:scale-[0.98] sm:w-auto sm:min-h-[3.15rem] sm:px-8"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent), var(--accent-dim))",
                  boxShadow: "0 12px 32px rgba(232,165,75,0.28)",
                }}
              >
                Create account
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[color:var(--line)] bg-white/[0.03] px-7 text-base font-semibold text-[color:var(--fg)] backdrop-blur-sm transition hover:border-[color:rgba(255,255,255,0.22)] hover:bg-white/[0.06] active:scale-[0.98] sm:w-auto sm:min-h-[3.15rem] sm:px-8"
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* One job: what OrzuAi does */}
      <section className="relative border-t border-[color:var(--line)] px-4 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="landing-rise-delay max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--accent)]">
              Built for creators
            </p>
            <h2
              className="mt-3 font-[family-name:var(--font-syne)] text-2xl tracking-tight sm:text-3xl"
              style={{ fontWeight: 800 }}
            >
              From idea to published Short
            </h2>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-[color:var(--muted)] sm:text-base">
              Everything lives in one place — training, clipping, AI Video, and
              your channel schedule.
            </p>
          </div>

          <ul className="mt-10 grid gap-8 sm:mt-12 sm:grid-cols-3 sm:gap-10">
            {FEATURES.map((item, i) => (
              <li
                key={item.title}
                className="landing-feature border-t border-[color:var(--line)] pt-5"
                style={{ animationDelay: `${0.08 + i * 0.08}s` }}
              >
                <p
                  className="font-[family-name:var(--font-syne)] text-lg tracking-tight"
                  style={{ fontWeight: 700 }}
                >
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)] sm:text-[0.95rem]">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-12 flex flex-col gap-3 sm:mt-14 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href="/signup"
              className="inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold text-[#1a1208] transition hover:brightness-110 active:scale-[0.98] sm:min-h-12 sm:px-7 sm:text-base"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent), var(--accent-dim))",
              }}
            >
              Start free
            </Link>
            <Link
              href="/about"
              className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-medium text-[color:var(--muted)] transition hover:text-[color:var(--fg)] sm:text-base"
            >
              Learn more about OrzuAi →
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </SiteChrome>
  );
}
