"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardMenu, CardMenuSlot } from "@/components/CardMenu";
import { useToast } from "@/components/ToastNotice";

type FavKind = "all" | "video" | "photo" | "music";

type FavoriteItem = {
  id: string;
  kind: "video" | "photo" | "music";
  asset_id: string;
  title: string | null;
  author: string | null;
  thumb: string | null;
  preview_url: string | null;
  download_url: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  page_url: string | null;
  created_at: string;
};

const FILTERS: { id: FavKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "photo", label: "Photos" },
  { id: "music", label: "Music" },
];

function formatDuration(sec: number | null) {
  if (sec == null || Number.isNaN(sec)) return null;
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function FavoritesStudio() {
  const { show: toast, notice } = useToast();
  const [filter, setFilter] = useState<FavKind>("all");
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audio] = useState(() =>
    typeof Audio !== "undefined" ? new Audio() : null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("kind", filter);
    const res = await fetch(`/api/favorites?${params}`);
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast(data.error || "Failed to load favorites", "error");
      setItems([]);
      return;
    }
    setItems((data.items || []) as FavoriteItem[]);
  }, [filter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      audio?.pause();
    };
  }, [audio]);

  const visible = useMemo(() => items, [items]);

  async function removeFav(item: FavoriteItem) {
    const res = await fetch(
      `/api/favorites?kind=${encodeURIComponent(item.kind)}&asset_id=${encodeURIComponent(item.asset_id)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Failed to remove", "error");
      return;
    }
    setItems((prev) =>
      prev.filter(
        (x) => !(x.kind === item.kind && x.asset_id === item.asset_id),
      ),
    );
  }

  function togglePlay(item: FavoriteItem) {
    if (!audio || !item.preview_url) return;
    if (playingId === item.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.pause();
    audio.src = item.preview_url;
    void audio.play().then(() => setPlayingId(item.id));
    audio.onended = () => setPlayingId(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      {notice}
      <header className="space-y-4">
        <h1
          className="font-[family-name:var(--font-syne)] text-3xl tracking-tight sm:text-4xl"
          style={{ fontWeight: 800 }}
        >
          Favorites
        </h1>
        <nav className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="rounded-full border px-3.5 py-1.5 text-sm font-semibold transition"
                style={{
                  borderColor: on ? "rgba(232,165,75,0.55)" : "var(--line)",
                  background: on ? "rgba(232,165,75,0.14)" : "transparent",
                  color: on ? "var(--accent)" : "var(--fg)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </nav>
      </header>

      {loading ? (
        <p className="text-sm text-[color:var(--muted)]">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[color:var(--line)] p-10 text-center text-sm text-[color:var(--muted)]">
          No favorites yet. Tap the heart on Media videos, photos, or music.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {visible.map((item) => {
            const dur = formatDuration(item.duration_sec);
            const playing = playingId === item.id;
            return (
              <li
                key={`${item.kind}:${item.asset_id}`}
                className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-black/25"
              >
                <div className="relative aspect-square bg-black/40">
                  {item.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumb}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl text-[color:var(--muted)]">
                      {item.kind === "music" ? "♪" : "◆"}
                    </div>
                  )}
                  <button
                    type="button"
                    className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 transition hover:bg-black/75"
                    aria-label="Remove from favorites"
                    onClick={() => void removeFav(item)}
                    style={{ color: "#ff4d6d" }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
                    </svg>
                  </button>
                  <CardMenuSlot>
                    <CardMenu
                      items={[
                        ...(item.kind === "music" && item.preview_url
                          ? [
                              {
                                label: playing ? "Stop" : "Play",
                                onClick: () => togglePlay(item),
                              },
                            ]
                          : []),
                        ...(item.download_url
                          ? [
                              {
                                label: "Download",
                                href: `/api/media/download?url=${encodeURIComponent(item.download_url)}&type=${item.kind === "music" ? "music" : item.kind === "photo" ? "photo" : "video"}&filename=${encodeURIComponent(item.title || item.asset_id)}`,
                              },
                            ]
                          : []),
                        {
                          label: "Remove",
                          danger: true,
                          onClick: () => void removeFav(item),
                        },
                      ]}
                    />
                  </CardMenuSlot>
                  <span className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white">
                    {item.kind}
                    {dur ? ` · ${dur}` : ""}
                  </span>
                </div>
                <div className="space-y-0.5 px-2.5 py-2">
                  <p className="truncate text-xs font-semibold">
                    {item.title || "Untitled"}
                  </p>
                  <p className="truncate text-[11px] text-[color:var(--muted)]">
                    {item.author || "—"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
