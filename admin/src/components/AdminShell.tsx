"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { MusicUploadProvider } from "@/components/MusicUploadProvider";
import { MusicUploadDock } from "@/components/MusicUploadDock";

const NAV = [
  { href: "/users", label: "Users" },
  { href: "/media", label: "Media" },
  { href: "/music", label: "Music" },
  { href: "/sources", label: "Sources" },
  { href: "/costs", label: "Expenses" },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMedia = pathname === "/media" || pathname.startsWith("/media/");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <MusicUploadProvider>
      <div className="flex min-h-screen w-full flex-col bg-[color:var(--bg)]">
        <header className="sticky top-0 z-50 bg-[color:var(--bg)]/95 backdrop-blur-md">
          <div className="relative flex h-[5.75rem] items-center justify-between px-4 md:h-[6.25rem] md:px-6">
            <Link
              href="/users"
              className="relative z-10 inline-block shrink-0 origin-left font-[family-name:var(--font-syne)] text-[1.7rem] tracking-[0.03em] md:text-[2rem]"
              style={{ fontWeight: 800, transform: "scaleY(1.1)" }}
            >
              OrzuAi
              <span className="ml-2 text-sm font-semibold tracking-wide text-[color:var(--muted)]">
                Admin
              </span>
            </Link>

            <nav className="pointer-events-none absolute inset-0 flex items-center justify-center pt-3 md:pt-4">
              <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto px-2 sm:gap-1.5 md:gap-2">
                {NAV.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="shrink-0 rounded-xl px-4 py-2.5 text-[1.05rem] font-semibold transition md:px-5 md:py-3 md:text-lg"
                      style={{
                        color: active ? "var(--fg)" : "var(--muted)",
                        background: active
                          ? "rgba(255,255,255,0.07)"
                          : "transparent",
                      }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </nav>

            <button
              type="button"
              onClick={() => void logout()}
              className="relative z-10 rounded-xl border border-[color:var(--line)] px-3 py-2 text-sm text-[color:var(--muted)] transition hover:text-[color:var(--fg)]"
            >
              Sign out
            </button>
          </div>
        </header>

        <main
          className={`min-w-0 flex-1 ${isMedia ? "px-0 py-0" : "px-4 py-4 md:px-6 md:py-5"}`}
        >
          {children}
        </main>
        <MusicUploadDock />
      </div>
    </MusicUploadProvider>
  );
}
