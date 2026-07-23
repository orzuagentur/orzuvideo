"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const CREATE_URL = "https://www.youtube.com/create_channel";

/**
 * Shown when Google OAuth succeeds but the account has no YouTube channel.
 * YouTube API cannot create channels; we open Google's create flow and
 * auto-attach as soon as the channel appears.
 */
export function NoYoutubeChannelModal() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    if (searchParams.get("youtube") !== "no_channel") return;
    setOpen(true);
    setError(null);
    setWaiting(false);
    router.replace(pathname);
  }, [searchParams, pathname, router]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  if (!open) return null;

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setWaiting(false);
    setBusy(false);
  }

  async function tryAttach(): Promise<"ok" | "pending" | "transfer" | "error"> {
    const res = await fetch("/api/youtube/ensure-channel", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.error === "channel_owned") {
      const q = new URLSearchParams({
        youtube: "transfer",
        channelId: String(data.channelId || ""),
        title: String(data.channelTitle || "YouTube channel"),
        ...(data.thumbnail ? { thumb: String(data.thumbnail) } : {}),
        ...(data.ownerEmail ? { from: String(data.ownerEmail) } : {}),
      });
      setOpen(false);
      stopPolling();
      router.push(`/dashboard?${q.toString()}`);
      return "transfer";
    }
    if (res.ok && data.ok) {
      stopPolling();
      setOpen(false);
      router.push("/dashboard/channel");
      router.refresh();
      return "ok";
    }
    if (data.pending) return "pending";
    setError(data.error || "Could not attach channel");
    stopPolling();
    return "error";
  }

  function startPolling() {
    setWaiting(true);
    setBusy(true);
    setError(null);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void (async () => {
        if (popupRef.current && popupRef.current.closed) {
          // User closed popup — one last check then keep waiting a bit
        }
        const status = await tryAttach();
        if (status === "ok" || status === "transfer" || status === "error") {
          try {
            popupRef.current?.close();
          } catch {
            /* ignore */
          }
        }
      })();
    }, 2500);
    void tryAttach();
  }

  function onCreate() {
    setError(null);
    const popup = window.open(
      CREATE_URL,
      "orzuai_yt_create",
      "width=980,height=720,menubar=no,toolbar=no,noopener,noreferrer",
    );
    popupRef.current = popup;
    if (!popup) {
      // Popup blocked — open same tab fallback instructions
      window.open(CREATE_URL, "_blank", "noopener,noreferrer");
    }
    startPolling();
  }

  async function onCancel() {
    stopPolling();
    setBusy(true);
    try {
      await fetch("/api/youtube/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
    } catch {
      /* ignore */
    }
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="yt-no-channel-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-6 shadow-2xl">
        <h2
          id="yt-no-channel-title"
          className="font-[family-name:var(--font-syne)] text-lg font-bold"
        >
          No YouTube channel on this account
        </h2>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          This Google account does not have a YouTube channel yet. Create one
          and we will connect it to OrzuAi automatically.
        </p>

        {waiting && (
          <p className="mt-3 text-sm text-[color:var(--accent)]">
            Waiting for YouTube… finish creating the channel in the Google
            window. This screen updates by itself.
          </p>
        )}

        {error && (
          <p className="mt-3 text-sm text-[color:var(--danger)]">{error}</p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn border border-[color:var(--line)] bg-transparent px-4 text-sm"
            disabled={busy && !waiting}
            onClick={() => void onCancel()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary px-5 text-sm"
            disabled={busy && waiting}
            onClick={onCreate}
          >
            {waiting ? "Waiting…" : "Create channel"}
          </button>
        </div>
      </div>
    </div>
  );
}
