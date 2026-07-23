"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { ChannelsMenu } from "@/components/ChannelsMenu";
import { ClippingProgressDock } from "@/components/ClippingProgressDock";
import {
  MusicUploadProvider,
} from "@/components/MusicUploadProvider";
import { MusicUploadDock } from "@/components/MusicUploadDock";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", exact: true },
  { href: "/dashboard/creators", label: "For creators" },
  { href: "/dashboard/clipping", label: "AI Clipping" },
  { href: "/dashboard/content", label: "Creativity" },
  { href: "/dashboard/favorites", label: "Library" },
];

const LIBRARY_TABS = [
  { id: "clips", label: "My clips" },
  { id: "videos", label: "My videos" },
  { id: "favorites", label: "Favorites" },
] as const;

const CLIPPING_TABS = [
  { id: "create", label: "Create" },
  { id: "clips", label: "My clips" },
] as const;

const CREATIVITY_TABS = [
  { id: "create", label: "Create" },
  { id: "library", label: "My creations" },
] as const;

function LibraryHeaderTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const raw = searchParams.get("tab");
  const tab =
    raw === "videos" || raw === "favorites" || raw === "clips" ? raw : "clips";

  return (
    <nav
      className="mx-auto flex w-full max-w-3xl gap-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1"
      aria-label="Library sections"
    >
      {LIBRARY_TABS.map((item) => {
        const on = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams.toString());
              next.set("tab", item.id);
              router.replace(`/dashboard/favorites?${next.toString()}`, {
                scroll: false,
              });
            }}
            className="min-w-0 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition"
            style={{
              background: on ? "rgba(232,165,75,0.16)" : "transparent",
              color: on ? "var(--accent)" : "var(--muted)",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function ClippingHeaderTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const raw = searchParams.get("tab");
  const tab = raw === "clips" || raw === "create" ? raw : "create";

  return (
    <nav
      className="mx-auto flex w-full max-w-2xl gap-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1"
      aria-label="AI Clipping sections"
    >
      {CLIPPING_TABS.map((item) => {
        const on = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams.toString());
              next.set("tab", item.id);
              router.replace(`/dashboard/clipping?${next.toString()}`, {
                scroll: false,
              });
            }}
            className="min-w-0 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition"
            style={{
              background: on ? "rgba(232,165,75,0.16)" : "transparent",
              color: on ? "var(--accent)" : "var(--muted)",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function CreativityHeaderTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const raw = searchParams.get("tab");
  const tab = raw === "library" || raw === "create" ? raw : "create";

  return (
    <nav
      className="mx-auto flex w-full max-w-2xl gap-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1"
      aria-label="Creativity sections"
    >
      {CREATIVITY_TABS.map((item) => {
        const on = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams.toString());
              next.set("tab", item.id);
              router.replace(`/dashboard/content?${next.toString()}`, {
                scroll: false,
              });
            }}
            className="min-w-0 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition"
            style={{
              background: on ? "rgba(232,165,75,0.16)" : "transparent",
              color: on ? "var(--accent)" : "var(--muted)",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

type ChannelsCtx = {
  menuOpen: boolean;
  setMenuOpen: (v: boolean | ((p: boolean) => boolean)) => void;
};

const ChannelsContext = createContext<ChannelsCtx | null>(null);

export function useChannelsMenu() {
  const ctx = useContext(ChannelsContext);
  if (!ctx) {
    throw new Error("useChannelsMenu must be used within AppShell");
  }
  return ctx;
}

/** Official YouTube mark — white body for use on the red channel button */
export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="16"
      viewBox="0 0 28 20"
      aria-hidden
    >
      <path
        fill="#fff"
        d="M27.43 3.13A3.52 3.52 0 0 0 24.95.64C22.74 0 14 0 14 0S5.26 0 3.05.64A3.52 3.52 0 0 0 .57 3.13 36.8 36.8 0 0 0 0 10a36.8 36.8 0 0 0 .57 6.87 3.52 3.52 0 0 0 2.48 2.49C5.26 20 14 20 14 20s8.74 0 10.95-.64a3.52 3.52 0 0 0 2.48-2.49A36.8 36.8 0 0 0 28 10a36.8 36.8 0 0 0-.57-6.87Z"
      />
      <path fill="#FF0000" d="M11.2 14.29V5.71L18.4 10l-7.2 4.29Z" />
    </svg>
  );
}

function TinyChevron({ open = false }: { open?: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{
        transform: open ? "rotate(180deg)" : undefined,
        transition: "transform 0.15s ease",
        opacity: 0.85,
      }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function YouTubeChannelsButton({
  className = "",
}: {
  className?: string;
}) {
  const pathname = usePathname();
  const { menuOpen, setMenuOpen } = useChannelsMenu();
  const onChannel =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/channel");

  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
        style={{
          background: "#FF0000",
          boxShadow:
            menuOpen || onChannel
              ? "0 0 0 2px rgba(255,255,255,0.2)"
              : "0 6px 18px rgba(255,0,0,0.28)",
        }}
      >
        <YouTubeIcon />
        <span className="whitespace-nowrap">YouTube Channels</span>
        <TinyChevron open={menuOpen} />
      </button>
      <ChannelsMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

function AccountMenu({ email }: { email?: string | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { setMenuOpen } = useChannelsMenu();
  const initial = (email || "U").slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Account"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line)] bg-white/5 text-sm font-semibold uppercase transition hover:bg-white/10"
        style={{
          boxShadow: open ? "0 0 0 2px rgba(232,165,75,0.35)" : undefined,
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-[80] mt-2 w-[min(100vw-2rem,260px)] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] shadow-2xl"
          role="dialog"
          aria-label="Account menu"
        >
          <div className="border-b border-[color:var(--line)] px-4 py-3">
            <p className="text-xs text-[color:var(--muted)]">Signed in</p>
            <p className="mt-0.5 truncate text-sm font-medium">
              {email || "Account"}
            </p>
          </div>
          <div className="p-2">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-white/5"
              onClick={() => {
                setOpen(false);
                setMenuOpen(true);
              }}
            >
              <YouTubeIcon className="shrink-0 scale-90" />
              <span>YouTube Channels</span>
            </button>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-[color:var(--muted)] transition hover:bg-white/5 hover:text-[color:var(--fg)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelsQueryOpener() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { setMenuOpen } = useChannelsMenu();

  useEffect(() => {
    const channels = searchParams.get("channels");
    if (channels === "add" || channels === "1") {
      setMenuOpen(true);
      router.replace(pathname);
    }
  }, [searchParams, pathname, router, setMenuOpen]);

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
  const isCreators = pathname.startsWith("/dashboard/creators");
  const isLibrary = pathname.startsWith("/dashboard/favorites");
  const isClipping = pathname.startsWith("/dashboard/clipping");
  const isCreativity = pathname.startsWith("/dashboard/content");
  const isEditor = pathname.startsWith("/dashboard/editor");
  const ctx = { menuOpen, setMenuOpen };

  if (isEditor) {
    return (
      <ChannelsContext.Provider value={ctx}>
        <div className="min-h-screen w-full bg-[color:var(--bg)]">{children}</div>
      </ChannelsContext.Provider>
    );
  }

  return (
    <ChannelsContext.Provider value={ctx}>
      <MusicUploadProvider>
        <div className="flex min-h-screen w-full flex-col bg-[color:var(--bg)]">
          <Suspense fallback={null}>
            <ChannelsQueryOpener />
          </Suspense>

          {/* No divider strip under the top bar */}
          <header className="sticky top-0 z-50 bg-[color:var(--bg)]/95 backdrop-blur-md">
            {/* Tall band so section links sit midway between top of screen and search */}
            <div className="relative flex h-[5.75rem] items-center justify-between px-4 md:h-[6.25rem] md:px-6">
              <BrandLogo href="/dashboard" size={40} />

              {/* Slightly below vertical center, toward the search row */}
              <nav className="pointer-events-none absolute inset-0 flex items-center justify-center pt-3 md:pt-4">
                <div className="pointer-events-auto flex max-w-[min(100%,54rem)] items-center gap-1 overflow-x-auto px-2 sm:gap-1.5 md:gap-2">
                  {NAV.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname === item.href ||
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

              <div className="relative z-10 shrink-0">
                <AccountMenu email={email} />
              </div>
            </div>

            {/* Library / AI Clipping / Creativity: section tabs in sticky header */}
            {!isCreators && (
              <div
                className={`flex items-center px-4 pb-3 md:px-6 ${
                  isClipping || isCreativity || isLibrary
                    ? "w-full justify-center"
                    : "gap-3"
                }`}
              >
                {isLibrary ? (
                  <Suspense
                    fallback={
                      <div className="h-10 w-full max-w-3xl rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]" />
                    }
                  >
                    <LibraryHeaderTabs />
                  </Suspense>
                ) : isClipping ? (
                  <Suspense
                    fallback={
                      <div className="h-10 w-full max-w-2xl rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]" />
                    }
                  >
                    <ClippingHeaderTabs />
                  </Suspense>
                ) : isCreativity ? (
                  <Suspense
                    fallback={
                      <div className="h-10 w-full max-w-2xl rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]" />
                    }
                  >
                    <CreativityHeaderTabs />
                  </Suspense>
                ) : (
                  <YouTubeChannelsButton />
                )}
              </div>
            )}
          </header>

          <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-5">
            {children}
          </main>
          <MusicUploadDock />
          <ClippingProgressDock />
        </div>
      </MusicUploadProvider>
    </ChannelsContext.Provider>
  );
}

/** @deprecated use AppShell — kept for import compatibility */
export const SidebarShell = AppShell;
