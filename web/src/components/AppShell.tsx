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
import { ChannelTransferModal } from "@/components/ChannelTransferModal";
import { NoYoutubeChannelModal } from "@/components/NoYoutubeChannelModal";
import { ChannelsMenu } from "@/components/ChannelsMenu";
import { ClippingProgressDock } from "@/components/ClippingProgressDock";
import { MusicUploadProvider } from "@/components/MusicUploadProvider";
import { MusicUploadDock } from "@/components/MusicUploadDock";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  icon: "home" | "youtube" | "creators" | "clipping" | "creativity" | "library" | "account";
};

/** Primary tabs — bottom bar + desktop center */
const PRIMARY_NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    exact: true,
    icon: "home",
  },
  {
    href: "/dashboard/clipping",
    label: "AI Clipping",
    icon: "clipping",
  },
  {
    href: "/dashboard/content",
    label: "AI Video",
    icon: "creativity",
  },
];

/** Items moved into the top hamburger menu */
const MENU_NAV: NavItem[] = [
  {
    href: "/dashboard/channel",
    label: "YouTube",
    icon: "youtube",
  },
  {
    href: "/dashboard/creators",
    label: "For creators",
    icon: "creators",
  },
  {
    href: "/dashboard/favorites",
    label: "Library",
    icon: "library",
  },
];

const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...MENU_NAV];

const LIBRARY_TABS = [
  { id: "clips", label: "My clips", short: "Clips" },
  { id: "videos", label: "My videos", short: "Videos" },
  { id: "favorites", label: "Favorites", short: "Favs" },
] as const;

const CLIPPING_TABS = [
  { id: "create", label: "Create", short: "Create" },
  { id: "clips", label: "My clips", short: "Clips" },
] as const;

const CREATIVITY_TABS = [
  { id: "create", label: "Create", short: "Create" },
  { id: "library", label: "My creations", short: "Mine" },
] as const;

function NavIcon({
  name,
  active,
  size = 18,
}: {
  name: NavItem["icon"];
  active?: boolean;
  size?: number;
}) {
  const stroke = active ? "var(--accent)" : "currentColor";
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke,
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common} viewBox="0 0 28 20" width={size} height={Math.round(size * 0.72)}>
          <path
            fill={active ? "var(--accent)" : "currentColor"}
            stroke="none"
            d="M27.43 3.13A3.52 3.52 0 0 0 24.95.64C22.74 0 14 0 14 0S5.26 0 3.05.64A3.52 3.52 0 0 0 .57 3.13 36.8 36.8 0 0 0 0 10a36.8 36.8 0 0 0 .57 6.87 3.52 3.52 0 0 0 2.48 2.49C5.26 20 14 20 14 20s8.74 0 10.95-.64a3.52 3.52 0 0 0 2.48-2.49A36.8 36.8 0 0 0 28 10a36.8 36.8 0 0 0-.57-6.87Z"
            opacity={active ? 1 : 0.85}
          />
          <path
            fill={active ? "#0c0c0c" : "#FF0000"}
            stroke="none"
            d="M11.2 14.29V5.71L18.4 10l-7.2 4.29Z"
          />
        </svg>
      );
    case "creators":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <circle cx="16.5" cy="9.5" r="2.4" />
          <path d="M3.5 19c.8-3.2 2.9-5 5.5-5s4.7 1.8 5.5 5" />
          <path d="M14 19c.4-1.8 1.6-3 3.2-3 1.4 0 2.5.8 3.1 2.2" />
        </svg>
      );
    case "clipping":
      /* Professional scissors / cut mark */
      return (
        <svg {...common}>
          <circle cx="6.5" cy="7" r="2.4" />
          <circle cx="6.5" cy="17" r="2.4" />
          <path d="M8.7 8.4 20 3.5" />
          <path d="M8.7 15.6 20 20.5" />
          <path d="M14.2 12h6.3" />
        </svg>
      );
    case "creativity":
      /* Video play — AI Video */
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path
            d="M10.2 9.2v5.6L15.5 12 10.2 9.2Z"
            fill={active ? "var(--accent)" : "currentColor"}
            stroke="none"
            opacity={active ? 1 : 0.9}
          />
        </svg>
      );
    case "library":
      return (
        <svg {...common}>
          <path d="M5 4.5h10.5A1.5 1.5 0 0 1 17 6v13.2l-5.5-2.6L6 19.2V6A1.5 1.5 0 0 1 7.5 4.5" />
          <path d="M17 7.2h1.5A1.5 1.5 0 0 1 20 8.7v10.5" />
        </svg>
      );
    case "account":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.4" />
          <path d="M5 19.5c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" />
        </svg>
      );
    default:
      return null;
  }
}

