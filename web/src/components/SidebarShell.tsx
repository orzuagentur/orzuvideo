"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/training", label: "AI Training" },
  { href: "/dashboard/schedule", label: "Schedule" },
  { href: "/dashboard/channel", label: "Channel" },
  { href: "/dashboard/content", label: "Content" },
  { href: "/dashboard/costs", label: "Costs" },
];

export function SidebarShell({
  email,
  children,
}: {
  email?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl gap-0 px-0 md:gap-6 md:px-6 md:py-6">
      <aside className="sticky top-0 z-20 flex h-screen w-full max-w-[280px] flex-col border-r border-[color:var(--line)] bg-[color:var(--bg-elevated)]/90 px-4 py-6 backdrop-blur md:rounded-2xl md:border">
        <div className="px-2">
          <p
            className="font-[family-name:var(--font-syne)] text-2xl tracking-tight"
            style={{ fontWeight: 800 }}
          >
            OrzuVideo
          </p>
          <p className="mt-1 truncate text-xs text-[color:var(--muted)]">
            {email || "Studio"}
          </p>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-2.5 text-sm font-medium transition"
                style={{
                  background: active ? "rgba(232,165,75,0.14)" : "transparent",
                  color: active ? "var(--accent)" : "var(--muted)",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 border-t border-[color:var(--line)] pt-4">
          <Link href="/dashboard/channels" className="btn btn-ghost w-full text-sm">
            Switch channel
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost w-full text-sm">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-2 md:py-0">{children}</main>
    </div>
  );
}
