"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type YtChannel = {
  id: string;
  title: string;
  thumbnail: string | null;
  customUrl: string | null;
};

type Saved = {
  channel_id: string;
  title: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
};

export function ChannelPicker() {
  const router = useRouter();
  const [available, setAvailable] = useState<YtChannel[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/youtube/channels");
      const data = await res.json();
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(data.error || data.googleError || "Could not load channels");
        setSaved(data.saved || []);
        return;
      }
      setAvailable(data.available || []);
      setSaved(data.saved || []);
      setSelectedId(
        data.selectedChannelId ||
          data.saved?.[0]?.channel_id ||
          data.available?.[0]?.id ||
          null,
      );
      if (data.googleError && !(data.available || []).length) {
        setError(data.googleError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirm() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/youtube/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        channelId: selectedId,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not save channel");
      return;
    }
    router.push("/dashboard/channel");
    router.refresh();
  }

  const savedIds = new Set(saved.map((s) => s.channel_id));

  return (
    <div className="panel rise space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Add YouTube channel</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Choose a channel from this Google account.
        </p>
      </div>

      {saved.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[color:var(--muted)]">Saved</h2>
          <ul className="space-y-2">
            {saved.map((c) => (
              <li
                key={c.channel_id}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--line)] px-3 py-2 text-sm"
              >
                {c.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.thumbnail_url}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[10px]">
                    YT
                  </span>
                )}
                <span className="flex-1 font-medium">{c.title || c.channel_id}</span>
                {c.is_active && (
                  <span className="text-xs" style={{ color: "var(--accent)" }}>
                    Active
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && (
        <p className="text-sm text-[color:var(--muted)]">Loading...</p>
      )}

      {error && (
        <div className="space-y-3">
          <p className="text-sm text-[color:var(--danger)]">{error}</p>
          <a href="/api/youtube/connect" className="btn btn-primary text-sm">
            Connect Google
          </a>
        </div>
      )}

      {!loading && available.length > 0 && (
        <ul className="space-y-2">
          {available.map((channel) => {
            const active = selectedId === channel.id;
            const already = savedIds.has(channel.id);
            return (
              <li key={channel.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(channel.id)}
                  className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition"
                  style={{
                    borderColor: active
                      ? "rgba(232,165,75,0.7)"
                      : "var(--line)",
                    background: active
                      ? "rgba(232,165,75,0.08)"
                      : "transparent",
                  }}
                >
                  {channel.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={channel.thumbnail}
                      alt=""
                      className="h-11 w-11 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--bg-elevated)] text-sm">
                      YT
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{channel.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-[color:var(--muted)]">
                      {already ? "Already added" : channel.customUrl || channel.id}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 border-t border-[color:var(--line)] pt-4">
        <button
          className="btn btn-primary"
          disabled={!selectedId || saving || loading}
          onClick={() => void confirm()}
        >
          {saving ? "Saving..." : "Add channel"}
        </button>
        <a href="/api/youtube/connect" className="btn btn-ghost text-sm">
          + Google account
        </a>
        <Link href="/dashboard/channel" className="btn btn-ghost text-sm">
          Cancel
        </Link>
      </div>
    </div>
  );
}
