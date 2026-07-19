"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
    setMsg("Avatar settings saved for Instagram.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="rise">
        <h1 className="text-2xl font-semibold">Avatar</h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted)]">
          One character for this Instagram blogger. Create the Photo Avatar once in
          HeyGen, paste the ID here. Every Reel reuses the same face.
        </p>
      </header>

      {msg && <p className="text-sm text-[color:var(--success)]">{msg}</p>}
      {err && <p className="text-sm text-[color:var(--danger)]">{err}</p>}

      <form onSubmit={onSubmit} className="panel rise space-y-4 p-6">
        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">HeyGen Avatar ID</span>
          <input
            className="field"
            value={form.heygen_avatar_id}
            onChange={(e) =>
              setForm((p) => ({ ...p, heygen_avatar_id: e.target.value.trim() }))
            }
            placeholder="e.g. abc123..."
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
            placeholder="My IG blogger"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">Visual mode</span>
          <select
            className="field"
            value={form.visual_mode}
            onChange={(e) => setForm((p) => ({ ...p, visual_mode: e.target.value }))}
          >
            <option value="heygen">HeyGen talking avatar</option>
            <option value="stock">Stock B-roll (later)</option>
          </select>
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
            <option value="rotate">Rotate locations</option>
            <option value="fixed">Fixed background URL</option>
            <option value="none">Avatar default</option>
          </select>
        </label>

        {form.heygen_background_mode === "fixed" && (
          <label className="block space-y-1.5 text-sm">
            <span className="text-[color:var(--muted)]">Background image URL</span>
            <input
              className="field"
              value={form.heygen_background_url}
              onChange={(e) =>
                setForm((p) => ({ ...p, heygen_background_url: e.target.value }))
              }
              placeholder="https://..."
            />
          </label>
        )}

        <label className="block space-y-1.5 text-sm">
          <span className="text-[color:var(--muted)]">Reference image URL (optional)</span>
          <input
            className="field"
            value={form.avatar_image_url}
            onChange={(e) =>
              setForm((p) => ({ ...p, avatar_image_url: e.target.value }))
            }
            placeholder="Public URL of the face photo"
          />
        </label>

        <div className="rounded-xl border border-[color:var(--line)] p-4 text-sm text-[color:var(--muted)]">
          <p className="font-medium text-[color:var(--fg)]">Worker keys</p>
          <p className="mt-1">
            Put <code>HEYGEN_API_KEY</code> in <code>worker/.env</code>. Avatar ID can
            live here in the DB and/or as <code>HEYGEN_AVATAR_ID</code> fallback.
          </p>
        </div>

        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save avatar"}
        </button>
      </form>
    </div>
  );
}
