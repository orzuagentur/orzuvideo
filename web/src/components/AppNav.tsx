"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/content", label: "Content" },
  { href: "/training", label: "AI training" },
  { href: "/dashboard/channels", label: "Channel" },
];

export function AppNav({ email }: { email?: string | null }) {
  const pathname = usePathname();

  return (
    <header className="mb-10 space-y-6 rise">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p
            className="font-[family-name:var(--font-syne)] text-2xl"
            style={{ fontWeight: 800 }}
          >
            OrzuVideo
          </p>
          {email ? (
            <p className="mt-1 text-sm text-[color:var(--muted)]">{email}</p>
          ) : null}
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-ghost text-sm">
            Sign out
          </button>
        </form>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-[color:var(--line)] pb-3">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-full px-4 py-2 text-sm font-medium transition"
              style={{
                background: active ? "rgba(232,165,75,0.16)" : "transparent",
                color: active ? "var(--accent)" : "var(--muted)",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
