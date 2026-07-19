"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type HeygenLook = {
  id: string;
  name: string;
  preview_image_url: string | null;
  preview_video_url: string | null;
  gender: string | null;
  avatar_type: string | null;
  source: string;
};

export function InstagramAvatarStudio({
  initial,
}: {
  initial: {
    heygen_avatar_id: string;
    heygen_avatar_name: string;
    heygen_background_mode: string;
    heygen_background_url: string;
    avatar_image_url: string;
    visual_mode: string;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [looks, setLooks] = useState<HeygenLook[]>([]);
  const [loadingLooks, setLoadingLooks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadLooks = useCallback(async () => {
    setLoadingLooks(true);
    setErr(null);
    try {
      const res = await fetch("/api/instagram/heygen/avatars");
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not load HeyGen styles");
        setLooks([]);
        return;
      }
      setLooks(data.avatars || []);
    } catch {
      setErr("Network error loading HeyGen styles");
    } finally {
      setLoadingLooks(false);
    }
  }, []);

  useEffect(() => {
    void loadLooks();
  }, [loadLooks]);

  function selectLook(look: HeygenLook) {
    setForm((p) => ({
      ...p,
      heygen_avatar_id: look.id,
      heygen_avatar_name: look.name,
      avatar_image_url: look.preview_image_url || p.avatar_image_url,
      visual_mode: "heygen",
    }));
    setMsg(`Selected style: ${look.name}`);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.heygen_avatar_id.trim()) {
      setErr("Select a HeyGen style below");
      return;
    }
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/instagram/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Save failed");
      return;
    }
    setMsg("Avatar style saved — Content will use this for generation.");
    router.refresh();
  }

  const selected = looks.find((l) => l.id === form.heygen_avatar_id);

  return (
    <div className="space-y-6">
      <header className="rise flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Avatar</h1>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted)]">
            Your HeyGen character and styles. Pick a look — Instagram Connect is not
            required. This studio is the HeyGen video generator.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={() => void loadLooks()}
          disabled={loadingLooks}
        >
          {loadingLooks ? "Loading…" : "Refresh from HeyGen"}
        </button>
      </header>

      {msg && <p className="text-sm text-[color:var(--success)]">{msg}</p>}
      {err && <p className="text-sm text-[color:var(--danger)]">{err}</p>}

      {/* Active avatar preview */}
      <section className="panel rise flex flex-wrap items-center gap-5 p-5">
        <div className="h-28 w-28 overflow-hidden rounded-2xl bg-black/40">
          {form.avatar_image_url || selected?.preview_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.avatar_image_url || selected?.preview_image_url || ""}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted)]">
              No preview
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">
            {form.heygen_avatar_name || selected?.name || "No style selected"}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-[color:var(--muted)]">
            {form.heygen_avatar_id || "—"}
          </p>
        </div>
      </section>

      {/* Styles grid from HeyGen API */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]">
          Your HeyGen styles
        </h2>
        {loadingLooks && (
          <p className="text-sm text-[color:var(--muted)]">Loading styles from HeyGen…</p>
        )}
        {!loadingLooks && looks.length === 0 && (
          <p className="panel p-6 text-sm text-[color:var(--muted)]">
            No styles returned. Create Photo Avatars / looks in HeyGen, set{" "}
            <code>HEYGEN_API_KEY</code> in web env, then Refresh.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {looks.map((look) => {
            const active = look.id === form.heygen_avatar_id;
            return (
              <button
                key={look.id}
                type="button"
                onClick={() => selectLook(look)}
                className="overflow-hidden rounded-xl border text-left transition"
                style={{
                  borderColor: active ? "#e1306c" : "var(--line)",
                  boxShadow: active ? "0 0 0 1px #e1306c" : undefined,
                  background: "var(--bg-elevated)",
                }}
              >
                <div className="aspect-[3/4] bg-black/30">
                  {look.preview_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={look.preview_image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[color:var(--muted)]">
                      {look.name.slice(0, 24)}
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-2.5">
                  <p className="line-clamp-1 text-sm font-medium">{look.name}</p>
                  <p className="text-[10px] uppercase text-[color:var(--muted)]">
                    {look.source}
                    {look.avatar_type ? ` · ${look.avatar_type}` : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <form onSubmit={onSubmit} className="panel rise space-y-4 p-6">
        <p className="text-sm text-[color:var(--muted)]">
          Or paste an ID manually if the API list misses a style.
        </p>
        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">HeyGen Avatar / Look ID</span>
          <input
            className="field font-mono text-xs"
            value={form.heygen_avatar_id}
            onChange={(e) =>
              setForm((p) => ({ ...p, heygen_avatar_id: e.target.value.trim() }))
            }
            placeholder="avatar or look id"
            required
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">Display name</span>
          <input
            className="field"
            value={form.heygen_avatar_name}
            onChange={(e) =>
              setForm((p) => ({ ...p, heygen_avatar_name: e.target.value }))
            }
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">Background</span>
          <select
            className="field"
            value={form.heygen_background_mode}
            onChange={(e) =>
              setForm((p) => ({ ...p, heygen_background_mode: e.target.value }))
            }
          >
            <option value="none">Avatar default</option>
            <option value="rotate">Rotate (color cycle later)</option>
            <option value="fixed">Fixed image URL</option>
          </select>
        </label>
        {form.heygen_background_mode === "fixed" && (
          <label className="block space-y-1.5 text-sm">
            <span className="text-[color:var(--muted)]">Background URL</span>
            <input
              className="field"
              value={form.heygen_background_url}
              onChange={(e) =>
                setForm((p) => ({ ...p, heygen_background_url: e.target.value }))
              }
            />
          </label>
        )}
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save active style"}
        </button>
      </form>
    </div>
  );
}
