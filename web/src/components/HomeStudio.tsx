"use client";

import { useCallback, useEffect, useState } from "react";
import {
  YouTubeChannelsButton,
  YouTubeIcon,
  useChannelsMenu,
} from "@/components/AppShell";
import { useToast } from "@/components/ToastNotice";

type SavedChannel = {
  channel_id: string;
  title: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
};

export function HomeStudio() {
  const { show: toast, notice } = useToast();
  const { setMenuOpen } = useChannelsMenu();
  const [saved, setSaved] = useState<SavedChannel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/youtube/channels", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || "Could not load channel", "error");
        setSaved([]);
        return;
      }
      setSaved((data.saved || []) as SavedChannel[]);
    } catch {
      toast("Network error", "error");
      setSaved([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = saved.find((c) => c.is_active) || saved[0] || null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-16">
      {notice}
      <header className="space-y-2">
        <h1
          className="font-[family-name:var(--font-syne)] text-3xl tracking-tight sm:text-4xl"
          style={{ fontWeight: 800 }}
        >
          Home
        </h1>
        <p className="text-sm text-[color:var(--muted)]">
          Connect or switch your YouTube channel to publish Shorts.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold">
            YouTube channel
          </h2>
          <YouTubeChannelsButton />
        </div>

        {loading ? (
          <p className="text-sm text-[color:var(--muted)]">Loading…</p>
        ) : active ? (
          <div className="flex items-center gap-4 rounded-2xl border border-[color:var(--line)] bg-black/20 p-4">
            {active.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.thumbnail_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FF0000]">
                <YouTubeIcon />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">
                {active.title || "YouTube channel"}
              </p>
              <p className="text-xs text-[color:var(--muted)]">
                {active.is_active ? "Active channel" : "Saved channel"}
                {saved.length > 1 ? ` · ${saved.length} connected` : ""}
              </p>
            </div>
            <a
              href="/dashboard/channel"
              className="shrink-0 rounded-xl border border-[color:var(--line)] px-3 py-2 text-sm font-semibold transition hover:bg-white/5"
            >
              Open
            </a>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[color:var(--line)] p-8 text-center">
            <p className="text-sm text-[color:var(--muted)]">
              No YouTube channel connected yet.
            </p>
            <a
              href="/api/youtube/connect"
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white transition hover:brightness-110"
              style={{
                background: "#FF0000",
                boxShadow: "0 6px 18px rgba(255,0,0,0.28)",
              }}
            >
              <YouTubeIcon />
              Connect YouTube channel
            </a>
          </div>
        )}

        {active ? (
          <p className="text-xs text-[color:var(--muted)]">
            Use the red{" "}
            <button
              type="button"
              className="font-semibold text-[#ff6b6b] underline-offset-2 hover:underline"
              onClick={() => setMenuOpen(true)}
            >
              YouTube Channels
            </button>{" "}
            button to add a new channel or switch the active one.
          </p>
        ) : null}
      </section>
    </div>
  );
}
