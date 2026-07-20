"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { CardMenu, CardMenuSlot } from "@/components/CardMenu";

type MediaKind = "all" | "video" | "photo" | "music";

type MediaCard = {
  id: string;
  kind: Exclude<MediaKind, "all">;
  title: string;
  author: string;
  thumb: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  pageUrl: string | null;
  downloadAllowed: boolean;
};

const TYPE_OPTIONS: { id: MediaKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "photo", label: "Photos" },
  { id: "music", label: "Music" },
];

const FORMAT_OPTIONS = [
  { id: "all", label: "All formats" },
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
  { id: "square", label: "Square" },
] as const;

function itemKey(item: MediaCard) {
  return `${item.kind}:${item.id}`;
}

function formatDuration(sec: number | null) {
  if (sec == null || Number.isNaN(sec)) return null;
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function mergeUnique(prev: MediaCard[], next: MediaCard[]) {
  const seen = new Set(prev.map(itemKey));
  const out = [...prev];
  for (const item of next) {
    const k = itemKey(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function estimateCardWeight(item: MediaCard) {
  if (item.kind === "music") return 1.05;
  const w = item.width && item.width > 0 ? item.width : 3;
  const h = item.height && item.height > 0 ? item.height : 4;
  return h / w + 0.12;
}

function useMasonryColumnCount() {
  const [count, setCount] = useState(4);
  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      const next = w < 640 ? 2 : w < 1024 ? 3 : w < 1280 ? 4 : 5;
      setCount((prev) => (prev === next ? prev : next));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return count;
}

function useStickyMasonry(
  items: MediaCard[],
  colCount: number,
  resetKey: string,
) {
  const [columns, setColumns] = useState<MediaCard[][]>(() =>
    Array.from({ length: colCount }, () => []),
  );
  const placedRef = useRef(0);
  const heightsRef = useRef<number[]>(Array.from({ length: colCount }, () => 0));
  const colsRef = useRef<MediaCard[][]>(
    Array.from({ length: colCount }, () => []),
  );
  const resetKeyRef = useRef(resetKey);
  const colCountRef = useRef(colCount);

  useEffect(() => {
    const keyChanged = resetKeyRef.current !== resetKey;
    const colsChanged = colCountRef.current !== colCount;
    resetKeyRef.current = resetKey;
    colCountRef.current = colCount;

    const flat = colsRef.current.flat();
    const isAppend =
      !keyChanged &&
      !colsChanged &&
      items.length > flat.length &&
      flat.length > 0 &&
      flat.every((it, i) => itemKey(it) === itemKey(items[i]));

    if (!isAppend) {
      placedRef.current = 0;
      heightsRef.current = Array.from({ length: colCount }, () => 0);
      colsRef.current = Array.from({ length: colCount }, () => []);

      if (items.length === 0) {
        setColumns((prev) => {
          if (
            prev.length === colCount &&
            prev.every((col) => col.length === 0)
          ) {
            return prev;
          }
          return Array.from({ length: colCount }, () => []);
        });
        return;
      }

      for (const item of items) {
        let min = 0;
        for (let i = 1; i < colCount; i++) {
          if (heightsRef.current[i] < heightsRef.current[min]) min = i;
        }
        colsRef.current[min].push(item);
        heightsRef.current[min] += estimateCardWeight(item);
      }
      placedRef.current = items.length;
      setColumns(colsRef.current.map((c) => c.slice()));
      return;
    }

    const fresh = items.slice(flat.length);
    for (const item of fresh) {
      let min = 0;
      for (let i = 1; i < colCount; i++) {
        if (heightsRef.current[i] < heightsRef.current[min]) min = i;
      }
      colsRef.current[min].push(item);
      heightsRef.current[min] += estimateCardWeight(item);
    }
    placedRef.current = items.length;
    setColumns(colsRef.current.map((c) => c.slice()));
  }, [items, colCount, resetKey]);

  return columns;
}

async function downloadToDevice(item: MediaCard) {
  if (!item.downloadUrl || !item.downloadAllowed) return;
  const params = new URLSearchParams({
    url: item.downloadUrl,
    type: item.kind,
    filename: `${item.kind}-${item.id}-${item.title.slice(0, 40)}`,
  });
  const res = await fetch(`/api/media/download?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Download failed");
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download =
    item.kind === "video"
      ? `pexels-${item.id}.mp4`
      : item.kind === "photo"
        ? `pexels-${item.id}.jpg`
        : `jamendo-${item.id}.mp3`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function defaultQueryFor(kind: MediaKind) {
  if (kind === "all") return "";
  if (kind === "music") return "soundtrack";
  if (kind === "photo") return "nature";
  return "cinematic";
}

export function MediaStudio() {
  const [kind, setKind] = useState<MediaKind>("all");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [orientation, setOrientation] = useState("all");
  const [typeOpen, setTypeOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listSeed, setListSeed] = useState(() => String(Date.now()));
  const [items, setItems] = useState<MediaCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<MediaCard | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState({ current: 0, duration: 0 });
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const typeRef = useRef<HTMLDivElement | null>(null);
  const formatRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const pageRef = useRef(1);
  const requestIdRef = useRef(0);

  const showFormatFilter = kind === "video" || kind === "photo";
  const searchKey = `${kind}|${submitted}|${orientation}|${listPage}|${listSeed}`;
  const colCount = useMasonryColumnCount();
  const columns = useStickyMasonry(items, colCount, searchKey);

  useEffect(() => {
    let cancelled = false;
    const reqId = ++requestIdRef.current;
    pageRef.current = listPage;
    hasMoreRef.current = true;
    setErr(null);
    loadingRef.current = true;
    setLoading(true);

    (async () => {
      try {
        const params = new URLSearchParams({
          type: kind,
          q: submitted,
          page: String(listPage),
          orientation: showFormatFilter ? orientation : "all",
          seed: listSeed,
        });
        const res = await fetch(`/api/media/search?${params}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled || reqId !== requestIdRef.current) return;
        if (!res.ok) throw new Error(data.error || "Search failed");

        const batch: MediaCard[] = data.items || [];
        const pageSize = Number(data.pageSize || 40);
        hasMoreRef.current =
          data.hasMore != null
            ? Boolean(data.hasMore)
            : batch.length >= pageSize;
        setItems(batch);
        pageRef.current = listPage;
      } catch (e) {
        if (cancelled || reqId !== requestIdRef.current) return;
        setErr(e instanceof Error ? e.message : "Search failed");
        setItems([]);
        hasMoreRef.current = false;
      } finally {
        if (!cancelled && reqId === requestIdRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchKey, kind, submitted, orientation, showFormatFilter, listPage, listSeed]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    const reqId = requestIdRef.current;
    const nextPage = pageRef.current + 1;
    try {
      const params = new URLSearchParams({
        type: kind,
        q: submitted,
        page: String(nextPage),
        orientation: kind === "video" || kind === "photo" ? orientation : "all",
      });
      const res = await fetch(`/api/media/search?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (reqId !== requestIdRef.current) return;
      if (!res.ok) throw new Error(data.error || "Search failed");

      const batch: MediaCard[] = data.items || [];
      const pageSize = Number(data.pageSize || 40);
      hasMoreRef.current =
        data.hasMore != null
          ? Boolean(data.hasMore)
          : batch.length >= pageSize;
      pageRef.current = nextPage;
      if (batch.length) {
        setItems((prev) => mergeUnique(prev, batch));
      }
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (reqId === requestIdRef.current) {
        loadingRef.current = false;
      }
    }
  }, [kind, submitted, orientation]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (!hasMoreRef.current || loadingRef.current) return;
        void loadMore();
      },
      { root: null, rootMargin: "400px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, searchKey]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playingId) {
      setPlayProgress({ current: 0, duration: 0 });
      return;
    }
    function tick() {
      if (!audioRef.current) return;
      setPlayProgress({
        current: audioRef.current.currentTime || 0,
        duration: audioRef.current.duration || 0,
      });
    }
    tick();
    audio.addEventListener("timeupdate", tick);
    audio.addEventListener("loadedmetadata", tick);
    audio.addEventListener("durationchange", tick);
    return () => {
      audio.removeEventListener("timeupdate", tick);
      audio.removeEventListener("loadedmetadata", tick);
      audio.removeEventListener("durationchange", tick);
    };
  }, [playingId]);

  useEffect(() => {
    if (!typeOpen && !formatOpen) return;
    function onDoc(e: MouseEvent) {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) {
        setTypeOpen(false);
      }
      if (formatRef.current && !formatRef.current.contains(e.target as Node)) {
        setFormatOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setTypeOpen(false);
        setFormatOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [typeOpen, formatOpen]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setListPage(1);
    setListSeed(String(Date.now()));
    setSubmitted(query.trim() || defaultQueryFor(kind));
  }

  function selectKind(next: MediaKind) {
    setTypeOpen(false);
    setFormatOpen(false);
    if (next === kind) return;
    setKind(next);
    setOrientation("all");
    setListPage(1);
    setListSeed(String(Date.now()));
    setPlayingId(null);
    audioRef.current?.pause();
    setViewer(null);
    setItems([]);
    setSubmitted(query.trim() || defaultQueryFor(next));
  }

  function selectFormat(next: string) {
    setFormatOpen(false);
    setListPage(1);
    setListSeed(String(Date.now()));
    setOrientation(next);
  }

  function refreshList() {
    setPlayingId(null);
    audioRef.current?.pause();
    setPlayProgress({ current: 0, duration: 0 });
    setItems([]);
    // Stay within pages Pexels usually fills; seed reshuffles the mix.
    setListPage((prev) => {
      let next = prev;
      for (let i = 0; i < 8 && next === prev; i++) {
        next = 1 + Math.floor(Math.random() * 10);
      }
      return next;
    });
    setListSeed(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }

  async function onDownload(item: MediaCard) {
    const key = itemKey(item);
    setBusyId(key);
    setErr(null);
    try {
      await downloadToDevice(item);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  }

  function togglePlay(item: MediaCard) {
    if (!item.previewUrl) return;
    const key = itemKey(item);
    if (playingId === key) {
      audioRef.current?.pause();
      setPlayingId(null);
      setPlayProgress({ current: 0, duration: 0 });
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    audio.pause();
    audio.src = item.previewUrl;
    setPlayProgress({ current: 0, duration: 0 });
    void audio
      .play()
      .then(() => setPlayingId(key))
      .catch(() => {
        setErr("Could not play preview");
        setPlayingId(null);
      });
    audio.onended = () => {
      setPlayingId(null);
      setPlayProgress({ current: 0, duration: 0 });
    };
  }

  function seekPlay(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || seconds));
    setPlayProgress({
      current: audio.currentTime,
      duration: audio.duration || 0,
    });
  }

  const typeLabel =
    TYPE_OPTIONS.find((t) => t.id === kind)?.label || "All";
  const formatLabel =
    FORMAT_OPTIONS.find((f) => f.id === orientation)?.label || "All formats";
  const formatActive = showFormatFilter && orientation !== "all";

  return (
    <div className="space-y-4">
      <form
        onSubmit={onSearch}
        className="sticky top-0 z-40 -mx-4 flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] bg-[color:var(--bg)] px-4 py-3 md:-mx-6 md:px-6"
      >
        <div className="relative min-w-0 flex-1">
          {showFormatFilter && (
            <div className="absolute left-1.5 top-1/2 z-10 -translate-y-1/2" ref={formatRef}>
              <button
                type="button"
                title={formatLabel}
                onClick={() => {
                  setFormatOpen((v) => !v);
                  setTypeOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/5"
                style={{
                  color: formatActive ? "var(--accent)" : "var(--muted)",
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 5h16" />
                  <path d="M7 12h10" />
                  <path d="M10 19h4" />
                </svg>
              </button>
              {formatOpen && (
                <div className="absolute left-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] py-1 shadow-2xl">
                  {FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => selectFormat(opt.id)}
                      className="block w-full px-3 py-2 text-left text-sm transition hover:bg-white/5"
                      style={{
                        color:
                          orientation === opt.id
                            ? "var(--accent)"
                            : "var(--fg)",
                        background:
                          orientation === opt.id
                            ? "rgba(232,165,75,0.1)"
                            : "transparent",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search video, photos, music…"
            className={`w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] py-2.5 pr-11 text-sm outline-none focus:border-[color:rgba(232,165,75,0.55)] ${
              showFormatFilter ? "pl-11" : "pl-3"
            }`}
          />
          <button
            type="submit"
            title="Search"
            disabled={loading && items.length === 0}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[color:var(--muted)] transition hover:bg-white/5 hover:text-[color:var(--accent)] disabled:opacity-40"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>
        </div>

        <div className="relative" ref={typeRef}>
          <button
            type="button"
            onClick={() => {
              setTypeOpen((v) => !v);
              setFormatOpen(false);
            }}
            className="flex min-w-[7.5rem] items-center justify-between gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] px-3 py-2.5 text-sm font-medium"
          >
            <span>{typeLabel}</span>
            <span className="text-[10px] text-[color:var(--muted)]">▾</span>
          </button>
          {typeOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] py-1 shadow-2xl">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => selectKind(opt.id)}
                  className="block w-full px-3 py-2 text-left text-sm transition hover:bg-white/5"
                  style={{
                    color:
                      kind === opt.id ? "var(--accent)" : "var(--fg)",
                    background:
                      kind === opt.id
                        ? "rgba(232,165,75,0.1)"
                        : "transparent",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          title="Refresh"
          onClick={refreshList}
          disabled={loading}
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] text-[color:var(--muted)] transition hover:text-[color:var(--accent)] disabled:opacity-40"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={loading ? "animate-spin" : undefined}
          >
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </form>

      {err && <p className="text-sm text-[color:var(--danger)]">{err}</p>}

      {loading && items.length === 0 ? (
        <p className="text-sm text-[color:var(--muted)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--line)] p-8 text-center text-sm text-[color:var(--muted)]">
          No results. Try another search.
        </p>
      ) : (
        <div className="flex items-start gap-3">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="flex min-w-0 flex-1 flex-col gap-3">
              {col.map((item) =>
                item.kind === "music" ? (
                  <MusicCard
                    key={itemKey(item)}
                    item={item}
                    playing={playingId === itemKey(item)}
                    busy={busyId === itemKey(item)}
                    progress={
                      playingId === itemKey(item)
                        ? playProgress
                        : { current: 0, duration: 0 }
                    }
                    onPlay={() => togglePlay(item)}
                    onSeek={seekPlay}
                    onDownload={() => void onDownload(item)}
                  />
                ) : (
                  <VisualCard
                    key={itemKey(item)}
                    item={item}
                    busy={busyId === itemKey(item)}
                    onOpen={() => setViewer(item)}
                    onDownload={() => void onDownload(item)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-12 w-full" aria-hidden />

      {viewer && (
        <MediaViewer
          item={viewer}
          busy={busyId === itemKey(viewer)}
          onClose={() => setViewer(null)}
          onDownload={() => void onDownload(viewer)}
        />
      )}
    </div>
  );
}

function VisualCard({
  item,
  busy,
  onOpen,
  onDownload,
}: {
  item: MediaCard;
  busy: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const dur = formatDuration(item.durationSec);
  const w = item.width && item.width > 0 ? item.width : 3;
  const h = item.height && item.height > 0 ? item.height : 4;

  return (
    <article className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-black/25">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="group relative block w-full cursor-pointer overflow-hidden bg-black/40 text-left"
        style={{ aspectRatio: `${w} / ${h}` }}
      >
        {item.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted)]">
            No preview
          </div>
        )}

        <CardMenuSlot>
          <CardMenu
            items={[
              {
                label: busy ? "Downloading…" : "Download",
                disabled: !item.downloadAllowed || busy,
                onClick: onDownload,
              },
            ]}
          />
        </CardMenuSlot>

        {dur && (
          <span className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
            {dur}
          </span>
        )}
      </div>
      <div className="min-w-0 px-2.5 py-2">
        <p className="truncate text-[11px] text-[color:var(--muted)]">
          {item.author}
        </p>
      </div>
    </article>
  );
}

function MusicCard({
  item,
  playing,
  busy,
  progress,
  onPlay,
  onSeek,
  onDownload,
}: {
  item: MediaCard;
  playing: boolean;
  busy: boolean;
  progress: { current: number; duration: number };
  onPlay: () => void;
  onSeek: (seconds: number) => void;
  onDownload: () => void;
}) {
  const total =
    progress.duration > 0
      ? progress.duration
      : item.durationSec && item.durationSec > 0
        ? item.durationSec
        : 0;
  const current = playing ? progress.current : 0;
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  return (
    <article className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-black/25">
      <div className="relative aspect-square w-full overflow-hidden bg-black/40">
        {item.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-[color:var(--muted)]">
            ♪
          </div>
        )}

        <CardMenuSlot>
          <CardMenu
            items={[
              {
                label: busy ? "Downloading…" : "Download",
                disabled: !item.downloadAllowed || busy,
                onClick: onDownload,
              },
            ]}
          />
        </CardMenuSlot>

        {!playing && (
          <button
            type="button"
            title="Play"
            disabled={!item.previewUrl}
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="absolute bottom-2 left-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 disabled:opacity-40"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          </button>
        )}

        {playing && (
          <div
            className="absolute inset-x-0 bottom-0 z-10 space-y-1.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-2.5 pb-2.5 pt-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="Pause"
                onClick={onPlay}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <input
                  type="range"
                  min={0}
                  max={total || 1}
                  step={0.1}
                  value={Math.min(current, total || 0)}
                  disabled={!total}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  className="music-seek h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-[color:var(--accent)]"
                  style={{
                    background: `linear-gradient(to right, var(--accent) ${pct}%, rgba(255,255,255,0.25) ${pct}%)`,
                  }}
                  aria-label="Seek"
                />
                <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-white/80">
                  <span>{formatDuration(current) || "0:00"}</span>
                  <span>{formatDuration(total) || "0:00"}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-0.5 px-2.5 py-2">
        <p className="truncate text-xs font-semibold">{item.title}</p>
        <p className="truncate text-[11px] text-[color:var(--muted)]">
          {item.author}
        </p>
      </div>
    </article>
  );
}

function MediaViewer({
  item,
  busy,
  onClose,
  onDownload,
}: {
  item: MediaCard;
  busy: boolean;
  onClose: () => void;
  onDownload: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const mediaSrc =
    item.kind === "video"
      ? item.downloadUrl || item.previewUrl
      : item.previewUrl || item.downloadUrl || item.thumb;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{item.title}</p>
            <p className="truncate text-xs text-[color:var(--muted)]">
              {item.author}
              {item.width && item.height
                ? ` · ${item.width}×${item.height}`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="btn btn-primary !py-1.5 text-xs"
              disabled={!item.downloadAllowed || busy}
              onClick={onDownload}
            >
              {busy ? "…" : "Download"}
            </button>
            <button
              type="button"
              className="btn btn-ghost !py-1.5 text-xs"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-3">
          {item.kind === "video" && mediaSrc ? (
            <video
              key={mediaSrc}
              src={mediaSrc}
              controls
              autoPlay
              playsInline
              className="max-h-[75vh] w-full rounded-lg object-contain"
            />
          ) : item.kind === "music" && mediaSrc ? (
            <div className="flex w-full max-w-md flex-col items-center gap-4 p-6">
              {item.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumb}
                  alt=""
                  className="h-48 w-48 rounded-2xl object-cover"
                />
              ) : null}
              <audio src={mediaSrc} controls autoPlay className="w-full" />
            </div>
          ) : mediaSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaSrc}
              alt={item.title}
              className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
            />
          ) : (
            <p className="text-sm text-[color:var(--muted)]">No preview</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
