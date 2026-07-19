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

export function ChannelPicker() {
  const router = useRouter();
  const [channels, setChannels] = useState<YtChannel[]>([]);
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
        setError(data.error || "Could not load channels");
        return;
      }
      setChannels(data.channels || []);
      setSelectedId(data.selectedChannelId || data.channels?.[0]?.id || null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirm() {
    if (!selectedId) return;
    const channel = channels.find((c) => c.id === selectedId);
    if (!channel) return;

    setSaving(true);
    setError(null);
    const res = await fetch("/api/youtube/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: channel.id,
        channelTitle: channel.title,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Could not save channel");
      return;
    }

    router.push("/dashboard?youtube=connected");
    router.refresh();
  }

  return (
    <div className="panel rise space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Choose YouTube channel</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Pick which channel will receive your Shorts. If your channel is
          missing, reconnect and select the correct Brand Account in Google.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-[color:var(--muted)]">Loading channels…</p>
      )}

      {error && (
        <div className="space-y-3">
          <p className="text-sm text-[color:var(--danger)]">{error}</p>
          <a href="/api/youtube/connect" className="btn btn-primary text-sm">
            Reconnect YouTube
          </a>
        </div>
      )}

      {!loading && !error && channels.length === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-[color:var(--muted)]">
            No channels found on this Google account.
          </p>
          <a href="/api/youtube/connect" className="btn btn-primary text-sm">
            Try another Google account
          </a>
        </div>
      )}

      <ul className="space-y-3">
        {channels.map((channel) => {
          const active = selectedId === channel.id;
          return (
            <li key={channel.id}>
              <button
                type="button"
                onClick={() => setSelectedId(channel.id)}
                className="flex w-full items-center gap-4 rounded-xl border p-4 text-left transition"
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
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--bg-elevated)] text-sm">
                    YT
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{channel.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-[color:var(--muted)]">
                    {channel.customUrl || channel.id}
                  </span>
                </span>
                <span
                  className="h-4 w-4 rounded-full border"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--line)",
                    background: active ? "var(--accent)" : "transparent",
                  }}
                />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          className="btn btn-primary"
          disabled={!selectedId || saving || loading}
          onClick={confirm}
        >
          {saving ? "Saving…" : "Use this channel"}
        </button>
        <Link href="/dashboard" className="btn btn-ghost">
          Cancel
        </Link>
        <a href="/api/youtube/connect" className="btn btn-ghost text-sm">
          Switch Google account
        </a>
      </div>
    </div>
  );
}
