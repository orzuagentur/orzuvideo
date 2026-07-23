import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";

/** Public marketing / legal pages — shared chrome. */
export function SiteChrome({
  children,
  wide = false,
  bare = false,
}: {
  children: ReactNode;
  wide?: boolean;
  /** Full-bleed layout (landing) — no content max-width wrapper */
  bare?: boolean;
}) {
  return (
    <div className="relative min-h-screen bg-[color:var(--bg)] text-[color:var(--fg)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(1100px 560px at 8% -12%, rgba(232,165,75,0.18), transparent 58%), radial-gradient(800px 480px at 96% 4%, rgba(255,255,255,0.045), transparent 52%), radial-gradient(600px 360px at 50% 100%, rgba(232,165,75,0.06), transparent 60%)",
        }}
      />
      <div
        className={`relative mx-auto flex min-h-screen w-full flex-col ${
          bare
            ? "max-w-none px-0 pb-0 pt-0"
            : `px-5 pb-12 pt-5 sm:px-8 sm:pt-6 ${wide ? "max-w-5xl" : "max-w-3xl"}`
        }`}
      >
        <header
          className={`flex items-center justify-between gap-3 ${
            bare
              ? "px-4 pt-[max(0.85rem,env(safe-area-inset-top))] sm:px-8 sm:pt-6"
              : ""
          }`}
        >
          <BrandLogo href="/" size={34} />
          <nav className="flex items-center gap-1.5 sm:gap-2.5" aria-label="Account">
            <Link
              href="/login"
              className="rounded-full px-3 py-2 text-sm font-medium text-[color:var(--muted)] transition hover:bg-white/5 hover:text-[color:var(--fg)] sm:px-4"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold text-[#1a1208] transition hover:brightness-110 active:scale-[0.98] sm:min-h-11 sm:px-5"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-dim))",
                boxShadow: "0 8px 24px rgba(232,165,75,0.22)",
              }}
            >
              Start free
            </Link>
          </nav>
        </header>
        <div className={`flex-1 ${bare ? "" : ""}`}>{children}</div>
        {!bare ? <SiteFooter /> : null}
      </div>
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-[color:var(--line)] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-[family-name:var(--font-syne)] text-sm font-semibold tracking-tight text-[color:var(--fg)]">
            OrzuAi
          </p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            © {year} · www.orzuai.com
          </p>
        </div>
        <nav
          className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[color:var(--muted)]"
          aria-label="Legal"
        >
          <Link href="/about" className="transition hover:text-[color:var(--fg)]">
            About
          </Link>
          <Link href="/privacy" className="transition hover:text-[color:var(--fg)]">
            Privacy
          </Link>
          <Link href="/terms" className="transition hover:text-[color:var(--fg)]">
            Terms
          </Link>
          <a
            href="mailto:support@orzuai.com"
            className="transition hover:text-[color:var(--fg)]"
          >
            Support
          </a>
        </nav>
      </div>
    </footer>
  );
}

export function LegalArticle({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="mt-12">
      <h1 className="font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        Last updated: {updated}
      </p>
      <div className="prose-legal mt-8 space-y-5 text-[15px] leading-relaxed text-[color:var(--fg)]">
        {children}
      </div>
    </article>
  );
}

export function LegalH2({ children }: { children: ReactNode }) {
  return (
    <h2 className="pt-2 font-[family-name:var(--font-syne)] text-xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}