function MenuIcon({ open }: { open?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 lg:hidden"
      aria-label="Main"
    >
      <div
        className="pointer-events-auto relative flex w-full max-w-[22rem] items-stretch justify-between gap-1 overflow-hidden rounded-full border px-1.5 py-1.5 backdrop-blur-2xl"
        style={{
          borderColor: "rgba(255,255,255,0.18)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 28%, rgba(18,20,26,0.78) 55%, rgba(12,14,18,0.92) 100%)",
          boxShadow:
            "0 14px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <span
          className="pointer-events-none absolute inset-x-3 top-0 h-1/2 rounded-full opacity-70"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 55%, transparent 100%)",
          }}
          aria-hidden
        />
        {PRIMARY_NAV.map((item) => {
          const active = isNavActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative z-[1] flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-1.5 py-1.5 transition active:scale-[0.96]"
              style={{
                color: active ? "var(--accent)" : "var(--muted)",
                background: active ? "rgba(232,165,75,0.14)" : "transparent",
                boxShadow: active
                  ? "inset 0 1px 0 rgba(255,255,255,0.12)"
                  : undefined,
              }}
              aria-current={active ? "page" : undefined}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <NavIcon name={item.icon} active={active} size={20} />
              </span>
              <span className="max-w-full text-center text-[10px] font-semibold leading-tight tracking-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SectionTabButton({
  on,
  label,
  short,
  onClick,
}: {
  on: boolean;
  label: string;
  short: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 flex-1 rounded-full px-2 py-2 text-xs font-semibold transition sm:rounded-lg sm:px-4 sm:text-sm"
      style={{
        background: on ? "rgba(232,165,75,0.16)" : "transparent",
        color: on ? "var(--accent)" : "var(--muted)",
      }}
    >
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function LibraryHeaderTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const raw = searchParams.get("tab");
  const tab =
    raw === "videos" || raw === "favorites" || raw === "clips" ? raw : "clips";

  return (
    <nav
      className="mx-auto flex w-full max-w-3xl gap-1 rounded-full border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1 sm:rounded-xl"
      aria-label="Library sections"
    >
      {LIBRARY_TABS.map((item) => (
        <SectionTabButton
          key={item.id}
          on={tab === item.id}
          label={item.label}
          short={item.short}
          onClick={() => {
            const next = new URLSearchParams(searchParams.toString());
            next.set("tab", item.id);
            router.replace(`/dashboard/favorites?${next.toString()}`, {
              scroll: false,
            });
          }}
        />
      ))}
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
      className="mx-auto flex w-full max-w-2xl gap-1 rounded-full border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1 sm:rounded-xl"
      aria-label="AI Clipping sections"
    >
      {CLIPPING_TABS.map((item) => (
        <SectionTabButton
          key={item.id}
          on={tab === item.id}
          label={item.label}
          short={item.short}
          onClick={() => {
            const next = new URLSearchParams(searchParams.toString());
            next.set("tab", item.id);
            router.replace(`/dashboard/clipping?${next.toString()}`, {
              scroll: false,
            });
          }}
        />
      ))}
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
      className="mx-auto flex w-full max-w-2xl gap-1 rounded-full border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1 sm:rounded-xl"
      aria-label="AI Video sections"
    >
      {CREATIVITY_TABS.map((item) => (
        <SectionTabButton
          key={item.id}
          on={tab === item.id}
          label={item.label}
          short={item.short}
          onClick={() => {
            const next = new URLSearchParams(searchParams.toString());
            next.set("tab", item.id);
            router.replace(`/dashboard/content?${next.toString()}`, {
              scroll: false,
            });
          }}
        />
      ))}
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
    pathname === "/dashboard/channel" ||
    (pathname.startsWith("/dashboard/channel/") &&
      !pathname.startsWith("/dashboard/channel/training"));

  return (
    <div className={`relative shrink-0 ${className}`} data-channels-toggle>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        className="inline-flex h-9 w-full max-w-full items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] sm:h-10 sm:w-auto sm:justify-start sm:px-4"
        style={{
          background: "#FF0000",
          boxShadow:
            menuOpen || onChannel
              ? "0 0 0 2px rgba(255,255,255,0.2)"
              : "0 6px 18px rgba(255,0,0,0.28)",
        }}
      >
        <YouTubeIcon />
        <span className="truncate sm:hidden">Channels</span>
        <span className="hidden whitespace-nowrap sm:inline">
          YouTube Channels
        </span>
        <TinyChevron open={menuOpen} />
      </button>
      <ChannelsMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

function AppMenu({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setAccountOpen(false);
      return;
    }
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
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line)] bg-white/5 text-[color:var(--fg)] transition hover:bg-white/10 sm:h-10 sm:w-10"
        style={{
          boxShadow: open ? "0 0 0 2px rgba(232,165,75,0.35)" : undefined,
        }}
      >
        <MenuIcon open={open} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-[80] mt-2 w-[min(100vw-2rem,280px)] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] shadow-2xl"
          role="dialog"
          aria-label="Main menu"
        >
          <div className="p-2">
            {MENU_NAV.map((item) => {
              const active = isNavActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-white/5"
                  style={{
                    color: active ? "var(--accent)" : "var(--fg)",
                    background: active
                      ? "rgba(232,165,75,0.1)"
                      : "transparent",
                  }}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[color:var(--muted)]">
                    <NavIcon name={item.icon} active={active} size={18} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="border-t border-[color:var(--line)] p-2">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-white/5"
              onClick={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[color:var(--muted)]">
                <NavIcon name="account" size={18} />
              </span>
              <span className="flex-1">Account</span>
              <TinyChevron open={accountOpen} />
            </button>
            {accountOpen && (
              <div className="mx-1 mb-1 mt-1 space-y-1 rounded-xl border border-[color:var(--line)] bg-black/20 px-3 py-2.5">
                <p className="text-[11px] text-[color:var(--muted)]">
                  Signed in
                </p>
                <p className="truncate text-sm font-medium">
                  {email || "Account"}
                </p>
                <form action="/auth/signout" method="post" className="pt-1">
                  <button
                    type="submit"
                    className="w-full rounded-lg py-2 text-left text-sm text-[color:var(--muted)] transition hover:text-[color:var(--fg)]"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
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
  const isLibrary = pathname.startsWith("/dashboard/favorites");
  const isClipping = pathname.startsWith("/dashboard/clipping");
  const isCreativity = pathname.startsWith("/dashboard/content");
  const isEditor = pathname.startsWith("/dashboard/editor");
  const pageTitle =
    ALL_NAV.find((item) => isNavActive(pathname, item))?.label || "OrzuAi";
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
            <ChannelTransferModal />
            <NoYoutubeChannelModal />
          </Suspense>

          <header className="sticky top-0 z-50 bg-[color:var(--bg)]/95 backdrop-blur-md">
            <div className="relative flex h-14 items-center justify-between gap-3 px-3 sm:h-[5.75rem] sm:px-4 md:h-[6.25rem] md:px-6">
              <BrandLogo
                href="/dashboard"
                size={32}
                withWordmark={false}
                className="lg:hidden"
              />
              <span className="hidden lg:inline-flex">
                <BrandLogo href="/dashboard" size={40} />
              </span>

              {/* Desktop / tablet top nav */}
              <nav className="pointer-events-none absolute inset-0 hidden items-center justify-center pt-3 lg:flex lg:pt-4">
                <div className="pointer-events-auto flex max-w-[min(100%,40rem)] items-center gap-1 overflow-x-auto px-2 md:gap-2">
                  {PRIMARY_NAV.map((item) => {
                    const active = isNavActive(pathname, item);
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

              {/* Compact title on small screens — hide on Clipping (title sits above tabs) */}
              <p
                className={`min-w-0 flex-1 truncate text-center text-sm font-semibold tracking-tight lg:hidden ${
                  isClipping ? "invisible" : ""
                }`}
                aria-hidden={isClipping || undefined}
              >
                {pageTitle}
              </p>

              <div className="relative z-10 shrink-0">
                <AppMenu email={email} />
              </div>
            </div>

            {(isLibrary || isClipping || isCreativity) && (
              <div
                className={`flex flex-col items-center px-3 pb-2.5 sm:px-4 sm:pb-3 md:px-6 ${
                  isClipping || isCreativity || isLibrary
                    ? "w-full"
                    : "gap-3"
                }`}
              >
                {isClipping && (
                  <h1
                    className="mb-2 w-full text-center font-[family-name:var(--font-syne)] text-xl tracking-tight lg:hidden"
                    style={{ fontWeight: 800 }}
                  >
                    AI Clipping
                  </h1>
                )}
                <div
                  className={`flex w-full items-center ${
                    isClipping || isCreativity || isLibrary
                      ? "justify-center"
                      : "gap-3"
                  }`}
                >
                {isLibrary ? (
                  <Suspense
                    fallback={
                      <div className="h-10 w-full max-w-3xl rounded-full border border-[color:var(--line)] bg-[color:var(--bg-elevated)] sm:rounded-xl" />
                    }
                  >
                    <LibraryHeaderTabs />
                  </Suspense>
                ) : isClipping ? (
                  <Suspense
                    fallback={
                      <div className="h-10 w-full max-w-2xl rounded-full border border-[color:var(--line)] bg-[color:var(--bg-elevated)] sm:rounded-xl" />
                    }
                  >
                    <ClippingHeaderTabs />
                  </Suspense>
                ) : (
                  <Suspense
                    fallback={
                      <div className="h-10 w-full max-w-2xl rounded-full border border-[color:var(--line)] bg-[color:var(--bg-elevated)] sm:rounded-xl" />
                    }
                  >
                    <CreativityHeaderTabs />
                  </Suspense>
                )}
                </div>
              </div>
            )}
          </header>

          <main className="min-w-0 flex-1 px-3 py-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-4 lg:px-6 lg:py-5 lg:pb-5">
            {children}
          </main>

          <MobileBottomNav />
          <MusicUploadDock />
          <ClippingProgressDock />
        </div>
      </MusicUploadProvider>
    </ChannelsContext.Provider>
  );
}

/** @deprecated use AppShell — kept for import compatibility */
export const SidebarShell = AppShell;
