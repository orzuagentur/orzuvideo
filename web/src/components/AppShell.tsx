"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

const YOUTUBE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/training", label: "AI Training" },
  { href: "/dashboard/schedule", label: "Schedule" },
  { href: "/dashboard/channel", label: "Channel" },
  { href: "/dashboard/content", label: "Content" },
  { href: "/dashboard/worker", label: "Worker" },
  { href: "/dashboard/costs", label: "Costs" },
];

const INSTAGRAM_NAV: NavItem[] = [
  { href: "/instagram", label: "Dashboard", exact: true },
  { href: "/instagram/avatar", label: "Avatar" },
  { href: "/instagram/training", label: "AI Training" },
  { href: "/instagram/schedule", label: "Schedule" },
  { href: "/instagram/account", label: "Account" },
  { href: "/instagram/content", label: "Content" },
  { href: "/instagram/costs", label: "Costs" },
];

function brandLabel(pathname: string) {
  if (pathname.startsWith("/instagram")) return "Instagram";
  if (pathname.startsWith("/projects")) return "Projects";
  return "YouTube";
}

export function AppShell({
  email,
  children,
}: {
  email?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isInstagram = pathname.startsWith("/instagram");
  const isProjects = pathname.startsWith("/projects");
  const nav = isInstagram ? INSTAGRAM_NAV : YOUTUBE_NAV;
  const accent = isInstagram ? "#e1306c" : "var(--accent)";
  const wide = pathname.startsWith("/dashboard/worker");

  return (
    <div
      className={`mx-auto flex min-h-screen w-full gap-0 px-0 md:gap-6 md:px-6 md:py-6 ${
        wide ? "max-w-[1600px]" : "max-w-7xl"
      }`}
    >
      <aside className="sticky top-0 z-20 flex h-screen w-full max-w-[280px] flex-col border-r border-[color:var(--line)] bg-[color:var(--bg-elevated)]/90 px-4 py-6 backdrop-blur md:rounded-2xl md:border">
        <div className="px-2">
          <p
            className="font-[family-name:var(--font-syne)] text-2xl tracking-tight"
            style={{ fontWeight: 800 }}
          >
            OrzuVideo
          </p>
          <p className="mt-1 text-xs font-medium" style={{ color: accent }}>
            {brandLabel(pathname)}
          </p>
          <p className="mt-0.5 truncate text-xs text-[color:var(--muted)]">
            {email || "Studio"}
          </p>
        </div>

        <Link
          href="/projects"
          className="mt-5 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
          style={{
            background: isProjects ? "rgba(232,165,75,0.14)" : "rgba(255,255,255,0.04)",
            border: "1px solid var(--line)",
            color: isProjects ? "var(--accent)" : "var(--fg)",
          }}
        >
          Projects
        </Link>

        {!isProjects && (
          <nav className="mt-6 flex flex-1 flex-col gap-1">
            {nav.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium transition"
                  style={{
                    background: active
                      ? isInstagram
                        ? "rgba(225,48,108,0.14)"
                        : "rgba(232,165,75,0.14)"
                      : "transparent",
                    color: active ? accent : "var(--muted)",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        {isProjects && <div className="flex-1" />}

        <div className="mt-auto space-y-2 border-t border-[color:var(--line)] pt-4">
          {!isInstagram && !isProjects && (
            <Link href="/dashboard/channels" className="btn btn-ghost w-full text-sm">
              Switch channel
            </Link>
          )}
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

/** @deprecated use AppShell — kept for import compatibility */
export const SidebarShell = AppShell;
