"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { zipSync } from "fflate";
import {
  buildGltfObjectUrl,
  formatBytes,
  pickGltfPackage,
  type PolyHavenAssetMeta,
  type PolyHavenType,
  type PolyPackage,
  type PolyPreviewSide,
} from "@/lib/polyhaven";

const TYPE_OPTIONS: { id: Exclude<PolyHavenType, "all">; label: string }[] = [
  { id: "models", label: "3D models" },
  { id: "hdris", label: "HDRIs" },
  { id: "textures", label: "Textures" },
];

type CategoryOpt = {
  id: string;
  label: string;
  count: number;
  thumbUrl: string | null;
  collection?: boolean;
};

type ViewMode = "categories" | "gallery";

function typeLabel(t: PolyHavenType) {
  return TYPE_OPTIONS.find((o) => o.id === t)?.label || t;
}

async function downloadPackageZip(pack: PolyPackage, assetId: string) {
  const parts: Record<string, Uint8Array> = {};
  await Promise.all(
    pack.files.map(async (f) => {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`Failed: ${f.path}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      parts[f.path.replace(/^\/+/, "")] = buf;
    }),
  );
  const zipped = zipSync(parts, { level: 1 });
  const blob = new Blob([zipped], {
    type: "application/zip",
  });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `${assetId}_${pack.resolution}_${pack.format}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CreatorsStudio() {
  const [kind, setKind] = useState<Exclude<PolyHavenType, "all">>("models");
  const [view, setView] = useState<ViewMode>("categories");
  const [category, setCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [items, setItems] = useState<PolyHavenAssetMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<PolyHavenAssetMeta | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverCat, setHoverCat] = useState<string | null>(null);
  const [favKeys, setFavKeys] = useState<Set<string>>(() => new Set());

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const typeRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const pageRef = useRef(1);
  const requestIdRef = useRef(0);

  const searching = Boolean(submitted);
  const showCategories = view === "categories" && !searching;
  const showGallery = view === "gallery" || searching;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) {
        setTypeOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/favorites?kind=photo");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const keys = new Set<string>();
      for (const it of data.items || []) {
        if (String(it.asset_id || "").startsWith("creator:")) {
          keys.add(String(it.asset_id));
        }
      }
      setFavKeys(keys);
    })();
  }, []);

  // Load all categories for current type
  useEffect(() => {
    let cancelled = false;
    setCatsLoading(true);
    void (async () => {
      const res = await fetch(
        `/api/polyhaven/categories?type=${encodeURIComponent(kind)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setErr(data.error || "Failed to load categories");
        setCategories([]);
      } else {
        setCategories((data.items || []) as CategoryOpt[]);
      }
      setCatsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  // Gallery fetch (category or search)
  useEffect(() => {
    if (!showGallery) return;
    if (!searching && !category) return;

    let cancelled = false;
    const reqId = ++requestIdRef.current;
    pageRef.current = 1;
    hasMoreRef.current = true;
    setErr(null);
    loadingRef.current = true;
    setLoading(true);
    setItems([]);

    (async () => {
      try {
        const params = new URLSearchParams({
          type: kind,
          page: "1",
          pageSize: "48",
          q: submitted,
        });
        if (!searching && category) params.set("category", category);
        const res = await fetch(`/api/polyhaven/assets?${params}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled || reqId !== requestIdRef.current) return;
        if (!res.ok) throw new Error(data.error || "Failed to load assets");
        const batch: PolyHavenAssetMeta[] = data.items || [];
        hasMoreRef.current = Boolean(data.hasMore);
        setItems(batch);
        pageRef.current = 1;
      } catch (e) {
        if (cancelled || reqId !== requestIdRef.current) return;
        setErr(e instanceof Error ? e.message : "Failed to load");
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
  }, [showGallery, searching, category, kind, submitted]);

  const loadMore = useCallback(async () => {
    if (!showGallery) return;
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const reqId = requestIdRef.current;
    const nextPage = pageRef.current + 1;
    try {
      const params = new URLSearchParams({
        type: kind,
        page: String(nextPage),
        pageSize: "48",
        q: submitted,
      });
      if (!searching && category) params.set("category", category);
      const res = await fetch(`/api/polyhaven/assets?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (reqId !== requestIdRef.current) return;
      if (!res.ok) throw new Error(data.error || "Failed to load more");
      const batch: PolyHavenAssetMeta[] = data.items || [];
      hasMoreRef.current = Boolean(data.hasMore);
      pageRef.current = nextPage;
      if (batch.length) {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...batch.filter((b) => !seen.has(b.id))];
        });
      }
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      setErr(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      if (reqId === requestIdRef.current) {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [showGallery, kind, category, submitted, searching]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !showGallery) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "500px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, showGallery, items.length]);

  function selectKind(next: Exclude<PolyHavenType, "all">) {
    setTypeOpen(false);
    if (next === kind) return;
    setKind(next);
    setCategory(null);
    setView("categories");
    setSubmitted("");
    setQuery("");
    setItems([]);
    setViewer(null);
  }

  function openCategory(cat: CategoryOpt) {
    setCategory(cat.id);
    setView("gallery");
    setSubmitted("");
    setQuery("");
  }

  function backToCategories() {
    setView("categories");
    setCategory(null);
    setSubmitted("");
    setQuery("");
    setItems([]);
    setViewer(null);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    setSubmitted(q);
    if (q) {
      setView("gallery");
      setCategory(null);
    } else {
      setView("categories");
      setCategory(null);
      setItems([]);
    }
  }

  async function toggleFavorite(asset: PolyHavenAssetMeta) {
    const asset_id = `creator:${asset.id}`;
    const active = favKeys.has(asset_id);
    if (active) {
      const res = await fetch(
        `/api/favorites?kind=photo&asset_id=${encodeURIComponent(asset_id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      setFavKeys((prev) => {
        const next = new Set(prev);
        next.delete(asset_id);
        return next;
      });
      return;
    }
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "photo",
        asset_id,
        title: asset.name,
        author: asset.authors[0] || null,
        thumb: asset.primaryUrl,
        preview_url: asset.primaryUrl,
      }),
    });
    if (!res.ok) return;
    setFavKeys((prev) => new Set(prev).add(asset_id));
  }

  const activeCategoryLabel =
    categories.find((c) => c.id === category)?.label || category;

  return (
    <div className="space-y-4">
      {/* Sticky toolbar — search */}
      <form
        onSubmit={onSearch}
        className="sticky top-[5.75rem] z-40 -mx-4 flex flex-wrap items-center gap-2 bg-[color:var(--bg)]/95 px-4 py-3 backdrop-blur-md md:top-[6.25rem] md:-mx-6 md:px-6"
      >
        <div className="relative min-w-0 flex-1">
          <div className="absolute left-1.5 top-1/2 z-10 -translate-y-1/2" ref={typeRef}>
            <button
              type="button"
              title="Filter type"
              onClick={() => setTypeOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] transition hover:bg-white/5 hover:text-[color:var(--accent)]"
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
            {typeOpen && (
              <div className="absolute left-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] py-1 shadow-2xl">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => selectKind(opt.id)}
                    className="block w-full px-3 py-2 text-left text-sm transition hover:bg-white/5"
                    style={{
                      color: kind === opt.id ? "var(--accent)" : "var(--fg)",
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

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${typeLabel(kind).toLowerCase()}…`}
            className="w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] py-2.5 pl-11 pr-11 text-sm outline-none focus:border-[color:rgba(232,165,75,0.55)]"
          />
          <button
            type="submit"
            title="Search"
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[color:var(--muted)] transition hover:bg-white/5 hover:text-[color:var(--accent)]"
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
      </form>

      {showGallery && (
        <button
          type="button"
          onClick={backToCategories}
          className="text-sm text-[color:var(--muted)] hover:text-[color:var(--fg)]"
        >
          ← Categories
        </button>
      )}

      {err && (
        <p className="rounded-xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-3 py-2 text-sm text-[color:var(--danger)]">
          {err}
        </p>
      )}

      {showCategories && (
        <section>
          {catsLoading ? (
            <p className="text-sm text-[color:var(--muted)]">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
              {categories.map((cat) => {
                const on = hoverCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => openCategory(cat)}
                    onMouseEnter={() => setHoverCat(cat.id)}
                    onMouseLeave={() => setHoverCat(null)}
                    className="relative aspect-square overflow-hidden bg-transparent outline-none"
                  >
                    {cat.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cat.thumbUrl}
                        alt=""
                        className="h-full w-full object-contain transition duration-300"
                        style={{
                          transform: on ? "scale(1.04)" : "scale(1)",
                          filter: on ? "brightness(1.05)" : undefined,
                        }}
                      />
                    ) : (
                      <div className="h-full w-full bg-white/5" />
                    )}
                    {on && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-left">
                        <p className="font-[family-name:var(--font-syne)] text-sm font-semibold text-white">
                          {cat.label}
                        </p>
                        <p className="text-[11px] text-white/75">
                          {cat.count} asset{cat.count === 1 ? "" : "s"}
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {showGallery && (
        <section>
          <h1 className="mb-3 font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight">
            {searching
              ? `Search · ${submitted}`
              : activeCategoryLabel || typeLabel(kind)}
          </h1>

          {loading && !items.length ? (
            <p className="text-sm text-[color:var(--muted)]">Loading…</p>
          ) : !items.length ? (
            <p className="text-sm text-[color:var(--muted)]">No assets found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
              {items.map((asset) => {
                const hover = hoverId === asset.id;
                const favId = `creator:${asset.id}`;
                const liked = favKeys.has(favId);
                return (
                  <div
                    key={asset.id}
                    className="relative aspect-square overflow-hidden bg-transparent"
                    onMouseEnter={() => setHoverId(asset.id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    <button
                      type="button"
                      onClick={() => setViewer(asset)}
                      className="absolute inset-0 outline-none"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.primaryUrl}
                        alt={asset.name}
                        loading="lazy"
                        className="h-full w-full object-contain transition duration-300"
                        style={{
                          transform: hover ? "scale(1.04)" : "scale(1)",
                          filter: hover ? "brightness(1.05)" : undefined,
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      className="absolute left-2 top-2 z-[2] flex h-8 w-8 items-center justify-center rounded-full bg-black/55 transition hover:bg-black/75"
                      aria-label={liked ? "Remove from favorites" : "Add to favorites"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void toggleFavorite(asset);
                      }}
                      style={{ color: liked ? "#ff4d6d" : "#fff" }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill={liked ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
                      </svg>
                    </button>
                    {hover && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-left">
                        <p className="truncate text-sm font-semibold text-white">
                          {asset.name}
                        </p>
                        <p className="truncate text-[11px] text-white/75">
                          {asset.authors[0] || "Creator asset"}
                          {asset.polycount
                            ? ` · ${asset.polycount.toLocaleString()} tris`
                            : ""}
                        </p>
                        {asset.description ? (
                          <p className="mt-1 line-clamp-2 text-[10px] text-white/65">
                            {asset.description}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div ref={sentinelRef} className="h-10" />
          {loadingMore && (
            <p className="pb-2 text-center text-xs text-[color:var(--muted)]">
              Loading more…
            </p>
          )}
        </section>
      )}

      {viewer && (
        <AssetFullscreen
          asset={viewer}
          onClose={() => setViewer(null)}
          onError={(msg) => setErr(msg)}
        />
      )}
    </div>
  );
}

function AssetFullscreen({
  asset,
  onClose,
  onError,
}: {
  asset: PolyHavenAssetMeta;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [sides, setSides] = useState<PolyPreviewSide[]>([]);
  const [packages, setPackages] = useState<PolyPackage[]>([]);
  const [activeSide, setActiveSide] = useState<string>("primary");
  const [mode3d, setMode3d] = useState(false);
  const [gltfUrl, setGltfUrl] = useState<string | null>(null);
  const [panoramaUrl, setPanoramaUrl] = useState<string | null>(null);
  const [packId, setPackId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading3d, setLoading3d] = useState(false);
  const blobRef = useRef<string | null>(null);
  const isHdri = asset.type === "hdris";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);

    if (!customElements.get("model-viewer")) {
      const s = document.createElement("script");
      s.type = "module";
      s.src =
        "https://unpkg.com/@google/model-viewer@4.0.0/dist/model-viewer.min.js";
      document.head.appendChild(s);
    }

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMode3d(false);
    setGltfUrl(null);
    setPanoramaUrl(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/polyhaven/files?id=${encodeURIComponent(asset.id)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Failed to load");
        const nextSides = (data.sides || []) as PolyPreviewSide[];
        const nextPacks = (data.packages || []) as PolyPackage[];
        setSides(nextSides);
        setPackages(nextPacks);
        setActiveSide(nextSides[0]?.id || "primary");
        setPackId(
          nextPacks.find((p) => p.format === "gltf" && p.resolution === "1k")
            ?.id ||
            nextPacks.find((p) => p.format === "hdr" && p.resolution === "1k")
              ?.id ||
            nextPacks.find((p) => p.format === "gltf")?.id ||
            nextPacks[0]?.id ||
            "",
        );
      } catch (e) {
        if (!cancelled) {
          onError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id, onError]);

  const currentSide =
    sides.find((s) => s.id === activeSide) || sides[0] || null;
  const selectedPack =
    packages.find((p) => p.id === packId) || packages[0] || null;

  const hasGltf = packages.some((p) => p.format === "gltf");
  const thridDEnabled = isHdri || hasGltf;

  async function enable3d() {
    if (isHdri) {
      const map =
        sides.find((s) => s.id === "tonemap")?.url ||
        sides.find((s) => s.id === "primary")?.url ||
        asset.primaryUrl;
      setPanoramaUrl(map);
      setGltfUrl(null);
      setMode3d(true);
      return;
    }

    const pack = pickGltfPackage(packages);
    if (!pack) {
      onError("No glTF package for 3D view");
      return;
    }
    setLoading3d(true);
    try {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
      const url = await buildGltfObjectUrl(pack);
      blobRef.current = url.startsWith("blob:") ? url : null;
      setGltfUrl(url);
      setPanoramaUrl(null);
      setMode3d(true);
      setPackId(pack.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : "3D preview failed");
    } finally {
      setLoading3d(false);
    }
  }

  async function onDownload() {
    if (!selectedPack) return;
    setBusy(true);
    try {
      // HDRI single file — no zip needed if only one file in package
      if (selectedPack.files.length === 1) {
        const f = selectedPack.files[0];
        const a = document.createElement("a");
        a.href = f.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.download = `${asset.id}_${selectedPack.resolution}.${selectedPack.format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        await downloadPackageZip(selectedPack, asset.id);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-[color:var(--bg)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-[family-name:var(--font-syne)] text-lg font-semibold">
            {asset.name}
          </h2>
          <p className="truncate text-xs text-[color:var(--muted)]">
            {asset.authors.join(", ") || "Poly Haven"}
            {asset.polycount
              ? ` · ${asset.polycount.toLocaleString()} tris`
              : ""}
            {" · CC0"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={loading3d || !thridDEnabled}
            onClick={() => {
              if (mode3d) {
                setMode3d(false);
                setPanoramaUrl(null);
              } else void enable3d();
            }}
            className="rounded-xl border border-[color:var(--line)] px-3 py-2 text-sm font-medium transition hover:border-[color:var(--accent)] disabled:opacity-40"
            style={{
              color: mode3d ? "var(--accent)" : undefined,
              borderColor: mode3d ? "var(--accent)" : undefined,
            }}
          >
            {loading3d ? "…" : mode3d ? "Views" : "3D"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--fg)]"
          >
            Close
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative flex min-h-[50vh] flex-1 items-center justify-center overflow-hidden bg-[#111] md:min-h-0">
          {mode3d && panoramaUrl ? (
            <HdriSphereViewer imageUrl={panoramaUrl} />
          ) : mode3d && gltfUrl ? (
            <div
              className="h-full w-full min-h-[360px] p-4"
              ref={(el) => {
                if (!el) return;
                el.innerHTML = "";
                const mv = document.createElement("model-viewer");
                mv.setAttribute("src", gltfUrl);
                mv.setAttribute("camera-controls", "");
                mv.setAttribute("auto-rotate", "");
                mv.setAttribute("shadow-intensity", "1");
                mv.style.width = "100%";
                mv.style.height = "100%";
                mv.style.minHeight = "360px";
                el.appendChild(mv);
              }}
            />
          ) : currentSide ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentSide.url}
              alt={currentSide.label}
              className="max-h-full max-w-full object-contain p-4"
            />
          ) : loading ? (
            <p className="text-sm text-[color:var(--muted)]">Loading…</p>
          ) : null}
        </div>

        <aside className="flex w-full shrink-0 flex-col border-t border-[color:var(--line)] md:w-[320px] md:border-l md:border-t-0">
          <div className="border-b border-[color:var(--line)] p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              Sides / maps
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sides.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setMode3d(false);
                    setPanoramaUrl(null);
                    setActiveSide(s.id);
                  }}
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border"
                  style={{
                    borderColor:
                      !mode3d && activeSide === s.id
                        ? "var(--accent)"
                        : "var(--line)",
                  }}
                  title={s.label}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url}
                    alt={s.label}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sides.map((s) => (
                <button
                  key={`lbl-${s.id}`}
                  type="button"
                  onClick={() => {
                    setMode3d(false);
                    setPanoramaUrl(null);
                    setActiveSide(s.id);
                  }}
                  className="rounded-full px-2 py-0.5 text-[10px]"
                  style={{
                    background:
                      !mode3d && activeSide === s.id
                        ? "rgba(232,165,75,0.15)"
                        : "transparent",
                    color:
                      !mode3d && activeSide === s.id
                        ? "var(--accent)"
                        : "var(--muted)",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {asset.description ? (
              <p className="text-[color:var(--muted)]">{asset.description}</p>
            ) : null}
            {asset.categories.length > 0 && (
              <p className="text-xs text-[color:var(--muted)]">
                {asset.categories.join(" · ")}
              </p>
            )}

            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                Package
              </p>
              <select
                value={packId}
                onChange={(e) => setPackId(e.target.value)}
                className="w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--bg)] px-3 py-2 text-sm outline-none"
              >
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({formatBytes(p.totalSize)})
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-[color:var(--muted)]">
                {isHdri
                  ? "Downloads the full HDRI file."
                  : "One ZIP with the model and all required textures."}
              </p>
            </div>

            <button
              type="button"
              disabled={!selectedPack || busy}
              onClick={() => void onDownload()}
              className="w-full rounded-xl bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
            >
              {busy
                ? "Preparing…"
                : selectedPack
                  ? `Download · ${formatBytes(selectedPack.totalSize)}`
                  : "Download"}
            </button>
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

/** Equirectangular HDRI preview — drag to look around (CORS-safe via proxy). */
function HdriSphereViewer({ imageUrl }: { imageUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let raf = 0;
    let disposeAll: (() => void) | null = null;

    const proxied = `/api/media/download?${new URLSearchParams({
      url: imageUrl,
      filename: "hdri-preview.jpg",
      type: "photo",
      inline: "1",
    })}`;

    type ThreeNS = {
      Scene: new () => { add: (o: unknown) => void; background?: unknown };
      PerspectiveCamera: new (
        fov: number,
        aspect: number,
        near: number,
        far: number,
      ) => {
        aspect: number;
        updateProjectionMatrix: () => void;
        rotation: { order: string; y: number; x: number };
        position: { set: (x: number, y: number, z: number) => void };
      };
      WebGLRenderer: new (opts: {
        antialias?: boolean;
        alpha?: boolean;
      }) => {
        setPixelRatio: (n: number) => void;
        setSize: (w: number, h: number) => void;
        setClearColor: (c: number, a?: number) => void;
        render: (s: unknown, c: unknown) => void;
        dispose: () => void;
        domElement: HTMLCanvasElement;
      };
      SphereGeometry: new (r: number, w: number, h: number) => {
        dispose: () => void;
      };
      MeshBasicMaterial: new (opts: Record<string, unknown>) => {
        map: unknown;
        needsUpdate: boolean;
        dispose: () => void;
      };
      Mesh: new (
        g: unknown,
        m: unknown,
      ) => { scale: { x: number }; geometry: { dispose: () => void } };
      TextureLoader: new () => {
        load: (
          url: string,
          onLoad: (t: { colorSpace?: string; needsUpdate?: boolean }) => void,
          onProgress?: unknown,
          onError?: (err?: unknown) => void,
        ) => void;
      };
      MathUtils: { clamp: (v: number, a: number, b: number) => number };
      SRGBColorSpace?: string;
    };

    function loadThree(): Promise<ThreeNS> {
      const w = window as unknown as { THREE?: ThreeNS };
      if (w.THREE) return Promise.resolve(w.THREE);
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(
          'script[data-orzu-three="1"]',
        ) as HTMLScriptElement | null;
        if (existing) {
          existing.addEventListener("load", () => {
            const t = (window as unknown as { THREE?: ThreeNS }).THREE;
            if (t) resolve(t);
            else reject(new Error("THREE missing"));
          });
          return;
        }
        const s = document.createElement("script");
        s.src = "https://unpkg.com/three@0.170.0/build/three.min.js";
        s.dataset.orzuThree = "1";
        s.onload = () => {
          const t = (window as unknown as { THREE?: ThreeNS }).THREE;
          if (t) resolve(t);
          else reject(new Error("THREE missing"));
        };
        s.onerror = () => reject(new Error("Failed to load Three.js"));
        document.head.appendChild(s);
      });
    }

    void (async () => {
      try {
        setStatus("loading");
        const THREE = await loadThree();
        if (cancelled || !hostRef.current) return;
        const el = hostRef.current;

        const w0 = Math.max(el.clientWidth, 320);
        const h0 = Math.max(el.clientHeight, 360);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, w0 / h0, 0.1, 2000);
        camera.rotation.order = "YXZ";
        camera.position.set(0, 0, 0.1);

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
        });
        renderer.setClearColor(0x111111, 1);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w0, h0);
        el.innerHTML = "";
        el.appendChild(renderer.domElement);

        const geo = new THREE.SphereGeometry(50, 64, 40);
        const mat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.x = -1;
        scene.add(mesh);

        await new Promise<void>((resolve, reject) => {
          new THREE.TextureLoader().load(
            proxied,
            (tex) => {
              if (THREE.SRGBColorSpace) {
                tex.colorSpace = THREE.SRGBColorSpace;
              }
              mat.map = tex;
              mat.needsUpdate = true;
              resolve();
            },
            undefined,
            () => reject(new Error("texture load failed")),
          );
        });

        if (cancelled) return;
        setStatus("ready");

        let lon = 180;
        let lat = 0;
        let dragging = false;
        let lastX = 0;
        let lastY = 0;

        const onDown = (e: PointerEvent) => {
          dragging = true;
          lastX = e.clientX;
          lastY = e.clientY;
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        };
        const onMove = (e: PointerEvent) => {
          if (!dragging) return;
          lon -= (e.clientX - lastX) * 0.2;
          lat = THREE.MathUtils.clamp(
            lat + (e.clientY - lastY) * 0.2,
            -85,
            85,
          );
          lastX = e.clientX;
          lastY = e.clientY;
        };
        const onUp = () => {
          dragging = false;
        };
        el.addEventListener("pointerdown", onDown);
        el.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);

        const onResize = () => {
          if (!hostRef.current) return;
          const w = Math.max(hostRef.current.clientWidth, 1);
          const h = Math.max(hostRef.current.clientHeight, 1);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener("resize", onResize);
        // layout settle
        requestAnimationFrame(onResize);

        const tick = () => {
          if (cancelled) return;
          const phi = ((90 - lat) * Math.PI) / 180;
          const theta = (lon * Math.PI) / 180;
          camera.rotation.x = phi - Math.PI / 2;
          camera.rotation.y = theta;
          renderer.render(scene, camera);
          raf = requestAnimationFrame(tick);
        };
        tick();

        disposeAll = () => {
          window.removeEventListener("resize", onResize);
          window.removeEventListener("pointerup", onUp);
          el.removeEventListener("pointerdown", onDown);
          el.removeEventListener("pointermove", onMove);
          cancelAnimationFrame(raf);
          geo.dispose();
          mat.dispose();
          renderer.dispose();
          el.innerHTML = "";
        };
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      disposeAll?.();
      if (host) host.innerHTML = "";
    };
  }, [imageUrl]);

  return (
    <div className="relative h-full w-full min-h-[420px]">
      <div
        ref={hostRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        title="Drag to look around"
      />
      {status === "loading" && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[color:var(--muted)]">
          Loading 3D…
        </p>
      )}
      {status === "error" && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-[color:var(--danger)]">
          Could not load HDRI preview
        </p>
      )}
    </div>
  );
}
