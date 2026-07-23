"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type TransferState = {
  channelId: string;
  title: string;
  thumb: string | null;
  fromEmail: string | null;
} | null;

/** Modal when OAuth/connect finds the YouTube channel on another OrzuAi account. */
export function ChannelTransferModal() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<TransferState>(null);
  const [busy, setBusy] = useState<"transfer" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("youtube") !== "transfer") return;
    const channelId = searchParams.get("channelId") || "";
    if (!channelId) return;
    setState({
      channelId,
      title: searchParams.get("title") || "YouTube channel",
      thumb: searchParams.get("thumb"),
      fromEmail: searchParams.get("from"),
    });
    setError(null);
    router.replace(pathname);
  }, [searchParams, pathname, router]);

  if (!state) return null;

  async function onCancel() {
    setBusy("cancel");
    setError(null);
    try {
      await fetch("/api/youtube/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: state!.channelId, action: "cancel" }),
      });
    } catch {
      /* ignore */
    }
    setBusy(null);
    setState(null);
    router.refresh();
  }

  async function onTransfer() {
    setBusy("transfer");
    setError(null);
    const res = await fetch("/api/youtube/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: state!.channelId,
        action: "transfer",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Transfer failed");
      return;
    }
    setState(null);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="yt-transfer-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          {state.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.thumb}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-black/40 text-xs">
              YT
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2
              id="yt-transfer-title"
              className="font-[family-name:var(--font-syne)] text-lg font-bold"
            >
              Channel connected to another account
            </h2>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              <span className="font-semibold text-[color:var(--fg)]">
                {state.title}
              </span>{" "}
              is already linked to another OrzuAi account
              {state.fromEmail ? (
                <>
                  {" "}
                  (<span className="tabular-nums">{state.fromEmail}</span>)
                </>
              ) : null}
              . Do you want to transfer it here? AI Training, schedule, montage
              settings, and jobs will move. The channel will be disconnected from
              the old account.
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-[color:var(--danger)]">{error}</p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn border border-[color:var(--line)] bg-transparent px-4 text-sm"
            disabled={busy !== null}
            onClick={() => void onCancel()}
          >
            {busy === "cancel" ? "…" : "Cancel"}
          </button>
          <button
            type="button"
            className="btn btn-primary px-5 text-sm"
            disabled={busy !== null}
            onClick={() => void onTransfer()}
          >
            {busy === "transfer" ? "Transferring…" : "Transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}
