"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function InstagramAccountStudio({
  account,
}: {
  account: {
    connected: boolean;
    username: string | null;
    name: string | null;
    profile_picture_url: string | null;
    followers_count: number;
    media_count: number;
    facebook_page_name?: string | null;
  } | null;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ig = search.get("ig");
    if (!ig) return;
    const map: Record<string, string> = {
      connected: "Instagram connected.",
      error: "OAuth cancelled or failed.",
      config: "Add INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET to env.",
      token_error: "Token exchange failed. Check Meta app credentials.",
      pages_error: "Could not load Facebook Pages.",
      no_business_account:
        "No Instagram Business account linked to your Facebook Page. Convert to Business and link a Page in Meta.",
      save_error: "Could not save account. Run migration 005/006.",
    };
    setMsg(map[ig] || ig);
  }, [search]);

  async function disconnect() {
    if (!confirm("Disconnect Instagram account?")) return;
    const res = await fetch("/api/instagram/disconnect", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Failed");
      return;
    }
    setMsg("Disconnected.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="rise">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Optional: connect an Instagram Business account only if you want one-click
          publish. Generation and download work without Connect — this studio is the
          HeyGen video generator.
        </p>
      </header>

      {msg && (
        <p className="text-sm" style={{ color: "#e1306c" }}>
          {msg}
        </p>
      )}

      <section className="panel rise space-y-4 p-6">
        {account?.connected ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              {account.profile_picture_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.profile_picture_url}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-sm">
                  IG
                </div>
              )}
              <div>
                <p className="text-lg font-semibold">
                  @{account.username || "instagram"}
                </p>
                <p className="text-sm text-[color:var(--muted)]">
                  {account.name || "Connected"}
                  {account.facebook_page_name
                    ? ` · Page: ${account.facebook_page_name}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center sm:max-w-xs">
              <div>
                <p className="text-xs text-[color:var(--muted)]">Followers</p>
                <p className="text-lg font-semibold">
                  {(account.followers_count || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-[color:var(--muted)]">Media</p>
                <p className="text-lg font-semibold">
                  {(account.media_count || 0).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/api/instagram/connect" className="btn btn-ghost text-sm">
                Reconnect
              </a>
              <button
                type="button"
                className="btn btn-ghost text-sm"
                style={{ color: "var(--danger)" }}
                onClick={disconnect}
              >
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-[color:var(--muted)]">
              <li>Instagram account must be Professional → Business</li>
              <li>Link it to a Facebook Page</li>
              <li>
                Create a Meta App with Instagram Graph + Facebook Login; set redirect
                to <code>/api/instagram/callback</code>
              </li>
              <li>
                Set <code>INSTAGRAM_APP_ID</code> / <code>INSTAGRAM_APP_SECRET</code> in
                env
              </li>
            </ol>
            <a href="/api/instagram/connect" className="btn btn-primary inline-flex">
              Connect Instagram
            </a>
          </>
        )}
      </section>
    </div>
  );
}
