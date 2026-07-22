import Link from "next/link";
import type { ReactNode } from "react";

/** Public marketing / legal pages — shared chrome. */
export function SiteChrome({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative min-h-screen bg-[color:var(--bg)] text-[color:var(--fg)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(900px 480px at 12% -8%, rgba(232,165,75,0.16), transparent 55%), radial-gradient(700px 400px at 90% 10%, rgba(255,255,255,0.04), transparent 50%)",
        }}
      />
      <div
        className={`relative mx-auto flex min-h-screen w-full flex-col px-5 pb-12 pt-6 sm:px-8 ${
          wide ? "max-w-5xl" : "max-w-3xl"
        }`}
      >
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="font-[family-name:var(--font-syne)] text-2xl tracking-tight"
            style={{ fontWeight: 800 }}
          >
            OrzuAi
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <Link
              href="/privacy"
              className="rounded-lg px-2.5 py-1.5 text-[color:var(--muted)] transition hover:text-[color:var(--fg)]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="rounded-lg px-2.5 py-1.5 text-[color:var(--muted)] transition hover:text-[color:var(--fg)]"
            >
              Terms
            </Link>
            <Link href="/login" className="btn btn-ghost text-sm">
              Log in
            </Link>
            <Link href="/signup" className="btn btn-primary text-sm">
              Start free
            </Link>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </div>
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-[color:var(--line)] pt-6 text-sm text-[color:var(--muted)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} OrzuAi · www.orzuai.com</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/" className="hover:text-[color:var(--fg)]">
            Home
          </Link>
          <Link href="/privacy" className="hover:text-[color:var(--fg)]">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-[color:var(--fg)]">
            Terms of Service
          </Link>
          <a
            href="mailto:support@orzuai.com"
            className="hover:text-[color:var(--fg)]"
          >
            support@orzuai.com
          </a>
        </div>
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
