"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { ChannelsMenu } from "@/components/ChannelsMenu";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Media", exact: true },
  { href: "/dashboard/avatar", label: "Avatar" },
  { href: "/dashboard/montage", label: "Montage" },
  { href: "/dashboard/content", label: "Creativity" },
  { href: "/dashboard/worker", label: "Worker" },
  { href: "/dashboard/costs", label: "Costs" },
];

function ChannelsQueryOpener({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const channels = searchParams.get("channels");
    if (channels === "add" || channels === "1") {
      onOpen();
      router.replace(pathname);
    }
  }, [searchParams, pathname, router, onOpen]);

  return null;
}

export function AppShell({
  email,
  children,
}: {
  email?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const onChannel = pathname.startsWith("/dashboard/channel");

  return (
    <div className="flex min-h-screen w-full">
      <Suspense fallback={null}>
        <ChannelsQueryOpener onOpen={() => setMenuOpen(true)} />
      </Suspense>

      <aside className="sticky top-0 z-20 flex h-screen w-[280px] shrink-0 flex-col border-r border-[color:var(--line)] bg-[color:var(--bg-elevated)] px-4 py-6">
        <div className="px-2">
          <p
            className="font-[family-name:var(--font-syne)] text-2xl tracking-tight"
            style={{ fontWeight: 800 }}
          >
            OrzuVideo
          </p>
          <p className="mt-1 text-xs font-medium" style={{ color: "var(--accent)" }}>
            YouTube
          </p>
          <p className="mt-0.5 truncate text-xs text-[color:var(--muted)]">
            {email || "Studio"}
          </p>
        </div>

        <div className="relative mt-5">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition"
            style={{
              background: onChannel || menuOpen
                ? "rgba(232,165,75,0.14)"
                : "rgba(255,255,255,0.04)",
              border: "1px solid var(--line)",
              color: onChannel || menuOpen ? "var(--accent)" : "var(--fg)",
            }}
          >
            Ютуб каналы
          </button>
          <ChannelsMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
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
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost w-full text-sm">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-6">
        {children}
      </main>
    </div>
  );
}

/** @deprecated use AppShell — kept for import compatibility */
export const SidebarShell = AppShell;
